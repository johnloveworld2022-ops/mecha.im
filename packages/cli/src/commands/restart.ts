import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { stopContainer, startContainer } from "@mecha/docker";
import { containerName } from "@mecha/core";
import type { MechaId } from "@mecha/core";

export function registerRestartCommand(
  parent: Command,
  deps: CommandDeps,
): void {
  parent
    .command("restart <id>")
    .description("Restart a Mecha by ID")
    .action(async (id: string) => {
      const { dockerClient, formatter } = deps;
      const name = containerName(id as MechaId);
      try {
        await stopContainer(dockerClient, name);
        await startContainer(dockerClient, name);
        formatter.success(`Mecha '${id}' restarted.`);
      } catch (err) {
        formatter.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
