import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { ping } from "@mecha/docker";
import { networkName } from "@mecha/core";

export function registerDoctorCommand(
  parent: Command,
  deps: CommandDeps,
): void {
  parent
    .command("doctor")
    .description("Check system requirements")
    .action(async () => {
      const { dockerClient, formatter } = deps;
      let healthy = true;

      // Check Docker availability
      try {
        await ping(dockerClient);
        formatter.success("Docker: available");
      } catch {
        formatter.error("Docker is not available. Is Docker/Colima running?");
        healthy = false;
      }

      // Check mecha-net network exists
      if (healthy) {
        try {
          const networks = await dockerClient.docker.listNetworks({
            filters: { name: [networkName()] },
          });
          const exists = networks.some((n: { Name: string }) => n.Name === networkName());
          if (exists) {
            formatter.success(`Network '${networkName()}': exists`);
          } else {
            formatter.error(
              `Network '${networkName()}' not found. Run 'mecha init' first.`,
            );
            healthy = false;
          }
        } catch {
          formatter.error("Failed to check network status.");
          healthy = false;
        }
      }

      if (healthy) {
        formatter.success("All checks passed.");
      } else {
        process.exitCode = 1;
      }
    });
}
