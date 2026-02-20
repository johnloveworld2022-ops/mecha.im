import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { startContainer } from "@mecha/docker";
import { containerName } from "@mecha/core";
import type { MechaId } from "@mecha/core";

export function registerStartCommand(
  parent: Command,
  deps: CommandDeps,
): void {
  parent
    .command("start <id>")
    .description("Start a Mecha by ID")
    .action(async (id: string) => {
      const { dockerClient, formatter } = deps;
      try {
        await startContainer(dockerClient, containerName(id as MechaId));
        formatter.success(`Mecha '${id}' started.`);
      } catch (err) {
        formatter.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
