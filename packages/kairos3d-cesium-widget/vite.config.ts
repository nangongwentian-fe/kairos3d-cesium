import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
        "snapshot/index": fileURLToPath(new URL("./src/snapshot/index.ts", import.meta.url))
      },
      name: "Kairos3DCesiumWidget",
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "js" : "cjs"}`
    },
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      external: [/^@kairos3d\/cesium(?:\/.*)?$/]
    }
  }
});
