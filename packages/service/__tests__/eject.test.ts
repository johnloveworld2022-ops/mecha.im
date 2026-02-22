import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DockerClient } from "@mecha/docker";
import { mechaEject } from "../src/eject.js";
import { EjectFileExistsError } from "@mecha/contracts";
import { DEFAULTS, LABELS, MOUNT_PATHS, SECURITY } from "@mecha/core";

// --- Mocks ---
const mockInspectContainer = vi.fn();

vi.mock("@mecha/docker", () => ({
  inspectContainer: (...a: unknown[]) => mockInspectContainer(...a),
}));

const client = {} as DockerClient;

function makeInspectInfo(overrides: {
  projectPath?: string;
  hostPort?: string;
  image?: string;
  env?: string[];
  volumeName?: string;
} = {}) {
  const projectPath = overrides.projectPath ?? "/tmp/test-project";
  return {
    Config: {
      Image: overrides.image ?? DEFAULTS.IMAGE,
      Labels: {
        [LABELS.IS_MECHA]: "true",
        [LABELS.MECHA_ID]: "mx-test-abc123",
        [LABELS.MECHA_PATH]: projectPath,
      },
      Env: overrides.env ?? [
        "MECHA_ID=mx-test-abc123",
        "MECHA_AUTH_TOKEN=tok-secret-123",
        "MECHA_PERMISSION_MODE=default",
        "PATH=/usr/bin",
        "HOME=/home/mecha",
      ],
    },
    NetworkSettings: {
      Ports: overrides.hostPort !== undefined ? {
        [`${DEFAULTS.CONTAINER_PORT}/tcp`]: overrides.hostPort ? [{ HostPort: overrides.hostPort }] : null,
      } : {
        [`${DEFAULTS.CONTAINER_PORT}/tcp`]: [{ HostPort: "7700" }],
      },
    },
    Mounts: [
      { Destination: MOUNT_PATHS.WORKSPACE, Source: projectPath },
      { Destination: MOUNT_PATHS.STATE, Name: overrides.volumeName ?? "mecha-state-mx-test-abc123" },
    ],
  };
}

describe("mechaEject", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), "eject-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates valid docker-compose.yml with correct image, ports, volumes, security", async () => {
    const info = makeInspectInfo({ projectPath: tempDir });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    expect(result.composePath).toBe(join(tempDir, "docker-compose.yml"));
    expect(result.envPath).toBe(join(tempDir, ".env"));

    const compose = readFileSync(result.composePath, "utf-8");
    expect(compose).toContain(`image: ${DEFAULTS.IMAGE}`);
    expect(compose).toContain("container_name: mecha-mx-test-abc123");
    expect(compose).toContain("127.0.0.1:7700:3000");
    expect(compose).toContain(`source: .`);
    expect(compose).toContain(`target: ${MOUNT_PATHS.WORKSPACE}`);
    expect(compose).toContain("mecha-state-mx-test-abc123:/var/lib/mecha");
    expect(compose).toContain(`${SECURITY.SECURITY_OPT[0]}`);
    expect(compose).toContain("cap_drop:");
    expect(compose).toContain(`- ${SECURITY.CAP_DROP[0]}`);
    expect(compose).toContain("read_only: true");
    expect(compose).toContain(`user: "${SECURITY.UID}:${SECURITY.GID}"`);
    expect(compose).toContain("tmpfs:");
  });

  it("generates .env with secret vars, non-secrets inline in compose", async () => {
    const env = [
      "MECHA_ID=mx-test-abc123",
      "MECHA_AUTH_TOKEN=secret-tok",
      "CLAUDE_CODE_OAUTH_TOKEN=oauth-secret",
      "ANTHROPIC_API_KEY=sk-ant-secret",
      "MECHA_PERMISSION_MODE=default",
      "MY_CUSTOM_VAR=hello",
      "PATH=/usr/bin",
    ];
    const info = makeInspectInfo({ projectPath: tempDir, env });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    const dotEnv = readFileSync(result.envPath, "utf-8");
    expect(dotEnv).toContain("MECHA_AUTH_TOKEN=secret-tok");
    expect(dotEnv).toContain("CLAUDE_CODE_OAUTH_TOKEN=oauth-secret");
    expect(dotEnv).toContain("ANTHROPIC_API_KEY=sk-ant-secret");

    const compose = readFileSync(result.composePath, "utf-8");
    // Secrets referenced as ${VAR} in compose
    expect(compose).toContain('MECHA_AUTH_TOKEN: "${MECHA_AUTH_TOKEN}"');
    expect(compose).toContain('CLAUDE_CODE_OAUTH_TOKEN: "${CLAUDE_CODE_OAUTH_TOKEN}"');
    // Non-secrets inline
    expect(compose).toContain('MECHA_PERMISSION_MODE: "default"');
    expect(compose).toContain('MY_CUSTOM_VAR: "hello"');
    // PATH excluded
    expect(compose).not.toContain("PATH:");
  });

  it("handles container with no port binding", async () => {
    const info = makeInspectInfo({ projectPath: tempDir, hostPort: "" });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    const compose = readFileSync(result.composePath, "utf-8");
    expect(compose).not.toContain("ports:");
    expect(result.composePath).toBe(join(tempDir, "docker-compose.yml"));
  });

  it("handles container with no optional env vars", async () => {
    const env = [
      "MECHA_ID=mx-test-abc123",
      "MECHA_AUTH_TOKEN=tok-123",
      "PATH=/usr/bin",
    ];
    const info = makeInspectInfo({ projectPath: tempDir, env });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    const dotEnv = readFileSync(result.envPath, "utf-8");
    expect(dotEnv).toContain("MECHA_AUTH_TOKEN=tok-123");
    expect(dotEnv).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(dotEnv).not.toContain("ANTHROPIC_API_KEY");
  });

  it("throws EjectFileExistsError when compose file exists and force=false", async () => {
    writeFileSync(join(tempDir, "docker-compose.yml"), "existing");
    const info = makeInspectInfo({ projectPath: tempDir });
    mockInspectContainer.mockResolvedValueOnce(info);

    await expect(mechaEject(client, { id: "mx-test-abc123" }))
      .rejects.toThrow(EjectFileExistsError);
  });

  it("throws EjectFileExistsError when .env file exists and force=false", async () => {
    writeFileSync(join(tempDir, ".env"), "existing");
    const info = makeInspectInfo({ projectPath: tempDir });
    mockInspectContainer.mockResolvedValueOnce(info);

    await expect(mechaEject(client, { id: "mx-test-abc123" }))
      .rejects.toThrow(EjectFileExistsError);
  });

  it("succeeds with force=true when files exist", async () => {
    writeFileSync(join(tempDir, "docker-compose.yml"), "old");
    writeFileSync(join(tempDir, ".env"), "old");
    const info = makeInspectInfo({ projectPath: tempDir });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123", force: true });

    expect(result.composePath).toBe(join(tempDir, "docker-compose.yml"));
    const compose = readFileSync(result.composePath, "utf-8");
    expect(compose).toContain("image:");
    expect(compose).not.toBe("old");
  });

  it("writes files to correct project path from label", async () => {
    const info = makeInspectInfo({ projectPath: tempDir });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    expect(result.composePath.startsWith(tempDir)).toBe(true);
    expect(result.envPath.startsWith(tempDir)).toBe(true);
    expect(existsSync(result.composePath)).toBe(true);
    expect(existsSync(result.envPath)).toBe(true);
  });

  it("uses relative path source: . for workspace bind in compose", async () => {
    const info = makeInspectInfo({ projectPath: tempDir });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    const compose = readFileSync(result.composePath, "utf-8");
    expect(compose).toContain("source: .");
    expect(compose).not.toContain(`source: ${tempDir}`);
  });

  it("handles container with missing Config.Env (undefined)", async () => {
    const info = makeInspectInfo({ projectPath: tempDir });
    info.Config.Env = undefined as any;
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    const compose = readFileSync(result.composePath, "utf-8");
    expect(compose).toContain("image:");
    const dotEnv = readFileSync(result.envPath, "utf-8");
    expect(dotEnv).toContain("# Generated by:");
  });

  it("skips malformed env entries without equals sign", async () => {
    const env = [
      "MECHA_ID=mx-test-abc123",
      "MECHA_AUTH_TOKEN=tok-123",
      "MALFORMED_NO_EQUALS",
      "=empty-key",
      "PATH=/usr/bin",
    ];
    const info = makeInspectInfo({ projectPath: tempDir, env });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    const compose = readFileSync(result.composePath, "utf-8");
    expect(compose).not.toContain("MALFORMED_NO_EQUALS");
    expect(compose).not.toContain("=empty-key");
  });

  it("escapes special characters in env values for YAML and .env", async () => {
    const env = [
      "MECHA_ID=mx-test-abc123",
      'MECHA_AUTH_TOKEN=tok-with"quotes',
      'MY_VAR=value with spaces and $dollar',
      "PATH=/usr/bin",
    ];
    const info = makeInspectInfo({ projectPath: tempDir, env });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    const dotEnv = readFileSync(result.envPath, "utf-8");
    // Secret with quotes should be escaped in .env
    expect(dotEnv).toContain('MECHA_AUTH_TOKEN="tok-with\\"quotes"');

    const compose = readFileSync(result.composePath, "utf-8");
    // User var with $ should use $$ to escape docker compose substitution
    expect(compose).toContain('MY_VAR: "value with spaces and $$dollar"');
  });

  it("throws EjectFileExistsError via wx flag when .env exists (TOCTOU-safe)", async () => {
    // Write only .env, not compose — tests the .env EEXIST path specifically
    const info = makeInspectInfo({ projectPath: tempDir });
    mockInspectContainer.mockResolvedValueOnce(info);
    // Pre-create .env after compose would be written
    writeFileSync(join(tempDir, ".env"), "existing");

    await expect(mechaEject(client, { id: "mx-test-abc123" }))
      .rejects.toThrow(EjectFileExistsError);
  });

  it("re-throws non-EEXIST errors from compose writeFile", async () => {
    // Point to a non-existent directory — writeFile will throw ENOENT, not EEXIST
    const badPath = join(tempDir, "nonexistent-dir");
    const info = makeInspectInfo({ projectPath: badPath });
    mockInspectContainer.mockResolvedValueOnce(info);

    await expect(mechaEject(client, { id: "mx-test-abc123" }))
      .rejects.toThrow(/ENOENT/);
  });


  it("includes MECHA_OTP in .env when present", async () => {
    const env = [
      "MECHA_ID=mx-test-abc123",
      "MECHA_AUTH_TOKEN=tok-123",
      "MECHA_OTP=otp-secret",
      "PATH=/usr/bin",
    ];
    const info = makeInspectInfo({ projectPath: tempDir, env });
    mockInspectContainer.mockResolvedValueOnce(info);

    const result = await mechaEject(client, { id: "mx-test-abc123" });

    const dotEnv = readFileSync(result.envPath, "utf-8");
    expect(dotEnv).toContain("MECHA_OTP=otp-secret");

    const compose = readFileSync(result.composePath, "utf-8");
    expect(compose).toContain('MECHA_OTP: "${MECHA_OTP}"');
  });
});
