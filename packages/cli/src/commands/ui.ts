import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { errMsg } from "../types.js";
import { inspectContainer } from "@mecha/docker";
import { containerName, DEFAULTS, type MechaId } from "@mecha/core";

/** Resolve the host port for a mecha container */
export async function resolveHostPort(deps: CommandDeps, id: string): Promise<string | undefined> {
  const info = await inspectContainer(deps.dockerClient, containerName(id as MechaId));
  return info.NetworkSettings.Ports[`${DEFAULTS.CONTAINER_PORT}/tcp`]?.[0]?.HostPort;
}

export function registerUiCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("ui <id>")
    .description("Print the UI URL for a Mecha")
    .action(async (id: string) => {
      const { formatter } = deps;
      try {
        const hostPort = await resolveHostPort(deps, id);
        if (hostPort) {
          formatter.info(`http://127.0.0.1:${hostPort}`);
        } else {
          formatter.error("No port binding found for this Mecha.");
          process.exitCode = 1;
        }
      } catch (err) {
        formatter.error(errMsg(err));
        process.exitCode = 1;
      }
    });
}
