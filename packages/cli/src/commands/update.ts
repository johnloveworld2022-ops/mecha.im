import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { mechaUpdate } from "@mecha/service";
import { toUserMessage, toExitCode } from "@mecha/contracts";

export function registerUpdateCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("update <id>")
    .description("Pull latest image and recreate a Mecha container")
    .option("--no-pull", "Skip image pull (use local image)")
    .action(async (id: string, cmdOpts: { pull: boolean }) => {
      const { dockerClient, formatter } = deps;
      const jsonMode = parent.opts().json ?? false;
      try {
        if (cmdOpts.pull && !jsonMode) formatter.info("Pulling latest image...");
        const result = await mechaUpdate(dockerClient, { id, noPull: !cmdOpts.pull });
        if (jsonMode) {
          formatter.json(result);
        } else {
          formatter.success(`Mecha '${id}' updated. Image: ${result.previousImage} → ${result.image}`);
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });
}
