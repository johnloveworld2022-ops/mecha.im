/**
 * Integration test for the Docker image.
 *
 * This test builds the mecha-runtime Docker image and verifies
 * that /healthz responds correctly. Requires Docker to be available.
 *
 * Run with: pnpm --filter @mecha/runtime test -- --testPathPattern integration
 *
 * Skipped by default in CI — enable by setting MECHA_INTEGRATION=1
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";

const SKIP = false;
const IMAGE_NAME = "mecha-runtime:test";
const CONTAINER_NAME = "mecha-runtime-integration-test";
const HOST_PORT = 7799;

function run(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", timeout: 120_000 }).trim();
}

describe.skipIf(SKIP)("Docker image integration", () => {
  beforeAll(() => {
    // Build the image from project root
    const root = new URL("../../../../", import.meta.url).pathname;
    run(
      `docker build -f ${root}Dockerfile.mecha-runtime -t ${IMAGE_NAME} ${root}`,
    );

    // Start container
    run(
      `docker run -d --name ${CONTAINER_NAME} -p ${HOST_PORT}:3000 ` +
        `-e MECHA_ID=mx-test-integration ` +
        `--read-only --tmpfs /tmp:rw,noexec,nosuid ` +
        `--tmpfs /var/lib/mecha:rw ` +
        `${IMAGE_NAME}`,
    );

    // Wait for container to be ready
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const result = run(
          `curl -sf http://localhost:${HOST_PORT}/healthz 2>/dev/null`,
        );
        if (result.includes("ok")) {
          ready = true;
          break;
        }
      } catch {
        // Not ready yet
      }
      execSync("sleep 1");
    }
    if (!ready) {
      throw new Error("Container did not become ready in 30 seconds");
    }
  }, 180_000);

  afterAll(() => {
    try {
      run(`docker rm -f ${CONTAINER_NAME}`);
    } catch {
      // Ignore cleanup errors
    }
    try {
      run(`docker rmi ${IMAGE_NAME}`);
    } catch {
      // Ignore cleanup errors
    }
  });

  it("/healthz returns 200 with status ok", async () => {
    const res = await fetch(`http://localhost:${HOST_PORT}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  it("/info returns runtime info", async () => {
    const res = await fetch(`http://localhost:${HOST_PORT}/info`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("running");
    expect(body.version).toBeDefined();
  });

  it("container runs as non-root user", () => {
    const userId = run(`docker exec ${CONTAINER_NAME} id -u`);
    expect(userId).toBe("1000");
  });
});
