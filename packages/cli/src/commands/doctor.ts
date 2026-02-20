import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { ping } from "@mecha/docker";
import { networkName } from "@mecha/core";

export function registerDoctorCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("doctor")
    .description("Check system requirements")
    .action(async () => {
      const { dockerClient, formatter } = deps;
      const net = networkName();
      let healthy = true;

      try {
        await ping(dockerClient);
        formatter.success("Docker: available");
      } catch {
        formatter.error("Docker is not available. Is Docker/Colima running?");
        healthy = false;
      }

      if (healthy) {
        try {
          const networks = await dockerClient.docker.listNetworks({
            filters: { name: [net] },
          });
          if (networks.some((n: { Name: string }) => n.Name === net)) {
            formatter.success(`Network '${net}': exists`);
          } else {
            formatter.error(`Network '${net}' not found. Run 'mecha init' first.`);
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
