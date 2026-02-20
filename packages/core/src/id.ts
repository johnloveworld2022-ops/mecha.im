import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { MechaId } from "./types.js";
import { DEFAULTS } from "./constants.js";

/**
 * Compute a deterministic Mecha ID from a project path.
 *
 * Algorithm:
 * 1. Canonicalize path (resolve to absolute)
 * 2. Slug = final directory name, kebab-case, sanitized
 * 3. Pathhash = first 6 chars of base36-encoded SHA-256 of canonical path
 * 4. ID = `mx-<slug>-<pathhash>`
 */
export function computeMechaId(projectPath: string): MechaId {
  const canonical = resolve(projectPath);
  const slug = toSlug(canonical);
  const hash = pathHash(canonical);
  return `mx-${slug}-${hash}` as MechaId;
}

/** Convert the final directory name to a kebab-case slug */
function toSlug(canonicalPath: string): string {
  // Get the final component of the path
  const parts = canonicalPath.split("/").filter(Boolean);
  const dirName = parts[parts.length - 1] || "root";

  // Convert to kebab-case: replace non-alphanumeric with hyphens, lowercase, collapse
  return dirName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // camelCase -> camel-Case
    .replace(/[^a-zA-Z0-9]+/g, "-") // non-alphanum -> hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .toLowerCase() || "root";
}

/** Compute a 6-char base36 hash of the canonical path */
function pathHash(canonicalPath: string): string {
  const sha = createHash("sha256").update(canonicalPath).digest();
  // Convert first 8 bytes to BigInt, then to base36, take first 6 chars
  const num = sha.readBigUInt64BE(0);
  return num.toString(36).slice(0, 6);
}

/** Get the Docker container name for a Mecha ID */
export function containerName(id: MechaId): string {
  return `mecha-${id}`;
}

/** Get the Docker volume name for a Mecha ID */
export function volumeName(id: MechaId): string {
  return `mecha-state-${id}`;
}

/** Get the Docker network name (shared across all Mechas) */
export function networkName(): string {
  return DEFAULTS.NETWORK;
}
