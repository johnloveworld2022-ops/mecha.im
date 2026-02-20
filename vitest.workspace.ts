import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/core",
  "packages/docker",
  "packages/cli",
  "packages/runtime",
]);
