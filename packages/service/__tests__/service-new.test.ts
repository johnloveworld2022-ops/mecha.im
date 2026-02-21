import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DockerClient } from "@mecha/docker";
import {
  mechaToken,
  mechaInspect,
  mechaEnv,
  mechaPrune,
  mechaUpdate,
  mechaChat,
  mechaSessionCreate,
  mechaSessionList,
  mechaSessionGet,
  mechaSessionDelete,
  mechaSessionMessage,
  mechaSessionInterrupt,
  mechaSessionConfigUpdate,
} from "../src/service.js";
import {
  TokenNotFoundError,
  NoPortBindingError,
  ChatRequestFailedError,
  SessionNotFoundError,
  SessionBusyError,
  SessionCapReachedError,
} from "@mecha/contracts";

// --- Mocks ---
const mockEnsureNetwork = vi.fn().mockResolvedValue(undefined);
const mockEnsureVolume = vi.fn().mockResolvedValue(undefined);
const mockRemoveVolume = vi.fn().mockResolvedValue(undefined);
const mockCreateContainer = vi.fn().mockResolvedValue({ id: "abc" });
const mockGetContainerPort = vi.fn().mockResolvedValue(7700);
const mockStartContainer = vi.fn().mockResolvedValue(undefined);
const mockStopContainer = vi.fn().mockResolvedValue(undefined);
const mockRemoveContainer = vi.fn().mockResolvedValue(undefined);
const mockInspectContainer = vi.fn().mockResolvedValue({});
const mockListMechaContainers = vi.fn().mockResolvedValue([]);
const mockGetContainerLogs = vi.fn();
const mockExecInContainer = vi.fn();
const mockPing = vi.fn();
const mockPullImage = vi.fn().mockResolvedValue(undefined);

vi.mock("@mecha/docker", () => ({
  ensureNetwork: (...a: unknown[]) => mockEnsureNetwork(...a),
  ensureVolume: (...a: unknown[]) => mockEnsureVolume(...a),
  removeVolume: (...a: unknown[]) => mockRemoveVolume(...a),
  createContainer: (...a: unknown[]) => mockCreateContainer(...a),
  getContainerPort: (...a: unknown[]) => mockGetContainerPort(...a),
  startContainer: (...a: unknown[]) => mockStartContainer(...a),
  stopContainer: (...a: unknown[]) => mockStopContainer(...a),
  removeContainer: (...a: unknown[]) => mockRemoveContainer(...a),
  inspectContainer: (...a: unknown[]) => mockInspectContainer(...a),
  listMechaContainers: (...a: unknown[]) => mockListMechaContainers(...a),
  getContainerLogs: (...a: unknown[]) => mockGetContainerLogs(...a),
  execInContainer: (...a: unknown[]) => mockExecInContainer(...a),
  ping: (...a: unknown[]) => mockPing(...a),
  pullImage: (...a: unknown[]) => mockPullImage(...a),
}));

const client = {} as DockerClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockInspectContainer.mockResolvedValue({});
  mockGetContainerPort.mockResolvedValue(7700);
  mockListMechaContainers.mockResolvedValue([]);
  mockPullImage.mockResolvedValue(undefined);
  mockRemoveContainer.mockResolvedValue(undefined);
  mockCreateContainer.mockResolvedValue({ id: "abc" });
  mockStartContainer.mockResolvedValue(undefined);
  mockStopContainer.mockResolvedValue(undefined);
  mockRemoveVolume.mockResolvedValue(undefined);
});

// --- mechaToken ---
describe("mechaToken", () => {
  it("returns token from container env", async () => {
    mockInspectContainer.mockResolvedValueOnce({
      Config: { Env: ["PATH=/usr/bin", "MECHA_AUTH_TOKEN=my-token-123"] },
    });
    const result = await mechaToken(client, "mx-abc123");
    expect(result.token).toBe("my-token-123");
    expect(result.id).toBe("mx-abc123");
  });

  it("handles token values containing equals signs", async () => {
    mockInspectContainer.mockResolvedValueOnce({
      Config: { Env: ["MECHA_AUTH_TOKEN=abc=def=ghi"] },
    });
    const result = await mechaToken(client, "mx-abc");
    expect(result.token).toBe("abc=def=ghi");
  });

  it("throws TokenNotFoundError when no token env", async () => {
    mockInspectContainer.mockResolvedValueOnce({
      Config: { Env: ["PATH=/usr/bin"] },
    });
    await expect(mechaToken(client, "mx-abc")).rejects.toThrow(TokenNotFoundError);
  });

  it("throws TokenNotFoundError when Env is empty", async () => {
    mockInspectContainer.mockResolvedValueOnce({ Config: { Env: [] } });
    await expect(mechaToken(client, "mx-abc")).rejects.toThrow(TokenNotFoundError);
  });

  it("throws TokenNotFoundError when Config.Env is undefined", async () => {
    mockInspectContainer.mockResolvedValueOnce({ Config: {} });
    await expect(mechaToken(client, "mx-abc")).rejects.toThrow(TokenNotFoundError);
  });
});

// --- mechaInspect ---
describe("mechaInspect", () => {
  it("returns raw inspect data", async () => {
    const fakeInfo = { Id: "abc", State: { Status: "running" } };
    mockInspectContainer.mockResolvedValueOnce(fakeInfo);
    const result = await mechaInspect(client, "mx-abc");
    expect(result).toEqual(fakeInfo);
  });
});

// --- mechaEnv ---
describe("mechaEnv", () => {
  it("parses environment variables", async () => {
    mockInspectContainer.mockResolvedValueOnce({
      Config: { Env: ["FOO=bar", "BAZ=qux=extra"] },
    });
    const result = await mechaEnv(client, "mx-abc");
    expect(result.env).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux=extra" },
    ]);
  });

  it("handles env entry without equals sign", async () => {
    mockInspectContainer.mockResolvedValueOnce({
      Config: { Env: ["NOEQUALS"] },
    });
    const result = await mechaEnv(client, "mx-abc");
    expect(result.env).toEqual([{ key: "NOEQUALS", value: "" }]);
  });

  it("handles empty env", async () => {
    mockInspectContainer.mockResolvedValueOnce({ Config: {} });
    const result = await mechaEnv(client, "mx-abc");
    expect(result.env).toEqual([]);
  });
});

// --- mechaPrune ---
describe("mechaPrune", () => {
  it("removes stopped containers only", async () => {
    mockListMechaContainers.mockResolvedValueOnce([
      { State: "exited", Names: ["/mecha-a"], Labels: { "mecha.id": "id-a" } },
      { State: "running", Names: ["/mecha-b"], Labels: { "mecha.id": "id-b" } },
      { State: "exited", Names: ["/mecha-c"], Labels: { "mecha.id": "id-c" } },
    ]);
    const result = await mechaPrune(client, {});
    expect(result.removedContainers).toEqual(["mecha-a", "mecha-c"]);
    expect(result.removedVolumes).toEqual([]);
    expect(mockRemoveContainer).toHaveBeenCalledTimes(2);
  });

  it("removes volumes when requested", async () => {
    mockListMechaContainers.mockResolvedValueOnce([
      { State: "exited", Names: ["/mecha-a"], Labels: { "mecha.id": "id-a" } },
    ]);
    const result = await mechaPrune(client, { volumes: true });
    expect(result.removedContainers).toEqual(["mecha-a"]);
    expect(result.removedVolumes).toEqual(["mecha-state-id-a"]);
    expect(mockRemoveVolume).toHaveBeenCalledTimes(1);
  });

  it("handles empty list", async () => {
    const result = await mechaPrune(client, {});
    expect(result.removedContainers).toEqual([]);
    expect(result.removedVolumes).toEqual([]);
  });

  it("continues on remove errors (best effort)", async () => {
    mockListMechaContainers.mockResolvedValueOnce([
      { State: "exited", Names: ["/mecha-a"], Labels: { "mecha.id": "id-a" } },
      { State: "exited", Names: ["/mecha-b"], Labels: { "mecha.id": "id-b" } },
    ]);
    mockRemoveContainer.mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce(undefined);
    const result = await mechaPrune(client, {});
    expect(result.removedContainers).toEqual(["mecha-b"]);
  });

  it("continues on volume remove errors", async () => {
    mockListMechaContainers.mockResolvedValueOnce([
      { State: "exited", Names: ["/mecha-a"], Labels: { "mecha.id": "id-a" } },
    ]);
    mockRemoveVolume.mockRejectedValueOnce(new Error("fail"));
    const result = await mechaPrune(client, { volumes: true });
    expect(result.removedContainers).toEqual(["mecha-a"]);
    expect(result.removedVolumes).toEqual([]);
  });

  it("skips containers with empty Names array", async () => {
    mockListMechaContainers.mockResolvedValueOnce([
      { State: "exited", Names: [], Labels: { "mecha.id": "id-a" } },
    ]);
    const result = await mechaPrune(client, {});
    expect(result.removedContainers).toEqual([]);
    expect(mockRemoveContainer).not.toHaveBeenCalled();
  });

  it("skips volume removal if no mecha id label", async () => {
    mockListMechaContainers.mockResolvedValueOnce([
      { State: "exited", Names: ["/mecha-a"], Labels: {} },
    ]);
    const result = await mechaPrune(client, { volumes: true });
    expect(result.removedContainers).toEqual(["mecha-a"]);
    expect(mockRemoveVolume).not.toHaveBeenCalled();
  });
});

// --- mechaUpdate ---
describe("mechaUpdate", () => {
  const fakeInspect = {
    Config: {
      Image: "mecha-runtime:old",
      Labels: { "im.mecha.path": "/home/user/project" },
      Env: ["MECHA_AUTH_TOKEN=token123"],
    },
    NetworkSettings: { Ports: { "7860/tcp": [{ HostPort: "7700" }] } },
    Mounts: [{ Destination: "/home/user/.mecha", Name: "mecha-vol-abc" }],
  };

  it("pulls image and recreates container", async () => {
    mockInspectContainer.mockResolvedValueOnce(fakeInspect);
    const result = await mechaUpdate(client, { id: "mx-abc" });
    expect(mockPullImage).toHaveBeenCalledTimes(1);
    expect(mockStopContainer).toHaveBeenCalled();
    expect(mockRemoveContainer).toHaveBeenCalled();
    expect(mockCreateContainer).toHaveBeenCalled();
    expect(mockStartContainer).toHaveBeenCalled();
    expect(result.previousImage).toBe("mecha-runtime:old");
  });

  it("skips pull with noPull option", async () => {
    mockInspectContainer.mockResolvedValueOnce(fakeInspect);
    await mechaUpdate(client, { id: "mx-abc", noPull: true });
    expect(mockPullImage).not.toHaveBeenCalled();
  });
});

// --- mechaChat ---
describe("mechaChat", () => {
  it("sends chat request and returns response", async () => {
    mockInspectContainer.mockResolvedValueOnce({
      Config: { Env: ["MECHA_AUTH_TOKEN=tok123"] },
    });
    const mockResponse = { ok: true, body: null } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(mockResponse));
    const res = await mechaChat(client, { id: "mx-abc", message: "hello" });
    expect(res).toBe(mockResponse);
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://127.0.0.1:7700/api/chat");
    expect(fetchCall[1].headers.Authorization).toBe("Bearer tok123");
    vi.unstubAllGlobals();
  });

  it("throws TokenNotFoundError when no token env", async () => {
    mockInspectContainer.mockResolvedValueOnce({
      Config: { Env: ["PATH=/usr/bin"] },
    });
    await expect(mechaChat(client, { id: "mx-abc", message: "hello" })).rejects.toThrow(TokenNotFoundError);
  });

  it("throws TokenNotFoundError when Config.Env is undefined", async () => {
    mockInspectContainer.mockResolvedValueOnce({ Config: {} });
    await expect(mechaChat(client, { id: "mx-abc", message: "hello" })).rejects.toThrow(TokenNotFoundError);
  });

  it("throws when no port binding", async () => {
    mockGetContainerPort.mockResolvedValueOnce(null);
    await expect(mechaChat(client, { id: "mx-abc", message: "hi" })).rejects.toThrow(NoPortBindingError);
  });

  it("aborts on timeout", async () => {
    mockInspectContainer.mockResolvedValueOnce({
      Config: { Env: ["MECHA_AUTH_TOKEN=tok"] },
    });
    const abortError = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(abortError));
    await expect(mechaChat(client, { id: "mx-abc", message: "hi" })).rejects.toThrow("aborted");
    vi.unstubAllGlobals();
  });

  it("throws on non-ok response", async () => {
    mockInspectContainer.mockResolvedValueOnce({ Config: { Env: ["MECHA_AUTH_TOKEN=tok"] } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal" }));
    await expect(mechaChat(client, { id: "mx-abc", message: "hi" })).rejects.toThrow(ChatRequestFailedError);
    vi.unstubAllGlobals();
  });
});

// --- Helper: set up runtime access mocks (token + port) ---
function setupRuntimeAccess(): void {
  mockInspectContainer.mockResolvedValue({
    Config: { Env: ["MECHA_AUTH_TOKEN=test-token"] },
  });
  mockGetContainerPort.mockResolvedValue(7700);
}

// --- getRuntimeAccess error paths (tested via session functions) ---
describe("getRuntimeAccess error paths", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws NoPortBindingError when no port", async () => {
    mockGetContainerPort.mockResolvedValueOnce(null);
    await expect(mechaSessionCreate(client, { id: "mx-abc" })).rejects.toThrow(NoPortBindingError);
  });

  it("throws TokenNotFoundError when no token env", async () => {
    mockGetContainerPort.mockResolvedValueOnce(7700);
    mockInspectContainer.mockResolvedValueOnce({ Config: { Env: [] } });
    await expect(mechaSessionCreate(client, { id: "mx-abc" })).rejects.toThrow(TokenNotFoundError);
  });

  it("throws TokenNotFoundError when Config.Env is undefined", async () => {
    mockGetContainerPort.mockResolvedValueOnce(7700);
    mockInspectContainer.mockResolvedValueOnce({ Config: {} });
    await expect(mechaSessionCreate(client, { id: "mx-abc" })).rejects.toThrow(TokenNotFoundError);
  });
});

// --- mapSessionError fallback ---
describe("mapSessionError fallback", () => {
  beforeEach(() => setupRuntimeAccess());
  afterEach(() => vi.unstubAllGlobals());

  it("throws generic Error for unmapped status codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server Error"),
    }));
    await expect(mechaSessionCreate(client, { id: "mx-abc" })).rejects.toThrow("Session request failed: 500 Server Error");
  });
});

// --- mechaSessionCreate ---
describe("mechaSessionCreate", () => {
  beforeEach(() => setupRuntimeAccess());
  afterEach(() => vi.unstubAllGlobals());

  it("sends POST to /api/sessions with auth and body, returns parsed JSON", async () => {
    const responseBody = { sessionId: "sess-new-123" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(responseBody),
    }));
    const result = await mechaSessionCreate(client, { id: "mx-abc", title: "My Session" });
    expect(result).toEqual(responseBody);
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://127.0.0.1:7700/api/sessions");
    expect(fetchCall[1].method).toBe("POST");
    expect(fetchCall[1].headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(fetchCall[1].body)).toHaveProperty("title", "My Session");
  });

  it("throws SessionCapReachedError on 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Too many sessions"),
    }));
    await expect(mechaSessionCreate(client, { id: "mx-abc" })).rejects.toThrow(SessionCapReachedError);
  });

  it("throws SessionNotFoundError with 'unknown' when no sessionId on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    }));
    try {
      await mechaSessionCreate(client, { id: "mx-abc" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SessionNotFoundError);
      expect((err as Error).message).toContain("unknown");
    }
  });

  it("throws SessionBusyError with 'unknown' when no sessionId on 409", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () => Promise.resolve("Busy"),
    }));
    try {
      await mechaSessionCreate(client, { id: "mx-abc" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SessionBusyError);
      expect((err as Error).message).toContain("unknown");
    }
  });
});

// --- mechaSessionList ---
describe("mechaSessionList", () => {
  beforeEach(() => setupRuntimeAccess());
  afterEach(() => vi.unstubAllGlobals());

  it("throws on error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server error"),
    }));
    await expect(mechaSessionList(client, { id: "mx-abc" })).rejects.toThrow("Session request failed");
  });

  it("sends GET to /api/sessions with auth", async () => {
    const sessions = [{ sessionId: "s1" }, { sessionId: "s2" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sessions),
    }));
    const result = await mechaSessionList(client, { id: "mx-abc" });
    expect(result).toEqual(sessions);
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://127.0.0.1:7700/api/sessions");
    expect(fetchCall[1].headers.Authorization).toBe("Bearer test-token");
  });
});

// --- mechaSessionGet ---
describe("mechaSessionGet", () => {
  beforeEach(() => setupRuntimeAccess());
  afterEach(() => vi.unstubAllGlobals());

  it("sends GET to /api/sessions/:sid with auth", async () => {
    const detail = { sessionId: "sess-abc", title: "Test", messages: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(detail),
    }));
    const result = await mechaSessionGet(client, { id: "mx-abc", sessionId: "sess-abc" });
    expect(result).toEqual(detail);
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://127.0.0.1:7700/api/sessions/sess-abc");
  });

  it("throws SessionNotFoundError on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    }));
    await expect(mechaSessionGet(client, { id: "mx-abc", sessionId: "bad-sess" })).rejects.toThrow(SessionNotFoundError);
  });
});

// --- mechaSessionDelete ---
describe("mechaSessionDelete", () => {
  beforeEach(() => setupRuntimeAccess());
  afterEach(() => vi.unstubAllGlobals());

  it("sends DELETE, no error on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 204,
    }));
    await expect(mechaSessionDelete(client, { id: "mx-abc", sessionId: "sess-del" })).resolves.toBeUndefined();
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://127.0.0.1:7700/api/sessions/sess-del");
    expect(fetchCall[1].method).toBe("DELETE");
  });

  it("throws SessionNotFoundError on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    }));
    await expect(mechaSessionDelete(client, { id: "mx-abc", sessionId: "bad-sess" })).rejects.toThrow(SessionNotFoundError);
  });
});

// --- mechaSessionMessage ---
describe("mechaSessionMessage", () => {
  beforeEach(() => setupRuntimeAccess());
  afterEach(() => vi.unstubAllGlobals());

  it("returns Response with body stream", async () => {
    const mockBody = new ReadableStream();
    const mockResponse = { ok: true, body: mockBody } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(mockResponse));
    const res = await mechaSessionMessage(client, { id: "mx-abc", sessionId: "sess-1", message: "hello" });
    expect(res).toBe(mockResponse);
    expect(res.body).toBe(mockBody);
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://127.0.0.1:7700/api/sessions/sess-1/message");
    expect(fetchCall[1].method).toBe("POST");
    expect(JSON.parse(fetchCall[1].body)).toEqual({ message: "hello" });
  });

  it("throws SessionBusyError on 409", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () => Promise.resolve("Busy"),
    }));
    await expect(mechaSessionMessage(client, { id: "mx-abc", sessionId: "sess-1", message: "hi" })).rejects.toThrow(SessionBusyError);
  });
});

// --- mechaSessionInterrupt ---
describe("mechaSessionInterrupt", () => {
  beforeEach(() => setupRuntimeAccess());
  afterEach(() => vi.unstubAllGlobals());

  it("throws SessionNotFoundError on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    }));
    await expect(mechaSessionInterrupt(client, { id: "mx-abc", sessionId: "bad-sess" })).rejects.toThrow(SessionNotFoundError);
  });

  it("sends POST and returns { interrupted: true }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ interrupted: true }),
    }));
    const result = await mechaSessionInterrupt(client, { id: "mx-abc", sessionId: "sess-int" });
    expect(result).toEqual({ interrupted: true });
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://127.0.0.1:7700/api/sessions/sess-int/interrupt");
    expect(fetchCall[1].method).toBe("POST");
  });
});

// --- mechaSessionConfigUpdate ---
describe("mechaSessionConfigUpdate", () => {
  beforeEach(() => setupRuntimeAccess());
  afterEach(() => vi.unstubAllGlobals());

  it("throws SessionBusyError on 409", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () => Promise.resolve("Busy"),
    }));
    await expect(mechaSessionConfigUpdate(client, { id: "mx-abc", sessionId: "busy-sess", config: { maxTurns: 10 } })).rejects.toThrow(SessionBusyError);
  });

  it("sends PUT with config body", async () => {
    const config = { model: "claude-3", maxTokens: 1000 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }));
    const result = await mechaSessionConfigUpdate(client, { id: "mx-abc", sessionId: "sess-cfg", config });
    expect(result).toEqual({ ok: true });
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("http://127.0.0.1:7700/api/sessions/sess-cfg/config");
    expect(fetchCall[1].method).toBe("PUT");
    expect(fetchCall[1].headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(fetchCall[1].body)).toEqual(config);
  });
});
