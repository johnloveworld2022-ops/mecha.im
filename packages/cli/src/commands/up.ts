import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { errMsg } from "../types.js";
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
import { randomBytes } from "node:crypto";
import { stat, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const VALID_PERMISSION_MODES = ["default", "plan", "full-auto"] as const;

export function registerUpCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("up <path>")
    .description("Create and start a Mecha from a project path")
    .option("-p, --port <port>", "Host port to bind", String(DEFAULTS.PORT_BASE))
    .option("--claude-token <token>", "Claude OAuth token for this mecha")
    .option("--otp <secret>", "TOTP secret for runtime access")
    .option("--permission-mode <mode>", "Agent permission mode: default, plan, full-auto")
    .action(async (pathArg: string, cmdOpts: { port: string; claudeToken?: string; otp?: string; permissionMode?: string }) => {
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

      if (!Number.isInteger(hostPort) || hostPort < 1024 || hostPort > 65535) {
        formatter.error(`Invalid port: ${cmdOpts.port} (must be 1024-65535)`);
        process.exitCode = 1;
        return;
      }

      if (cmdOpts.permissionMode && !VALID_PERMISSION_MODES.includes(cmdOpts.permissionMode as typeof VALID_PERMISSION_MODES[number])) {
        formatter.error(`Invalid permission mode: ${cmdOpts.permissionMode} (must be one of: ${VALID_PERMISSION_MODES.join(", ")})`);
        process.exitCode = 1;
        return;
      }

      // Load .env files: project dir first (takes priority), then cwd
      // Neither overrides existing env vars (e.g. set in shell)
      const uniqueDirs = [...new Set([projectPath, process.cwd()])];
      for (const dir of uniqueDirs) {
        try {
          const envPath = join(dir, ".env");
          const envContent = await readFile(envPath, "utf-8");
          for (const line of envContent.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx);
              if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1);
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
        const extraEnv: string[] = [];

        const authToken = randomBytes(32).toString("hex");
        extraEnv.push(`MECHA_AUTH_TOKEN=${authToken}`);

        const claudeToken = cmdOpts.claudeToken ?? process.env["CLAUDE_CODE_OAUTH_TOKEN"];
        if (claudeToken) extraEnv.push(`CLAUDE_CODE_OAUTH_TOKEN=${claudeToken}`);

        const otp = cmdOpts.otp ?? process.env["MECHA_OTP"];
        if (otp) extraEnv.push(`MECHA_OTP=${otp}`);

        if (cmdOpts.permissionMode) extraEnv.push(`MECHA_PERMISSION_MODE=${cmdOpts.permissionMode}`);

        await createContainer(dockerClient, {
          containerName: cName,
          image: DEFAULTS.IMAGE,
          mechaId: id,
          projectPath,
          volumeName: vName,
          hostPort,
          env: extraEnv,
        });
        await startContainer(dockerClient, cName);

        formatter.success(`Mecha started successfully.`);
        formatter.info(`  ID:   ${id}`);
        formatter.info(`  Port: ${hostPort}`);
        formatter.info(`  Auth: ${authToken}`);
        formatter.info(`  Name: ${cName}`);
      } catch (err) {
        formatter.error(errMsg(err));
        process.exitCode = 1;
      }
    });
}
