import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { removeContainer, removeVolume } from "@mecha/docker";
import { containerName, volumeName } from "@mecha/core";
import type { MechaId } from "@mecha/core";

export function registerRmCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("rm <id>")
    .description("Remove a Mecha by ID")
    .option("--with-state", "Also remove the state volume")
    .option("-f, --force", "Force remove even if running")
    .action(
      async (id: string, cmdOpts: { withState?: boolean; force?: boolean }) => {
        const { dockerClient, formatter } = deps;
        const cName = containerName(id as MechaId);
        try {
          await removeContainer(dockerClient, cName, cmdOpts.force ?? false);
          formatter.success(`Mecha '${id}' removed.`);

          if (cmdOpts.withState) {
            const vName = volumeName(id as MechaId);
            await removeVolume(dockerClient, vName);
            formatter.success(`Volume '${vName}' removed.`);
          }
        } catch (err) {
          formatter.error(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
        }
      },
    );
}
