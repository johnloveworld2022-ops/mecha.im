import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { errMsg } from "../types.js";
import { execInContainer } from "@mecha/docker";
import { containerName, type MechaId } from "@mecha/core";

export function registerExecCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("exec <id>")
    .description("Execute a command in a Mecha container")
    .allowUnknownOption(true)
    .argument("<command...>", "Command to execute")
    .action(async (id: string, command: string[]) => {
      const { dockerClient, formatter } = deps;
      try {
        const result = await execInContainer(dockerClient, containerName(id as MechaId), command);
        process.stdout.write(result.output);
        process.exitCode = result.exitCode;
      } catch (err) {
        formatter.error(errMsg(err));
        process.exitCode = 1;
      }
    });
}
