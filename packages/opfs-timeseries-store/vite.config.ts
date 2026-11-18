import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
  },
});
