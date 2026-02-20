import { describe, it, expect } from "vitest";
import { DEFAULTS, MOUNT_PATHS, LABELS, SECURITY } from "../src/constants.js";

describe("DEFAULTS", () => {
  it("has expected image name", () => {
    expect(DEFAULTS.IMAGE).toBe("mecha-runtime:latest");
  });

  it("has expected network name", () => {
    expect(DEFAULTS.NETWORK).toBe("mecha-net");
  });

  it("has expected container port", () => {
    expect(DEFAULTS.CONTAINER_PORT).toBe(3000);
  });

  it("has valid port range", () => {
    expect(DEFAULTS.PORT_BASE).toBeLessThan(DEFAULTS.PORT_MAX);
  });
});

describe("MOUNT_PATHS", () => {
  it("has workspace mount", () => {
    expect(MOUNT_PATHS.WORKSPACE).toBe("/workspace");
  });

  it("has state mount", () => {
    expect(MOUNT_PATHS.STATE).toBe("/var/lib/mecha");
  });

  it("has tmp mount", () => {
    expect(MOUNT_PATHS.TMP).toBe("/tmp");
  });
});

describe("LABELS", () => {
  it("has mecha marker label", () => {
    expect(LABELS.IS_MECHA).toBe("mecha");
  });

  it("has ID label key", () => {
    expect(LABELS.MECHA_ID).toBe("mecha.id");
  });

  it("has path label key", () => {
    expect(LABELS.MECHA_PATH).toBe("mecha.path");
  });
});

describe("SECURITY", () => {
  it("runs as non-root UID", () => {
    expect(SECURITY.UID).toBe(1000);
  });

  it("drops all capabilities", () => {
    expect(SECURITY.CAP_DROP).toContain("ALL");
  });

  it("prevents privilege escalation", () => {
    expect(SECURITY.SECURITY_OPT).toContain("no-new-privileges");
  });
});
