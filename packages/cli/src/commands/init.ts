import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { ensureNetwork } from "@mecha/docker";
import { networkName, DEFAULTS } from "@mecha/core";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function registerInitCommand(
  parent: Command,
  deps: CommandDeps,
): void {
  parent
    .command("init")
    .description("Initialize mecha environment")
    .action(async () => {
      const { dockerClient, formatter } = deps;

      // Ensure mecha-net network
      try {
        await ensureNetwork(dockerClient, networkName());
        formatter.success(`Network '${networkName()}' ready.`);
      } catch (err) {
        formatter.error(
          `Failed to create network: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
        return;
      }

      // Create ~/.mecha/ directory
      const mechaHome = join(homedir(), DEFAULTS.HOME_DIR);
      try {
        await mkdir(mechaHome, { recursive: true });
        formatter.success(`Config directory '${mechaHome}' ready.`);
      } catch (err) {
        formatter.error(
          `Failed to create config directory: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
        return;
      }

      formatter.success("Mecha initialized successfully.");
    });
}
