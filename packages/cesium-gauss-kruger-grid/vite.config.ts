import { defineConfig } from "vite";

// 独立库构建：GLSL 的 ?raw 导入会成为 JS 字符串，消费项目无需配置 shader loader。
export default defineConfig({
  build: {
    target: "es2022",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      // Cesium 由宿主提供同一实例；Proj4 保留为包依赖，均不重复打进库 bundle。
      external: ["cesium", "proj4"],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
