import type { Command } from "commander";
import { requireValidName, printTable } from "../cli-utils.js";
import { botApiJson, botApiChecked } from "./bot-api.js";

interface ScheduleEntry {
  id: string;
  cron: string;
  prompt: string;
  paused?: boolean;
  last_run?: string;
  run_count?: number;
}

export function registerScheduleCommand(program: Command): void {
  const schedule = program
    .command("schedule")
    .description("Manage bot schedules");

  schedule
    .command("ls <name>")
    .description("List schedules")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts) => {
      requireValidName(name);
      const schedules = await botApiJson<ScheduleEntry[]>(name, "/api/schedule");
      if (opts.json) { console.log(JSON.stringify(schedules, null, 2)); return; }
      if (!Array.isArray(schedules) || schedules.length === 0) { console.log(`No schedules for "${name}".`); return; }
      printTable(
        ["ID", "CRON", "PROMPT", "STATUS", "RUNS"],
        schedules.map(s => [
          s.id, s.cron,
          s.prompt.length > 40 ? s.prompt.slice(0, 37) + "..." : s.prompt,
          s.paused ? "paused" : "active", String(s.run_count ?? 0),
        ]),
      );
    });

  schedule
    .command("add <name> <cron> <prompt>")
    .description("Add a cron schedule")
    .action(async (name: string, cron: string, prompt: string) => {
      requireValidName(name);
      const result = await botApiJson<{ id: string }>(name, "/api/schedule", {
        method: "POST", body: { cron, prompt },
      });
      console.log(`Schedule added: ${result.id}`);
    });

  schedule
    .command("rm <name> <id>")
    .description("Remove a schedule")
    .action(async (name: string, id: string) => {
      requireValidName(name);
      await botApiChecked(name, `/api/schedule/${id}`, { method: "DELETE" });
      console.log(`Schedule ${id} removed.`);
    });

  schedule
    .command("pause <name> <id>")
    .description("Pause a schedule")
    .action(async (name: string, id: string) => {
      requireValidName(name);
      await botApiChecked(name, `/api/schedule/${id}/pause`, { method: "POST" });
      console.log(`Schedule ${id} paused.`);
    });

  schedule
    .command("resume <name> <id>")
    .description("Resume a paused schedule")
    .action(async (name: string, id: string) => {
      requireValidName(name);
      await botApiChecked(name, `/api/schedule/${id}/resume`, { method: "POST" });
      console.log(`Schedule ${id} resumed.`);
    });

  schedule
    .command("run <name> <id>")
    .description("Trigger a schedule immediately")
    .action(async (name: string, id: string) => {
      requireValidName(name);
      // Manual trigger can take a while because it waits for the run to finish.
      await botApiChecked(name, `/api/schedule/trigger/${id}`, { method: "POST", timeout: 30 * 60 * 1000 });
      console.log(`Schedule ${id} triggered.`);
    });
}
