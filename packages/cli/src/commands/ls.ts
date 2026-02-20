import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { errMsg } from "../types.js";
import { listMechaContainers } from "@mecha/docker";
import { LABELS } from "@mecha/core";

export function registerLsCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("ls")
    .description("List all mecha containers")
    .action(async () => {
      const { dockerClient, formatter } = deps;
      const jsonMode = parent.opts().json ?? false;

      try {
        const containers = await listMechaContainers(dockerClient);
        const items = containers.map((c) => ({
          id: c.Labels[LABELS.MECHA_ID] ?? "",
          state: c.State,
          status: c.Status,
          path: c.Labels[LABELS.MECHA_PATH] ?? "",
        }));

        if (jsonMode) {
          formatter.json(items);
          return;
        }

        const rows = items.map(({ id, state, status, path }) => ({
          ID: id, STATE: state, STATUS: status, PATH: path,
        }));
        formatter.table(rows, ["ID", "STATE", "STATUS", "PATH"]);
      } catch (err) {
        formatter.error(errMsg(err));
        process.exitCode = 1;
      }
    });
}
