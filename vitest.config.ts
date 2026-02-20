import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "packages/core/src/**",
        "packages/docker/src/**",
        "packages/cli/src/**",
        "packages/runtime/src/**",
      ],
      exclude: [
        "**/__tests__/**",
        "**/dist/**",
        "**/node_modules/**",
        "**/index.ts",
        "packages/ui/**",
        "packages/hub/**",
      ],
      thresholds: {
        lines: 50,
        functions: 60,
        branches: 40,
        statements: 50,
      },
      reporter: ["text-summary"],
    },
  },
});
