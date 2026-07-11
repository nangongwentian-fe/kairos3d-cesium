import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesiumStatic";
const cesiumSourcePath = fileURLToPath(new URL(`${cesiumSource}/`, import.meta.url));

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`)
  },
  plugins: [
    react(),
    serveCesiumStaticInDev(),
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
        find: "@kairos3d/cesium/concurrency",
        replacement: fileURLToPath(
          new URL("../../packages/kairos3d-cesium/src/concurrency/index.ts", import.meta.url)
        )
      },
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

function serveCesiumStaticInDev(): Plugin {
  const mountPath = `/${cesiumBaseUrl}/`;

  return {
    name: "kairos-serve-cesium-static-dev",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split("?")[0];
        if (!url?.startsWith(mountPath)) {
          next();
          return;
        }

        const relativePath = decodeURIComponent(url.slice(mountPath.length));
        const filePath = normalize(join(cesiumSourcePath, relativePath));
        if (!filePath.startsWith(cesiumSourcePath) || !existsSync(filePath)) {
          next();
          return;
        }

        const stat = statSync(filePath);
        if (!stat.isFile()) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Type", contentTypeFor(extname(filePath)));
        createReadStream(filePath).pipe(response);
      });
    }
  };
}

function contentTypeFor(extension: string): string {
  if (extension === ".json") {
    return "application/json";
  }
  if (extension === ".js") {
    return "text/javascript";
  }
  if (extension === ".wasm") {
    return "application/wasm";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".css") {
    return "text/css";
  }
  return "application/octet-stream";
}
