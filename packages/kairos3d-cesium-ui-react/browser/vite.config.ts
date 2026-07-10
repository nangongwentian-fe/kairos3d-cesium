import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, normalizePath } from "vite";
import type { Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumBaseUrl = "cesiumStatic";
const cesiumRoot = normalizePath(
  fileURLToPath(new URL("../node_modules/cesium/Build/Cesium", import.meta.url))
);
const cesiumSourcePath = fileURLToPath(
  new URL("../node_modules/cesium/Build/Cesium/", import.meta.url)
);

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    react(),
    serveCesiumStaticInDev(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumRoot}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumRoot}/ThirdParty`, dest: cesiumBaseUrl },
        { src: `${cesiumRoot}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumRoot}/Widgets`, dest: cesiumBaseUrl }
      ]
    })
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`)
  },
  resolve: {
    alias: [
      ...["layers", "operations", "scene", "effects"].map((subpath) => ({
        find: `@kairos3d/cesium/${subpath}`,
        replacement: fileURLToPath(
          new URL(`../../kairos3d-cesium/src/${subpath}/index.ts`, import.meta.url)
        )
      })),
      {
        find: "@kairos3d/cesium-widget",
        replacement: fileURLToPath(
          new URL("../../kairos3d-cesium-widget/src/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/core",
        replacement: fileURLToPath(
          new URL("../../kairos3d-cesium/src/core/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/effects",
        replacement: fileURLToPath(
          new URL("../../kairos3d-cesium/src/effects/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/scene",
        replacement: fileURLToPath(
          new URL("../../kairos3d-cesium/src/scene/index.ts", import.meta.url)
        )
      },
      {
        find: "@kairos3d/cesium/operations",
        replacement: fileURLToPath(
          new URL("../../kairos3d-cesium/src/operations/index.ts", import.meta.url)
        )
      }
    ]
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL("../../..", import.meta.url))]
    }
  }
});

function serveCesiumStaticInDev(): Plugin {
  const mountPath = `/${cesiumBaseUrl}/`;

  return {
    name: "kairos-ui-serve-cesium-static-dev",
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
