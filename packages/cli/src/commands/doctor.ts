import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { mechaDoctor } from "@mecha/service";

export function registerDoctorCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("doctor")
    .description("Check system requirements")
    .action(async () => {
      const { dockerClient, formatter } = deps;

      const result = await mechaDoctor(dockerClient);

      if (result.dockerAvailable) {
        formatter.success("Docker: available");
      } else {
        formatter.error("Docker is not available. Is Docker/Colima running?");
      }

      if (result.dockerAvailable) {
        if (result.networkExists) {
          formatter.success(`Network: exists`);
        } else {
          formatter.error(`Network not found. Run 'mecha init' first.`);
        }
      }

      if (result.issues.length === 0) {
        formatter.success("All checks passed.");
      } else {
        process.exitCode = 1;
      }
    });
}
