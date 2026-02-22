import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { toUserMessage, toExitCode, ChannelType } from "@mecha/contracts";

export function registerChannelCommand(parent: Command, deps: CommandDeps): void {
  const channel = parent
    .command("channel")
    .description("Manage channel gateways (Telegram, etc.)");

  channel
    .command("add <type>")
    .description("Register a new channel (e.g. telegram)")
    .option("--bot-token <token>", "Bot token (or set MECHA_BOT_TOKEN env var)")
    .action(async (type: string, opts: { botToken?: string }) => {
      const { formatter } = deps;
      try {
        const parsed = ChannelType.safeParse(type);
        if (!parsed.success) {
          formatter.error(`Invalid channel type: ${type} (supported: ${ChannelType.options.join(", ")})`);
          process.exitCode = 1;
          return;
        }
        const botToken = opts.botToken ?? process.env.MECHA_BOT_TOKEN;
        if (!botToken) {
          formatter.error("Bot token required: use --bot-token <token> or set MECHA_BOT_TOKEN");
          process.exitCode = 1;
          return;
        }
        const { openStore, channelAdd } = await import("@mecha/channels");
        const store = openStore();
        try {
          const row = channelAdd(store, parsed.data, botToken);
          formatter.success(`Channel added: ${row.id}`);
        } finally {
          store.close();
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  channel
    .command("rm <id>")
    .description("Remove a channel and its links")
    .action(async (id: string) => {
      const { formatter } = deps;
      try {
        const { openStore, channelRm } = await import("@mecha/channels");
        const store = openStore();
        try {
          channelRm(store, id);
          formatter.success(`Channel ${id} removed`);
        } finally {
          store.close();
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  channel
    .command("ls")
    .description("List all channels")
    .action(async () => {
      const { formatter } = deps;
      try {
        const { openStore, channelLs } = await import("@mecha/channels");
        const store = openStore();
        try {
          const rows = channelLs(store);
          formatter.table(
            rows.map((r) => ({
              ID: r.id,
              TYPE: r.type,
              ENABLED: r.enabled ? "yes" : "no",
              CREATED: r.created_at,
            })),
            ["ID", "TYPE", "ENABLED", "CREATED"],
          );
        } finally {
          store.close();
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  channel
    .command("link <channelId> <chatId> <mechaId>")
    .description("Link a chat to a mecha")
    .action(async (channelId: string, chatId: string, mechaId: string) => {
      const { formatter } = deps;
      try {
        const { openStore, channelLink } = await import("@mecha/channels");
        const store = openStore();
        try {
          const row = channelLink(store, channelId, chatId, mechaId);
          formatter.success(`Linked: ${row.id} (${channelId} / ${chatId} → ${mechaId})`);
        } finally {
          store.close();
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  channel
    .command("unlink <channelId> <chatId>")
    .description("Remove a chat-to-mecha link")
    .action(async (channelId: string, chatId: string) => {
      const { formatter } = deps;
      try {
        const { openStore, channelUnlink } = await import("@mecha/channels");
        const store = openStore();
        try {
          channelUnlink(store, channelId, chatId);
          formatter.success(`Unlinked: ${channelId} / ${chatId}`);
        } finally {
          store.close();
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  channel
    .command("links [channelId]")
    .description("List channel links")
    .action(async (channelId?: string) => {
      const { formatter } = deps;
      try {
        const { openStore, channelLinks } = await import("@mecha/channels");
        const store = openStore();
        try {
          const rows = channelLinks(store, channelId);
          formatter.table(
            rows.map((r) => ({
              ID: r.id,
              CHANNEL: r.channel_id,
              CHAT: r.chat_id,
              MECHA: r.mecha_id,
              SESSION: r.session_id ?? "-",
            })),
            ["ID", "CHANNEL", "CHAT", "MECHA", "SESSION"],
          );
        } finally {
          store.close();
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  channel
    .command("serve")
    .description("Start the channel gateway server")
    .option("-p, --port <port>", "Gateway port", "7650")
    .action(async (opts: { port: string }) => {
      const { formatter } = deps;
      try {
        const { createGatewayServer } = await import("@mecha/channels");
        const { openStore } = await import("@mecha/channels");
        // Verify store can be opened (validates path)
        const store = openStore();
        store.close();

        const port = Number(opts.port);
        const { join } = await import("node:path");
        const { homedir } = await import("node:os");
        const { DEFAULTS } = await import("@mecha/core");
        const dbPath = join(homedir(), DEFAULTS.HOME_DIR, "channels.db");

        const server = await createGatewayServer({ dbPath, port });

        /* v8 ignore start */
        process.on("SIGINT", async () => {
          await server.stop();
          process.exit(0);
        });
        /* v8 ignore stop */

        await server.start();
        formatter.info(`Channel gateway listening on http://127.0.0.1:${port}`);
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });
}
