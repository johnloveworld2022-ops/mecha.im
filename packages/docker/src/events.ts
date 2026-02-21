import { LABELS } from "@mecha/core";
import type { DockerClient } from "./client.js";

export interface ContainerEvent {
  /** Container event type (start, stop, die, destroy, health_status, etc.) */
  action: string;
  /** Container ID */
  containerId: string;
  /** Container name (without leading slash) */
  containerName: string;
  /** Mecha ID from container labels (may be empty if label missing) */
  mechaId: string;
  /** Unix timestamp (seconds) */
  time: number;
}

export interface WatchEventsOptions {
  /** AbortSignal to stop watching */
  signal?: AbortSignal;
}

interface RawEvent {
  Action?: string;
  id?: string;
  Actor?: { Attributes?: Record<string, string> };
  time?: number;
}

function parseEvent(raw: RawEvent): ContainerEvent {
  const attrs = raw.Actor?.Attributes ?? {};
  return {
    action: raw.Action ?? "unknown",
    containerId: raw.id ?? "",
    containerName: (attrs.name ?? "").replace(/^\//, ""),
    mechaId: attrs[LABELS.MECHA_ID] ?? "",
    time: raw.time ?? 0,
  };
}

function destroyStream(stream: NodeJS.ReadableStream): void {
  // Dockerode's getEvents always returns a Readable with destroy()
  (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
}

/**
 * Watch Docker container events for Mecha containers.
 * Returns an AsyncIterable that yields ContainerEvent objects.
 *
 * Filters by `mecha=true` label so only Mecha containers are reported.
 * Docker emits newline-delimited JSON — each chunk may contain multiple events.
 * The stream ends when the signal is aborted or the Docker event stream closes.
 */
export async function* watchContainerEvents(
  client: DockerClient,
  opts?: WatchEventsOptions,
): AsyncGenerator<ContainerEvent> {
  const stream = await client.docker.getEvents({
    filters: {
      type: ["container"],
      label: [`${LABELS.IS_MECHA}=true`],
      event: ["start", "stop", "die", "destroy", "health_status"],
    },
  });

  // If already aborted, clean up and return
  if (opts?.signal?.aborted) {
    destroyStream(stream);
    return;
  }

  // Set up abort listener to destroy the stream
  const onAbort = () => { destroyStream(stream); };
  opts?.signal?.addEventListener("abort", onAbort, { once: true });

  let buffer = "";

  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // Last element is either empty (if chunk ended with \n) or incomplete
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        yield parseEvent(JSON.parse(trimmed) as RawEvent);
      }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
      yield parseEvent(JSON.parse(buffer.trim()) as RawEvent);
    }
  } catch (err) {
    // "Premature close" is expected when the stream is destroyed via abort
    if (!(err instanceof Error && err.message === "Premature close")) {
      throw err;
    }
  } finally {
    opts?.signal?.removeEventListener("abort", onAbort);
  }
}
