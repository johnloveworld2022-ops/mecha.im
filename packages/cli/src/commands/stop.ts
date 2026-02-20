import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { stopContainer } from "@mecha/docker";
import { containerName } from "@mecha/core";
import type { MechaId } from "@mecha/core";

export function registerStopCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("stop <id>")
    .description("Stop a Mecha by ID")
    .action(async (id: string) => {
      const { dockerClient, formatter } = deps;
      try {
        await stopContainer(dockerClient, containerName(id as MechaId));
        formatter.success(`Mecha '${id}' stopped.`);
      } catch (err) {
        formatter.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
