/** Default configuration values */
export const DEFAULTS = {
  /** Default runtime Docker image */
  IMAGE: "mecha-runtime:latest",
  /** Default Docker network name */
  NETWORK: "mecha-net",
  /** Default host port base (auto-assigned from this range) */
  PORT_BASE: 7700,
  /** Port range upper bound */
  PORT_MAX: 7799,
  /** Default runtime HTTP port inside container */
  CONTAINER_PORT: 3000,
  /** Heartbeat interval in milliseconds */
  HEARTBEAT_INTERVAL_MS: 30_000,
  /** Container stop timeout in seconds */
  STOP_TIMEOUT_SECONDS: 10,
  /** Home directory for mecha global config */
  HOME_DIR: ".mecha",
  /** Default dashboard port */
  DASHBOARD_PORT: 7600,
} as const;

/** Mount paths inside the container */
export const MOUNT_PATHS = {
  /** Project workspace mount point */
  WORKSPACE: "/workspace",
  /** Persistent state directory */
  STATE: "/var/lib/mecha",
  /** Temporary directory (writable) */
  TMP: "/tmp",
} as const;

/** Docker labels applied to mecha containers */
export const LABELS = {
  /** Marker label indicating this is a mecha container */
  IS_MECHA: "mecha",
  /** Label key for the mecha ID */
  MECHA_ID: "mecha.id",
  /** Label key for the original project path */
  MECHA_PATH: "mecha.path",
} as const;

/** Security settings for containers */
export const SECURITY = {
  /** User ID for non-root container execution */
  UID: 1000,
  /** Group ID for non-root container execution */
  GID: 1000,
  /** Capabilities to drop */
  CAP_DROP: ["ALL"],
  SECURITY_OPT: ["no-new-privileges"],
} as const;
