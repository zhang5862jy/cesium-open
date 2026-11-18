import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import cesium from "vite-plugin-cesium";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

const createCesiumPlugin = cesium as unknown as () => Plugin;
const gzipAsync = promisify(gzip);

function gzipBuildAssets(): Plugin {
  let outputDir: string | undefined;

  return {
    name: "gzip-build-assets",
    apply: "build",
    configResolved({ root, build }) {
      outputDir = build.write ? resolve(root, build.outDir) : undefined;
    },
    closeBundle: {
      // Wait for the Cesium plugin to copy its runtime files into the output.
      order: "post",
      sequential: true,
      async handler(error) {
        if (error || !outputDir) return;

        const entries = await readdir(outputDir, {
          recursive: true,
          withFileTypes: true,
        });

        for (const entry of entries) {
          if (
            !entry.isFile() ||
            !/\.(css|html|js|json|mjs|svg|wasm)$/i.test(entry.name)
          ) {
            continue;
          }

          const path = join(entry.parentPath, entry.name);
          const original = await readFile(path);
          const compressed = await gzipAsync(original);

          if (compressed.length < original.length) {
            await writeFile(`${path}.gz`, compressed);
          }
        }
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [vue(), createCesiumPlugin(), gzipBuildAssets()],
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
          replacement: fileURLToPath(
            new URL(
              "./packages/cesium-gauss-kruger-grid/src/index.ts",
              import.meta.url,
            ),
          ),
        },
        {
          find: "cesium-screen-callout/worker",
          replacement: fileURLToPath(
            new URL(
              "./packages/cesium-screen-callout/src/worker.ts",
              import.meta.url,
            ),
          ),
        },
        {
          find: "cesium-screen-callout",
          replacement: fileURLToPath(
            new URL(
              "./packages/cesium-screen-callout/src/index.ts",
              import.meta.url,
            ),
          ),
        },
      ],
    },
    server: {
      host: "0.0.0.0",
      port: Number(env.VITE_PORT) || 5173,
      strictPort: true,
    },
  };
});
