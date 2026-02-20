import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { mechaExec } from "@mecha/service";
import { toUserMessage, toExitCode } from "@mecha/contracts";

export function registerExecCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("exec <id>")
    .description("Execute a command in a Mecha container")
    .allowUnknownOption(true)
    .argument("<command...>", "Command to execute")
    .action(async (id: string, command: string[]) => {
      const { dockerClient, formatter } = deps;
      try {
        const result = await mechaExec(dockerClient, { id, cmd: command });
        process.stdout.write(result.output);
        process.exitCode = result.exitCode;
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });
}
