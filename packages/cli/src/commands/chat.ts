import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { mechaChat } from "@mecha/service";
import { toUserMessage, toExitCode } from "@mecha/contracts";

function processSSELine(line: string): void {
  if (!line.startsWith("data: ") || line.startsWith("data: [DONE]")) return;
  try {
    const data = JSON.parse(line.slice(6));
    const text = data?.content ?? data?.text ?? data?.delta?.text ?? "";
    if (text) process.stdout.write(text);
  } catch { /* skip non-JSON lines */ }
}

export function registerChatCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("chat <id> <message>")
    .description("Send a chat message to a running Mecha")
    .action(async (id: string, message: string) => {
      const { dockerClient, formatter } = deps;
      try {
        const res = await mechaChat(dockerClient, { id, message });
        const body = res.body;
        if (!body) {
          formatter.info("(empty response)");
          return;
        }
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let receivedDone = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;
          for (const line of lines) {
            if (line.startsWith("data: [DONE]")) {
              receivedDone = true;
              break;
            }
            processSSELine(line);
          }
          if (receivedDone) break;
        }
        // Flush remaining buffer
        if (buffer.trim()) processSSELine(buffer);
        process.stdout.write("\n");
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });
}
