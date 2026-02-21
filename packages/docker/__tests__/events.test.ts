import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import { watchContainerEvents } from "../src/events.js";
import { LABELS } from "@mecha/core";
import type { DockerClient } from "../src/client.js";

function createMockClient(stream?: PassThrough): DockerClient {
  const mockStream = stream ?? new PassThrough();
  return {
    docker: {
      getEvents: vi.fn().mockResolvedValue(mockStream),
    },
  } as unknown as DockerClient;
}

function makeEvent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    Action: "start",
    id: "abc123",
    Actor: {
      Attributes: {
        name: "mecha-mx-test",
        [LABELS.MECHA_ID]: "mx-test",
      },
    },
    time: 1700000000,
    ...overrides,
  });
}

describe("watchContainerEvents", () => {
  let client: DockerClient;
  let stream: PassThrough;

  beforeEach(() => {
    stream = new PassThrough();
    client = createMockClient(stream);
  });

  it("yields parsed container events", async () => {
    stream.write(makeEvent() + "\n");
    stream.end();

    const events = [];
    for await (const event of watchContainerEvents(client)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      action: "start",
      containerId: "abc123",
      containerName: "mecha-mx-test",
      mechaId: "mx-test",
      time: 1700000000,
    });
  });

  it("filters by mecha label and container type", async () => {
    stream.end();
    for await (const _ of watchContainerEvents(client)) { /* noop */ }

    const getEvents = client.docker.getEvents as ReturnType<typeof vi.fn>;
    expect(getEvents).toHaveBeenCalledWith({
      filters: {
        type: ["container"],
        label: [`${LABELS.IS_MECHA}=true`],
        event: ["start", "stop", "die", "destroy", "health_status"],
      },
    });
  });

  it("yields multiple events from a single chunk (newline-delimited)", async () => {
    // Docker sends newline-delimited JSON — multiple events in one chunk
    stream.write(
      makeEvent({ Action: "start" }) + "\n" +
      makeEvent({ Action: "stop" }) + "\n" +
      makeEvent({ Action: "die" }) + "\n",
    );
    stream.end();

    const events = [];
    for await (const event of watchContainerEvents(client)) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.action)).toEqual(["start", "stop", "die"]);
  });

  it("handles events split across chunks", async () => {
    const event = makeEvent({ Action: "start" });
    // Split the event JSON in half across two chunks
    const mid = Math.floor(event.length / 2);
    stream.write(event.slice(0, mid));
    stream.write(event.slice(mid) + "\n");
    stream.end();

    const events = [];
    for await (const event of watchContainerEvents(client)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("start");
  });

  it("handles trailing data without newline", async () => {
    // Event without trailing newline — should be processed on stream end
    stream.write(makeEvent({ Action: "destroy" }));
    stream.end();

    const events = [];
    for await (const event of watchContainerEvents(client)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("destroy");
  });

  it("handles missing fields with defaults", async () => {
    stream.write("{}\n");
    stream.end();

    const events = [];
    for await (const event of watchContainerEvents(client)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      action: "unknown",
      containerId: "",
      containerName: "",
      mechaId: "",
      time: 0,
    });
  });

  it("handles event with Actor but no Attributes", async () => {
    stream.write(JSON.stringify({ Action: "die", id: "x", Actor: {}, time: 1 }) + "\n");
    stream.end();

    const events = [];
    for await (const event of watchContainerEvents(client)) {
      events.push(event);
    }

    expect(events[0]).toEqual({
      action: "die",
      containerId: "x",
      containerName: "",
      mechaId: "",
      time: 1,
    });
  });

  it("strips leading slash from container name", async () => {
    stream.write(JSON.stringify({
      Action: "start",
      id: "abc",
      Actor: { Attributes: { name: "/my-container", [LABELS.MECHA_ID]: "mx-1" } },
      time: 100,
    }) + "\n");
    stream.end();

    const events = [];
    for await (const event of watchContainerEvents(client)) {
      events.push(event);
    }

    expect(events[0]!.containerName).toBe("my-container");
  });

  it("skips empty lines between events", async () => {
    stream.write(makeEvent({ Action: "start" }) + "\n\n\n" + makeEvent({ Action: "stop" }) + "\n");
    stream.end();

    const events = [];
    for await (const event of watchContainerEvents(client)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
  });

  it("returns immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const events = [];
    for await (const event of watchContainerEvents(client, { signal: controller.signal })) {
      events.push(event);
    }

    expect(events).toHaveLength(0);
  });

  it("stops when signal is aborted mid-stream", async () => {
    const controller = new AbortController();

    stream.write(makeEvent({ Action: "start" }) + "\n");

    const events = [];
    for await (const event of watchContainerEvents(client, { signal: controller.signal })) {
      events.push(event);
      // Abort after first event — destroys stream, causes Premature close (caught internally)
      controller.abort();
    }

    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("start");
  });

  it("re-throws non-premature-close errors", async () => {
    // Simulate a real stream error
    const errorStream = new PassThrough();
    const errClient = createMockClient(errorStream);

    const iter = watchContainerEvents(errClient);
    // Start iterating, then emit error
    const promise = iter.next();
    errorStream.destroy(new Error("connection lost"));

    await expect(promise).rejects.toThrow("connection lost");
  });

  it("cleans up abort listener on normal completion", async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    stream.end();

    for await (const _ of watchContainerEvents(client, { signal: controller.signal })) { /* noop */ }

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
