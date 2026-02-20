import { describe, it, expect } from "vitest";
import {
  MechaError,
  DockerNotAvailableError,
  ContainerNotFoundError,
  ContainerAlreadyExistsError,
  InvalidPathError,
  ImageNotFoundError,
} from "../src/errors.js";

describe("MechaError", () => {
  it("has message and code", () => {
    const err = new MechaError("test error", "TEST_CODE");
    expect(err.message).toBe("test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.name).toBe("MechaError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("DockerNotAvailableError", () => {
  it("has default message", () => {
    const err = new DockerNotAvailableError();
    expect(err.message).toContain("Docker is not available");
    expect(err.code).toBe("DOCKER_NOT_AVAILABLE");
    expect(err.name).toBe("DockerNotAvailableError");
    expect(err).toBeInstanceOf(MechaError);
  });

  it("accepts custom message", () => {
    const err = new DockerNotAvailableError("custom");
    expect(err.message).toBe("custom");
  });
});

describe("ContainerNotFoundError", () => {
  it("includes the container ID in message", () => {
    const err = new ContainerNotFoundError("mx-test-abc123");
    expect(err.message).toContain("mx-test-abc123");
    expect(err.code).toBe("CONTAINER_NOT_FOUND");
    expect(err).toBeInstanceOf(MechaError);
  });
});

describe("ContainerAlreadyExistsError", () => {
  it("includes the container ID in message", () => {
    const err = new ContainerAlreadyExistsError("mx-test-abc123");
    expect(err.message).toContain("mx-test-abc123");
    expect(err.code).toBe("CONTAINER_ALREADY_EXISTS");
    expect(err).toBeInstanceOf(MechaError);
  });
});

describe("InvalidPathError", () => {
  it("includes the path in message", () => {
    const err = new InvalidPathError("/bad/path");
    expect(err.message).toContain("/bad/path");
    expect(err.code).toBe("INVALID_PATH");
    expect(err).toBeInstanceOf(MechaError);
  });
});

describe("ImageNotFoundError", () => {
  it("includes the image name in message", () => {
    const err = new ImageNotFoundError("mecha-runtime:latest");
    expect(err.message).toContain("mecha-runtime:latest");
    expect(err.code).toBe("IMAGE_NOT_FOUND");
    expect(err).toBeInstanceOf(MechaError);
  });
});
