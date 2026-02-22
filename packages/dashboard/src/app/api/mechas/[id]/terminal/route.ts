import { type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { containerName, type MechaId } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withStreamAuth } from "@/lib/api-auth";
import { addSession, removeSession } from "@/lib/terminal-sessions";

export const POST = withStreamAuth(async (request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  const cName = containerName(id as MechaId);

  const container = client.docker.getContainer(cName);

  const exec = await container.exec({
    Cmd: ["/bin/bash"],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: "/home/mecha",
  });

  const stream = await exec.start({ hijack: true, stdin: true, Tty: true });

  const execId = randomBytes(16).toString("hex");
  addSession(execId, stream, exec, cName);

  const body = new ReadableStream({
    start(controller) {
      // Send the execId as the first message so the client knows it
      controller.enqueue(new TextEncoder().encode(`\x00${execId}\n`));

      stream.on("data", (chunk: Buffer) => {
        try {
          controller.enqueue(chunk);
        } catch {
          // Controller closed
        }
      });

      stream.on("end", () => {
        removeSession(execId);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      stream.on("error", () => {
        removeSession(execId);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        removeSession(execId);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
});
