import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { inspectContainer } from "@mecha/docker";
import { containerName, LABELS } from "@mecha/core";
import type { MechaId } from "@mecha/core";

export function registerStatusCommand(
  parent: Command,
  deps: CommandDeps,
): void {
  parent
    .command("status <id>")
    .description("Show status of a Mecha")
    .option("-w, --watch", "Watch for status changes")
    .action(async (id: string, cmdOpts: { watch?: boolean }) => {
      const { dockerClient, formatter } = deps;
      const jsonMode = parent.opts().json ?? false;
      const cName = containerName(id as MechaId);

      const printStatus = async (): Promise<void> => {
        try {
          const info = await inspectContainer(dockerClient, cName);
          const state = info.State;

          if (jsonMode) {
            formatter.json({
              id,
              name: info.Name.replace(/^\//, ""),
              state: state.Status,
              running: state.Running,
              startedAt: state.StartedAt,
              finishedAt: state.FinishedAt,
              path: info.Config.Labels?.[LABELS.MECHA_PATH] ?? "",
            });
          } else {
            formatter.info(`ID:       ${id}`);
            formatter.info(`Name:     ${info.Name.replace(/^\//, "")}`);
            formatter.info(`State:    ${state.Status}`);
            formatter.info(`Running:  ${state.Running}`);
            formatter.info(`Started:  ${state.StartedAt}`);
            formatter.info(`Path:     ${info.Config.Labels?.[LABELS.MECHA_PATH] ?? ""}`);
          }
        } catch (err) {
          formatter.error(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
        }
      };

      if (cmdOpts.watch) {
        const interval = setInterval(() => {
          void printStatus();
        }, 2000);
        process.on("SIGINT", () => {
          clearInterval(interval);
          process.exit(0);
        });
        await printStatus();
      } else {
        await printStatus();
      }
    });
}
