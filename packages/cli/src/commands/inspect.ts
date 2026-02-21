import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { mechaInspect } from "@mecha/service";
import { toUserMessage, toExitCode } from "@mecha/contracts";

export function registerInspectCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("inspect <id>")
    .description("Show raw container info as JSON")
    .action(async (id: string) => {
      const { dockerClient, formatter } = deps;
      try {
        const info = await mechaInspect(dockerClient, id);
        formatter.json(info);
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });
}
