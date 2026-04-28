import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.mjs", "src/**/*.test.ts"],
    reporters: "default",
  },
});
