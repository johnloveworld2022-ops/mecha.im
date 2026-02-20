import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { errMsg } from "../types.js";
import { inspectContainer } from "@mecha/docker";
import { containerName, LABELS, type MechaId } from "@mecha/core";

export function registerStatusCommand(parent: Command, deps: CommandDeps): void {
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
            const f = (label: string, val: unknown) => formatter.info(`${label.padEnd(10)}${val}`);
            f("ID:", id);
            f("Name:", info.Name.replace(/^\//, ""));
            f("State:", state.Status);
            f("Running:", state.Running);
            f("Started:", state.StartedAt);
            f("Path:", info.Config.Labels?.[LABELS.MECHA_PATH] ?? "");
          }
        } catch (err) {
          formatter.error(errMsg(err));
          process.exitCode = 1;
        }
      };

      if (cmdOpts.watch) {
        process.on("SIGINT", () => process.exit(0));
        while (true) {
          await printStatus();
          await new Promise((r) => setTimeout(r, 2000));
        }
      } else {
        await printStatus();
      }
    });
}
