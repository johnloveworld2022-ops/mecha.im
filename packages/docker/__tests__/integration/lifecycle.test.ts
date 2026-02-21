import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createDockerClient, ping } from "../../src/client.js";
import {
  createContainer,
  getContainerPort,
  startContainer,
  stopContainer,
  removeContainer,
  inspectContainer,
  listMechaContainers,
  getContainerLogs,
  execInContainer,
} from "../../src/container.js";
import { ensureNetwork, removeNetwork } from "../../src/network.js";
import { ensureVolume, removeVolume } from "../../src/volume.js";
import type { DockerClient } from "../../src/client.js";
import type { MechaId } from "@mecha/core";
import { DEFAULTS } from "@mecha/core";

const SKIP = !process.env.INTEGRATION;
const TEST_IMAGE = "alpine:latest";
const TEST_NETWORK = DEFAULTS.NETWORK;
const TEST_PREFIX = "mecha-inttest";

/** Generate a unique test container name */
function testName(suffix: string): string {
  return `${TEST_PREFIX}-${suffix}-${Date.now()}`;
}

describe.skipIf(SKIP)("Docker integration: lifecycle", () => {
  let client: DockerClient;
  const cleanupContainers: string[] = [];
  const cleanupVolumes: string[] = [];

  beforeAll(async () => {
    client = createDockerClient();
    await ping(client);
    await ensureNetwork(client, TEST_NETWORK);
  });

  afterAll(async () => {
    // Best-effort cleanup
    for (const name of cleanupContainers) {
      try { await removeContainer(client, name, true); } catch { /* ignore */ }
    }
    for (const vol of cleanupVolumes) {
      try { await removeVolume(client, vol); } catch { /* ignore */ }
    }
  });

  it("full lifecycle: create → start → inspect → stop → remove", { timeout: 15000 }, async () => {
    const cName = testName("lifecycle");
    const vName = `${cName}-state`;
    cleanupContainers.push(cName);
    cleanupVolumes.push(vName);

    await ensureVolume(client, vName);

    await createContainer(client, {
      containerName: cName,
      image: TEST_IMAGE,
      mechaId: "mx-inttest-lc" as MechaId,
      projectPath: "/tmp",
      volumeName: vName,
      hostPort: 17700,
      env: ["MECHA_AUTH_TOKEN=test123"],
      cmd: ["sleep", "infinity"],
    });

    await startContainer(client, cName);

    const info = await inspectContainer(client, cName);
    expect(info.State?.Running).toBe(true);

    await stopContainer(client, cName, 5);

    const stoppedInfo = await inspectContainer(client, cName);
    expect(stoppedInfo.State?.Running).toBe(false);

    await removeContainer(client, cName, true);
    // Remove from cleanup since we already removed it
    cleanupContainers.pop();
  });

  it("create with explicit hostPort → inspect returns that port", async () => {
    const cName = testName("port-explicit");
    const vName = `${cName}-state`;
    cleanupContainers.push(cName);
    cleanupVolumes.push(vName);

    await ensureVolume(client, vName);
    await createContainer(client, {
      containerName: cName,
      image: TEST_IMAGE,
      mechaId: "mx-inttest-pe" as MechaId,
      projectPath: "/tmp",
      volumeName: vName,
      hostPort: 17788,
      cmd: ["sleep", "infinity"],
    });

    await startContainer(client, cName);

    const port = await getContainerPort(client, cName);
    expect(port).toBe(17788);
  });

  it("create with hostPort omitted → Docker assigns a port > 0", async () => {
    const cName = testName("port-dynamic");
    const vName = `${cName}-state`;
    cleanupContainers.push(cName);
    cleanupVolumes.push(vName);

    await ensureVolume(client, vName);
    await createContainer(client, {
      containerName: cName,
      image: TEST_IMAGE,
      mechaId: "mx-inttest-pd" as MechaId,
      projectPath: "/tmp",
      volumeName: vName,
      // hostPort omitted — Docker picks one
      cmd: ["sleep", "infinity"],
    });

    await startContainer(client, cName);

    const port = await getContainerPort(client, cName);
    expect(port).toBeDefined();
    expect(port).toBeGreaterThan(0);
  });

  it("listMechaContainers returns created containers", async () => {
    const cName1 = testName("list-a");
    const cName2 = testName("list-b");
    const vName1 = `${cName1}-state`;
    const vName2 = `${cName2}-state`;
    cleanupContainers.push(cName1, cName2);
    cleanupVolumes.push(vName1, vName2);

    await ensureVolume(client, vName1);
    await ensureVolume(client, vName2);

    await createContainer(client, {
      containerName: cName1,
      image: TEST_IMAGE,
      mechaId: "mx-inttest-la" as MechaId,
      projectPath: "/tmp",
      volumeName: vName1,
      hostPort: 17701,
      cmd: ["sleep", "infinity"],
    });
    await createContainer(client, {
      containerName: cName2,
      image: TEST_IMAGE,
      mechaId: "mx-inttest-lb" as MechaId,
      projectPath: "/tmp",
      volumeName: vName2,
      hostPort: 17702,
      cmd: ["sleep", "infinity"],
    });

    const containers = await listMechaContainers(client);
    const names = containers.map((c) => c.Names[0]?.replace(/^\//, ""));
    expect(names).toContain(cName1);
    expect(names).toContain(cName2);
  });

  it("execInContainer returns command output", async () => {
    const cName = testName("exec");
    const vName = `${cName}-state`;
    cleanupContainers.push(cName);
    cleanupVolumes.push(vName);

    await ensureVolume(client, vName);
    await createContainer(client, {
      containerName: cName,
      image: TEST_IMAGE,
      mechaId: "mx-inttest-ex" as MechaId,
      projectPath: "/tmp",
      volumeName: vName,
      hostPort: 17703,
      cmd: ["sleep", "infinity"],
    });

    await startContainer(client, cName);

    const result = await execInContainer(client, cName, ["echo", "hello"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("hello");
  });

  it("getContainerLogs returns log content", async () => {
    const cName = testName("logs");
    const vName = `${cName}-state`;
    cleanupContainers.push(cName);
    cleanupVolumes.push(vName);

    await ensureVolume(client, vName);
    await createContainer(client, {
      containerName: cName,
      image: TEST_IMAGE,
      mechaId: "mx-inttest-log" as MechaId,
      projectPath: "/tmp",
      volumeName: vName,
      hostPort: 17704,
      env: ["MECHA_AUTH_TOKEN=test"],
      cmd: ["sleep", "infinity"],
    });

    await startContainer(client, cName);

    // Wait a moment for the container to produce output
    await new Promise((r) => setTimeout(r, 500));

    const stream = await getContainerLogs(client, cName, { follow: false, tail: 10 });
    expect(stream).toBeDefined();
  });

  it("getContainerPort on running container returns bound port", async () => {
    const cName = testName("portres");
    const vName = `${cName}-state`;
    cleanupContainers.push(cName);
    cleanupVolumes.push(vName);

    await ensureVolume(client, vName);
    await createContainer(client, {
      containerName: cName,
      image: TEST_IMAGE,
      mechaId: "mx-inttest-pr" as MechaId,
      projectPath: "/tmp",
      volumeName: vName,
      hostPort: 17705,
      cmd: ["sleep", "infinity"],
    });

    await startContainer(client, cName);

    const port = await getContainerPort(client, cName);
    expect(port).toBe(17705);
  });
});
