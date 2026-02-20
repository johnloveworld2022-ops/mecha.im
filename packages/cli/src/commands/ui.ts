import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { inspectContainer } from "@mecha/docker";
import { containerName, DEFAULTS } from "@mecha/core";
import type { MechaId } from "@mecha/core";

export function registerUiCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("ui <id>")
    .description("Print the UI URL for a Mecha")
    .action(async (id: string) => {
      const { dockerClient, formatter } = deps;
      const cName = containerName(id as MechaId);

      try {
        const info = await inspectContainer(dockerClient, cName);
        const portKey = `${DEFAULTS.CONTAINER_PORT}/tcp`;
        const bindings =
          info.NetworkSettings.Ports[portKey];
        const hostPort = bindings?.[0]?.HostPort;

        if (hostPort) {
          const url = `http://127.0.0.1:${hostPort}`;
          formatter.info(url);
        } else {
          formatter.error("No port binding found for this Mecha.");
          process.exitCode = 1;
        }
      } catch (err) {
        formatter.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
