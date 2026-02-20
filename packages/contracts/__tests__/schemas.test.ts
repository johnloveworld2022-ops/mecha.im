import { describe, it, expect } from "vitest";
import {
  PERMISSION_MODES,
  PermissionMode,
  BLOCKED_ENV_KEYS,
  MechaUpInput,
  MechaUpResult,
  MechaRmInput,
  MechaConfigureInput,
  MechaLogsInput,
  MechaExecInput,
  MechaLsItem,
  MechaStatusResult,
  DoctorResult,
  UiUrlResult,
  McpEndpointResult,
} from "../src/schemas.js";

describe("PERMISSION_MODES", () => {
  it("contains exactly default, plan, full-auto", () => {
    expect(PERMISSION_MODES).toEqual(["default", "plan", "full-auto"]);
  });

  it("parses valid modes", () => {
    for (const mode of PERMISSION_MODES) {
      expect(PermissionMode.parse(mode)).toBe(mode);
    }
  });

  it("rejects invalid mode", () => {
    expect(() => PermissionMode.parse("yolo")).toThrow();
  });
});

describe("BLOCKED_ENV_KEYS", () => {
  it("blocks security-sensitive keys", () => {
    expect(BLOCKED_ENV_KEYS.has("MECHA_AUTH_TOKEN")).toBe(true);
    expect(BLOCKED_ENV_KEYS.has("CLAUDE_CODE_OAUTH_TOKEN")).toBe(true);
    expect(BLOCKED_ENV_KEYS.has("ANTHROPIC_API_KEY")).toBe(true);
    expect(BLOCKED_ENV_KEYS.has("MECHA_ID")).toBe(true);
    expect(BLOCKED_ENV_KEYS.has("PATH")).toBe(true);
    expect(BLOCKED_ENV_KEYS.has("LD_PRELOAD")).toBe(true);
  });

  it("does not block arbitrary keys", () => {
    expect(BLOCKED_ENV_KEYS.has("MY_CUSTOM_VAR")).toBe(false);
  });
});

describe("MechaUpInput", () => {
  it("parses valid minimal input", () => {
    const result = MechaUpInput.parse({ projectPath: "/tmp/test" });
    expect(result.projectPath).toBe("/tmp/test");
    expect(result.port).toBeUndefined();
    expect(result.claudeToken).toBeUndefined();
    expect(result.anthropicApiKey).toBeUndefined();
    expect(result.otp).toBeUndefined();
    expect(result.permissionMode).toBeUndefined();
    expect(result.env).toBeUndefined();
  });

  it("parses full input with all fields", () => {
    const input = {
      projectPath: "/home/user/project",
      port: 7700,
      claudeToken: "tok_abc",
      anthropicApiKey: "sk-ant-123",
      otp: "JBSWY3DPEHPK3PXP",
      permissionMode: "full-auto" as const,
      env: ["MY_VAR=hello"],
    };
    const result = MechaUpInput.parse(input);
    expect(result).toEqual(input);
  });

  it("rejects empty projectPath", () => {
    expect(() => MechaUpInput.parse({ projectPath: "" })).toThrow();
  });

  it("rejects port below 1024", () => {
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", port: 80 })).toThrow();
  });

  it("rejects port above 65535", () => {
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", port: 70000 })).toThrow();
  });

  it("rejects non-integer port", () => {
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", port: 7700.5 })).toThrow();
  });

  it("rejects invalid permission mode", () => {
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", permissionMode: "dangerous" })).toThrow();
  });

  it("rejects env entries with blocked keys", () => {
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", env: ["MECHA_AUTH_TOKEN=secret"] })).toThrow();
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", env: ["PATH=/usr/bin"] })).toThrow();
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", env: ["CLAUDE_CODE_OAUTH_TOKEN=tok"] })).toThrow();
  });

  it("rejects env entries without = separator", () => {
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", env: ["NOEQUALS"] })).toThrow();
  });

  it("rejects env entries with lowercase keys", () => {
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", env: ["lowercase=val"] })).toThrow();
  });

  it("rejects env entries starting with =", () => {
    expect(() => MechaUpInput.parse({ projectPath: "/tmp", env: ["=value"] })).toThrow();
  });

  it("accepts valid env entries", () => {
    const result = MechaUpInput.parse({ projectPath: "/tmp", env: ["MY_VAR=hello", "FOO123=bar"] });
    expect(result.env).toEqual(["MY_VAR=hello", "FOO123=bar"]);
  });

  it("accepts boundary port values", () => {
    expect(MechaUpInput.parse({ projectPath: "/tmp", port: 1024 }).port).toBe(1024);
    expect(MechaUpInput.parse({ projectPath: "/tmp", port: 65535 }).port).toBe(65535);
  });
});

describe("MechaUpResult", () => {
  it("parses valid result", () => {
    const result = MechaUpResult.parse({ id: "mx-foo-abc123", name: "mecha-mx-foo-abc123", port: 7700, authToken: "a".repeat(64) });
    expect(result.id).toBe("mx-foo-abc123");
    expect(result.port).toBe(7700);
  });

  it("rejects missing fields", () => {
    expect(() => MechaUpResult.parse({ id: "mx-foo" })).toThrow();
  });
});

describe("MechaRmInput", () => {
  it("parses with defaults", () => {
    const result = MechaRmInput.parse({ id: "mx-foo-abc123" });
    expect(result.id).toBe("mx-foo-abc123");
    expect(result.withState).toBe(false);
    expect(result.force).toBe(false);
  });

  it("parses with flags", () => {
    const result = MechaRmInput.parse({ id: "mx-foo-abc123", withState: true, force: true });
    expect(result.withState).toBe(true);
    expect(result.force).toBe(true);
  });

  it("rejects empty id", () => {
    expect(() => MechaRmInput.parse({ id: "" })).toThrow();
  });
});

describe("MechaConfigureInput", () => {
  it("parses with all optional fields", () => {
    const result = MechaConfigureInput.parse({
      id: "mx-foo-abc123",
      claudeToken: "tok",
      anthropicApiKey: "sk-ant",
      otp: "secret",
      permissionMode: "plan",
    });
    expect(result.claudeToken).toBe("tok");
    expect(result.anthropicApiKey).toBe("sk-ant");
    expect(result.otp).toBe("secret");
    expect(result.permissionMode).toBe("plan");
  });

  it("parses with only id", () => {
    const result = MechaConfigureInput.parse({ id: "mx-foo" });
    expect(result.claudeToken).toBeUndefined();
    expect(result.anthropicApiKey).toBeUndefined();
  });

  it("rejects invalid permission mode", () => {
    expect(() => MechaConfigureInput.parse({ id: "mx-foo", permissionMode: "nope" })).toThrow();
  });
});

describe("MechaLogsInput", () => {
  it("parses with defaults", () => {
    const result = MechaLogsInput.parse({ id: "mx-foo" });
    expect(result.follow).toBe(false);
    expect(result.tail).toBe(100);
    expect(result.since).toBeUndefined();
  });

  it("parses with all fields", () => {
    const result = MechaLogsInput.parse({ id: "mx-foo", follow: true, tail: 50, since: 1700000000 });
    expect(result.follow).toBe(true);
    expect(result.tail).toBe(50);
    expect(result.since).toBe(1700000000);
  });

  it("rejects negative tail", () => {
    expect(() => MechaLogsInput.parse({ id: "mx-foo", tail: -1 })).toThrow();
  });
});

describe("MechaExecInput", () => {
  it("parses valid input", () => {
    const result = MechaExecInput.parse({ id: "mx-foo", cmd: ["echo", "hello"] });
    expect(result.cmd).toEqual(["echo", "hello"]);
  });

  it("rejects empty command array", () => {
    expect(() => MechaExecInput.parse({ id: "mx-foo", cmd: [] })).toThrow();
  });

  it("rejects empty id", () => {
    expect(() => MechaExecInput.parse({ id: "", cmd: ["ls"] })).toThrow();
  });
});

describe("MechaLsItem", () => {
  it("parses valid item with optional port", () => {
    const item = { id: "mx-foo", name: "mecha-mx-foo", state: "running", status: "Up 5 min", path: "/tmp", port: 7700, created: 1700000000 };
    expect(MechaLsItem.parse(item)).toEqual(item);
  });

  it("parses without port", () => {
    const item = { id: "mx-foo", name: "mecha-mx-foo", state: "exited", status: "Exited (0)", path: "/tmp", created: 1700000000 };
    const result = MechaLsItem.parse(item);
    expect(result.port).toBeUndefined();
  });
});

describe("MechaStatusResult", () => {
  it("parses full status", () => {
    const status = {
      id: "mx-foo", name: "mecha-mx-foo", state: "running", running: true,
      port: 7700, path: "/tmp", image: "mecha-runtime:latest",
      startedAt: "2025-01-01T00:00:00Z", finishedAt: "",
    };
    expect(MechaStatusResult.parse(status)).toEqual(status);
  });

  it("parses without optional fields", () => {
    const status = { id: "mx-foo", name: "n", state: "exited", running: false, path: "/tmp", image: "img" };
    const result = MechaStatusResult.parse(status);
    expect(result.port).toBeUndefined();
    expect(result.startedAt).toBeUndefined();
  });
});

describe("DoctorResult", () => {
  it("parses healthy result", () => {
    const result = DoctorResult.parse({ dockerAvailable: true, networkExists: true, issues: [] });
    expect(result.issues).toHaveLength(0);
  });

  it("parses unhealthy result", () => {
    const result = DoctorResult.parse({ dockerAvailable: false, networkExists: false, issues: ["Docker not running"] });
    expect(result.issues).toEqual(["Docker not running"]);
  });
});

describe("UiUrlResult", () => {
  it("parses valid url", () => {
    expect(UiUrlResult.parse({ url: "http://127.0.0.1:7700" }).url).toBe("http://127.0.0.1:7700");
  });
});

describe("McpEndpointResult", () => {
  it("parses valid endpoint", () => {
    const result = McpEndpointResult.parse({ endpoint: "http://127.0.0.1:7700/mcp", note: "use bearer token" });
    expect(result.endpoint).toBe("http://127.0.0.1:7700/mcp");
    expect(result.note).toBe("use bearer token");
  });
});
