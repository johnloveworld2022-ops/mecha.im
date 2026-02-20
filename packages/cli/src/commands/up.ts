import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import {
  computeMechaId,
  containerName,
  volumeName,
  networkName,
  DEFAULTS,
} from "@mecha/core";
import {
  ensureNetwork,
  ensureVolume,
  createContainer,
  startContainer,
} from "@mecha/docker";
import { stat, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

export function registerUpCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("up <path>")
    .description("Create and start a Mecha from a project path")
    .option("-p, --port <port>", "Host port to bind", String(DEFAULTS.PORT_BASE))
    .action(async (pathArg: string, cmdOpts: { port: string }) => {
      const { dockerClient, formatter } = deps;
      const projectPath = resolve(pathArg);

      // Validate path exists
      try {
        await stat(projectPath);
      } catch {
        formatter.error(`Path does not exist: ${projectPath}`);
        process.exitCode = 1;
        return;
      }

      const id = computeMechaId(projectPath);
      const cName = containerName(id);
      const vName = volumeName(id);
      const hostPort = parseInt(cmdOpts.port, 10);

      // Load .env files: project dir first, then cwd (project dir takes priority)
      for (const dir of [process.cwd(), projectPath]) {
        try {
          const envPath = join(dir, ".env");
          const envContent = await readFile(envPath, "utf-8");
          for (const line of envContent.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx);
              const value = trimmed.slice(eqIdx + 1);
              if (!process.env[key]) {
                process.env[key] = value;
              }
            }
          }
        } catch {
          // No .env file, that's fine
        }
      }

      try {
        // Ensure network and volume
        await ensureNetwork(dockerClient, networkName());
        await ensureVolume(dockerClient, vName);

        // Create and start container
        await createContainer(dockerClient, {
          containerName: cName,
          image: DEFAULTS.IMAGE,
          mechaId: id,
          projectPath,
          volumeName: vName,
          hostPort,
        });
        await startContainer(dockerClient, cName);

        formatter.success(`Mecha started successfully.`);
        formatter.info(`  ID:   ${id}`);
        formatter.info(`  Port: ${hostPort}`);
        formatter.info(`  Name: ${cName}`);
      } catch (err) {
        formatter.error(
          err instanceof Error ? err.message : String(err),
        );
        process.exitCode = 1;
      }
    });
}
