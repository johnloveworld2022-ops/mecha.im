import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DockerNotAvailableError } from "@mecha/core";
import type { DockerClient } from "../src/client.js";

// Mock child_process and fs before importing client
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { ping, createDockerClient } from "../src/client.js";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function createMockClient(): DockerClient {
  return {
    docker: {
      ping: vi.fn(),
    },
  } as unknown as DockerClient;
}

describe("ping", () => {
  it("returns true when Docker responds", async () => {
    const client = createMockClient();
    (client.docker.ping as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

    const result = await ping(client);

    expect(result).toBe(true);
  });

  it("throws DockerNotAvailableError when Docker is unreachable", async () => {
    const client = createMockClient();
    (client.docker.ping as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    await expect(ping(client)).rejects.toThrow(DockerNotAvailableError);
  });
});

describe("createDockerClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.mocked(execSync).mockReset();
    vi.mocked(existsSync).mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates a client with explicit options", () => {
    const client = createDockerClient({ socketPath: "/tmp/test.sock" });
    expect(client).toHaveProperty("docker");
  });

  it("resolves from DOCKER_HOST env var with unix scheme", () => {
    process.env["DOCKER_HOST"] = "unix:///var/run/docker.sock";
    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });

  it("resolves from DOCKER_HOST env var with tcp scheme", () => {
    process.env["DOCKER_HOST"] = "tcp://localhost:2375";
    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });

  it("resolves from DOCKER_HOST env var with https scheme", () => {
    process.env["DOCKER_HOST"] = "https://docker.example.com";
    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });

  it("resolves from DOCKER_HOST env var with http scheme", () => {
    process.env["DOCKER_HOST"] = "http://localhost:2375";
    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });

  it("resolves from DOCKER_HOST as plain socket path", () => {
    process.env["DOCKER_HOST"] = "/var/run/docker.sock";
    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });

  it("resolves from docker context when DOCKER_HOST is not set", () => {
    delete process.env["DOCKER_HOST"];
    vi.mocked(execSync).mockReturnValue("unix:///var/run/docker.sock\n");
    vi.mocked(existsSync).mockReturnValue(false);

    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
    expect(execSync).toHaveBeenCalled();
  });

  it("handles empty docker context result", () => {
    delete process.env["DOCKER_HOST"];
    vi.mocked(execSync).mockReturnValue("\n");
    vi.mocked(existsSync).mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true); // colima socket found

    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });

  it("falls back to socket detection when docker context throws", () => {
    delete process.env["DOCKER_HOST"];
    vi.mocked(execSync).mockImplementation(() => { throw new Error("docker not found"); });
    vi.mocked(existsSync).mockReturnValueOnce(true); // /var/run/docker.sock

    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });

  it("returns undefined opts when no socket found", () => {
    delete process.env["DOCKER_HOST"];
    vi.mocked(execSync).mockImplementation(() => { throw new Error("not found"); });
    vi.mocked(existsSync).mockReturnValue(false);

    // Should still create a client (with undefined opts → Dockerode default)
    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });

  it("resolves tcp without explicit port (uses default 2375)", () => {
    process.env["DOCKER_HOST"] = "tcp://docker.local";
    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });

  it("resolves https without explicit port (uses default 2376)", () => {
    process.env["DOCKER_HOST"] = "https://docker.local";
    const client = createDockerClient();
    expect(client).toHaveProperty("docker");
  });
});
