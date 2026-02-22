import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { mechaEject } from "@mecha/service";
import { toUserMessage, toExitCode } from "@mecha/contracts";

export function registerEjectCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("eject <id>")
    .description("Export Mecha config as docker-compose.yml + .env")
    .option("-f, --force", "Overwrite existing files")
    .action(async (id: string, cmdOpts: { force?: boolean }) => {
      const { dockerClient, formatter } = deps;
      const jsonMode = parent.opts().json ?? false;
      try {
        const result = await mechaEject(dockerClient, { id, force: !!cmdOpts.force });
        if (jsonMode) {
          formatter.json(result);
        } else {
          formatter.success(`Exported to:\n  ${result.composePath}\n  ${result.envPath}`);
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });
}
