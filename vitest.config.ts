import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "packages/core/src/**",
        "packages/contracts/src/**",
        "packages/service/src/**",
        "packages/docker/src/**",
        "packages/cli/src/**",
        "packages/runtime/src/**",
      ],
      exclude: [
        "**/__tests__/**",
        "**/dist/**",
        "**/node_modules/**",
        "**/index.ts",
        "packages/core/src/types.ts",
        "packages/cli/src/bin.ts",
        "packages/cli/src/program.ts",
        "packages/runtime/src/main.ts",
        "packages/runtime/src/mcp/server.ts",
        "packages/runtime/src/agent/casa.ts",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
      reporter: ["text-summary"],
    },
  },
});
