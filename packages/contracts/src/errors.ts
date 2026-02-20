import { MechaError } from "@mecha/core";
import { ZodError } from "zod";

// --- New error classes ---

export class InvalidPortError extends MechaError {
  constructor(port: number) { super(`Invalid port: ${port} (must be 1024-65535)`, "INVALID_PORT"); }
}

export class InvalidPermissionModeError extends MechaError {
  constructor(mode: string) { super(`Invalid permission mode: ${mode} (must be one of: default, plan, full-auto)`, "INVALID_PERMISSION_MODE"); }
}

export class ContainerStartError extends MechaError {
  constructor(name: string, cause?: Error) {
    super(`Failed to start container ${name}: ${cause?.message ?? "unknown"}`, "CONTAINER_START_FAILED");
    if (cause) this.cause = cause;
  }
}

export class PathNotFoundError extends MechaError {
  constructor(path: string) { super(`Path does not exist: ${path}`, "PATH_NOT_FOUND"); }
}

export class PathNotDirectoryError extends MechaError {
  constructor(path: string) { super(`Path is not a directory: ${path}`, "PATH_NOT_DIRECTORY"); }
}

export class NoPortBindingError extends MechaError {
  constructor(id: string) { super(`No port binding found for mecha: ${id}`, "NO_PORT_BINDING"); }
}

export class ConfigureNoFieldsError extends MechaError {
  constructor() { super("At least one field required: claudeToken, anthropicApiKey, otp, permissionMode", "CONFIGURE_NO_FIELDS"); }
}

// --- Error mapping helpers ---

const HTTP_STATUS_MAP: Record<string, number> = {
  INVALID_PORT: 400,
  INVALID_PERMISSION_MODE: 400,
  PATH_NOT_FOUND: 400,
  PATH_NOT_DIRECTORY: 400,
  CONFIGURE_NO_FIELDS: 400,
  CONTAINER_NOT_FOUND: 404,
  CONTAINER_ALREADY_EXISTS: 409,
  CONTAINER_START_FAILED: 500,
  DOCKER_NOT_AVAILABLE: 503,
  NO_PORT_BINDING: 500,
  INVALID_PATH: 400,
  IMAGE_NOT_FOUND: 500,
};

export function toHttpStatus(err: unknown): number {
  if (err instanceof MechaError) return HTTP_STATUS_MAP[err.code] ?? 500;
  if (err instanceof ZodError) return 400;
  return 500;
}

export function toExitCode(_err: unknown): number {
  return 1; // All errors are exit code 1 for CLI
}

export function toUserMessage(err: unknown): string {
  if (err instanceof ZodError) return `Validation error: ${err.issues.map(i => i.message).join("; ")}`;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
