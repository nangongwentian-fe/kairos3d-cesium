import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesiumStatic";

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`)
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl }
      ]
    })
  ],
  resolve: {
    alias: [
      {
        find: "@kairos3d/cesium/core",
        replacement: fileURLToPath(
          new URL("../../packages/kairos3d-cesium/src/core/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/layers",
        replacement: fileURLToPath(
          new URL("../../packages/kairos3d-cesium/src/layers/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/tools",
        replacement: fileURLToPath(
          new URL("../../packages/kairos3d-cesium/src/tools/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/draw",
        replacement: fileURLToPath(
          new URL("../../packages/kairos3d-cesium/src/draw/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/analysis",
        replacement: fileURLToPath(
          new URL("../../packages/kairos3d-cesium/src/analysis/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/persistence",
        replacement: fileURLToPath(
          new URL("../../packages/kairos3d-cesium/src/persistence/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium",
        replacement: fileURLToPath(
          new URL("../../packages/kairos3d-cesium/src/index.ts", import.meta.url)
        )
      }
    ]
  }
});
