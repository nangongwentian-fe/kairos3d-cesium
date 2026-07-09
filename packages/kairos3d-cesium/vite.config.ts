import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
        "core/index": fileURLToPath(new URL("./src/core/index.ts", import.meta.url)),
        "layers/index": fileURLToPath(new URL("./src/layers/index.ts", import.meta.url)),
        "tools/index": fileURLToPath(new URL("./src/tools/index.ts", import.meta.url)),
        "draw/index": fileURLToPath(new URL("./src/draw/index.ts", import.meta.url)),
        "analysis/index": fileURLToPath(new URL("./src/analysis/index.ts", import.meta.url)),
        "scene/index": fileURLToPath(new URL("./src/scene/index.ts", import.meta.url)),
        "picking/index": fileURLToPath(new URL("./src/picking/index.ts", import.meta.url)),
        "style/index": fileURLToPath(new URL("./src/style/index.ts", import.meta.url)),
        "height/index": fileURLToPath(new URL("./src/height/index.ts", import.meta.url)),
        "results/index": fileURLToPath(new URL("./src/results/index.ts", import.meta.url)),
        "performance/index": fileURLToPath(new URL("./src/performance/index.ts", import.meta.url)),
        "primitives/index": fileURLToPath(new URL("./src/primitives/index.ts", import.meta.url)),
        "overlays/index": fileURLToPath(new URL("./src/overlays/index.ts", import.meta.url)),
        "persistence/index": fileURLToPath(new URL("./src/persistence/index.ts", import.meta.url))
      },
      name: "Kairos3DCesium",
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "js" : "cjs"}`
    },
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      external: ["cesium"]
    }
  }
});
