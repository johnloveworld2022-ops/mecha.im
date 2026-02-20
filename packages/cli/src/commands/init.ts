import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { errMsg } from "../types.js";
import { ensureNetwork } from "@mecha/docker";
import { networkName, DEFAULTS } from "@mecha/core";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function registerInitCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("init")
    .description("Initialize mecha environment")
    .action(async () => {
      const { dockerClient, formatter } = deps;
      const net = networkName();

      try {
        await ensureNetwork(dockerClient, net);
        formatter.success(`Network '${net}' ready.`);
      } catch (err) {
        formatter.error(`Failed to create network: ${errMsg(err)}`);
        process.exitCode = 1;
        return;
      }

      const mechaHome = join(homedir(), DEFAULTS.HOME_DIR);
      try {
        await mkdir(mechaHome, { recursive: true });
        formatter.success(`Config directory '${mechaHome}' ready.`);
      } catch (err) {
        formatter.error(`Failed to create config directory: ${errMsg(err)}`);
        process.exitCode = 1;
        return;
      }

      formatter.success("Mecha initialized successfully.");
    });
}
