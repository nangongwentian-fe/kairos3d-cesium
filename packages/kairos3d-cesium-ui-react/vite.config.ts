import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@kairos3d/cesium-widget",
        replacement: fileURLToPath(
          new URL("../kairos3d-cesium-widget/src/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/core",
        replacement: fileURLToPath(
          new URL("../kairos3d-cesium/src/core/index.ts", import.meta.url)
        )
      }
    ]
  },
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
        "widgets/index": fileURLToPath(new URL("./src/widgets/index.ts", import.meta.url))
      },
      name: "Kairos3DCesiumUiReact",
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "js" : "cjs"}`,
      cssFileName: "styles"
    },
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      external: [
        /^@kairos3d\/cesium(?:\/.*)?$/,
        /^@kairos3d\/cesium-widget(?:\/.*)?$/,
        /^cesium(?:\/.*)?$/,
        /^lucide-react(?:\/.*)?$/,
        /^react(?:\/.*)?$/,
        /^react-dom(?:\/.*)?$/
      ]
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true
  }
});
