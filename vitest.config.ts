import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/rls/**/*.test.ts", "tests/r2/**/*.test.ts"],
    setupFiles: ["./tests/setup-env.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js's bundler treats `server-only` specially; under plain Node/vitest
      // it just needs to be a no-op so server-side libs can still be imported in tests.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
