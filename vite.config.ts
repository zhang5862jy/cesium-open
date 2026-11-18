import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import cesium from "vite-plugin-cesium";
import { fileURLToPath, URL } from "node:url";

const createCesiumPlugin = cesium as unknown as () => Plugin;

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [vue(), createCesiumPlugin()],
    optimizeDeps: {
      exclude: ["@sqlite.org/sqlite-wasm"],
    },
    resolve: {
      // The app consumes the workspace package by its public name while Vite
      // watches source directly during local development.
      alias: [
        {
          find: "opfs-timeseries-store",
          replacement: fileURLToPath(
            new URL(
              "./packages/opfs-timeseries-store/src/index.ts",
              import.meta.url,
            ),
          ),
        },
        {
          find: "cesium-gauss-kruger-grid",
          replacement: fileURLToPath(new URL("./packages/cesium-gauss-kruger-grid/src/index.ts", import.meta.url)),
        },
        {
          find: "cesium-screen-callout/worker",
          replacement: fileURLToPath(new URL("./packages/cesium-screen-callout/src/worker.ts", import.meta.url)),
        },
        {
          find: "cesium-screen-callout",
          replacement: fileURLToPath(new URL("./packages/cesium-screen-callout/src/index.ts", import.meta.url)),
        },
      ],
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.VITE_PORT) || 5173,
      strictPort: true,
    },
  };
});
