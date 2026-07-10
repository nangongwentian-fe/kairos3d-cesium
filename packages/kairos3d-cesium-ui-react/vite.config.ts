import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      name: "Kairos3DCesiumUiReact",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
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
