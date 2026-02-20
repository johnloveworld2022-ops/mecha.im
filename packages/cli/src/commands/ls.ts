import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
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

        if (jsonMode) {
          const data = containers.map((c) => ({
            id: c.Labels[LABELS.MECHA_ID] ?? "",
            name: (c.Names[0] ?? "").replace(/^\//, ""),
            state: c.State,
            status: c.Status,
            path: c.Labels[LABELS.MECHA_PATH] ?? "",
          }));
          formatter.json(data);
          return;
        }

        const rows = containers.map((c) => ({
          ID: c.Labels[LABELS.MECHA_ID] ?? "",
          NAME: (c.Names[0] ?? "").replace(/^\//, ""),
          STATE: c.State,
          STATUS: c.Status,
          PATH: c.Labels[LABELS.MECHA_PATH] ?? "",
        }));

        formatter.table(rows, ["ID", "NAME", "STATE", "STATUS", "PATH"]);
      } catch (err) {
        formatter.error(
          err instanceof Error ? err.message : String(err),
        );
        process.exitCode = 1;
      }
    });
}
