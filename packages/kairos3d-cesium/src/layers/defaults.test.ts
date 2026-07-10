import { Cartesian3, ColorBlendMode } from "cesium";
import { describe, expect, it } from "vitest";
import { registerDefaultLayerFactories } from "./defaults";
import { layerRegistry } from "./registry";
import type {
  GeoJsonLayerConfig,
  GltfLayerConfig,
  LayerConfig,
  TilesetLayerConfig,
  XyzLayerConfig
} from "./types";

describe("default layer factories", () => {
  it("exposes detached transaction hooks for every built-in layer type", async () => {
    registerDefaultLayerFactories();
    const configs: LayerConfig[] = [
      {
        id: "xyz",
        type: "xyz",
        url: "https://example.com/{z}/{x}/{y}.png"
      },
      {
        id: "wms",
        type: "wms",
        url: "https://example.com/wms",
        layers: "demo"
      },
      {
        id: "wmts",
        type: "wmts",
        url: "https://example.com/wmts",
        layer: "demo",
        style: "default",
        tileMatrixSetID: "default"
      },
      { id: "terrain", type: "terrain" },
      { id: "tiles", type: "3dtiles", url: "/tileset.json" },
      {
        id: "geojson",
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      },
      {
        id: "gltf",
        type: "gltf",
        url: "/model.glb",
        position: Cartesian3.ZERO
      }
    ];

    for (const config of configs) {
      const layer = await layerRegistry.create(config);
      expect(layer.transaction, config.type).toMatchObject({
        prepare: expect.any(Function),
        attach: expect.any(Function),
        detach: expect.any(Function)
      });
    }
  });

  it("creates an xyz adapter from config without touching a viewer", async () => {
    registerDefaultLayerFactories();

    const layer = await layerRegistry.create<XyzLayerConfig>({
      id: "osm",
      type: "xyz",
      name: "OpenStreetMap",
      group: "base",
      order: 3,
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      show: false,
      alpha: 0.8,
      metadata: { provider: "osm" }
    });

    expect(layer.id).toBe("osm");
    expect(layer.type).toBe("xyz");
    expect(layer.show).toBe(false);
    expect(layer.getState?.()).toMatchObject({
      id: "osm",
      name: "OpenStreetMap",
      group: "base",
      order: 3,
      opacity: 0.8,
      metadata: { provider: "osm" }
    });
    expect(layer.toConfig?.()).toMatchObject({
      id: "osm",
      type: "xyz",
      group: "base",
      order: 3,
      show: false,
      alpha: 0.8
    });
  });

  it("updates default imagery adapter state before it is added to a viewer", async () => {
    registerDefaultLayerFactories();

    const layer = await layerRegistry.create<XyzLayerConfig>({
      id: "osm",
      type: "xyz",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    });

    layer.setOpacity?.(0.4);
    layer.setOrder?.(5);

    expect(layer.getState?.()).toMatchObject({
      opacity: 0.4,
      order: 5
    });
    expect(layer.toConfig?.()).toMatchObject({
      alpha: 0.4,
      order: 5
    });
  });

  it("keeps advanced 3D Tiles config recoverable", async () => {
    registerDefaultLayerFactories();

    const layer = await layerRegistry.create<TilesetLayerConfig>({
      id: "tileset-demo",
      type: "3dtiles",
      url: "/tileset/tileset.json",
      name: "Demo Tileset",
      group: "business",
      order: 10,
      maximumScreenSpaceError: 8,
      dynamicScreenSpaceError: true,
      skipLevelOfDetail: true,
      style: { color: "color('white')" }
    });

    expect(layer.toConfig?.()).toMatchObject({
      id: "tileset-demo",
      type: "3dtiles",
      group: "business",
      order: 10,
      maximumScreenSpaceError: 8,
      dynamicScreenSpaceError: true,
      skipLevelOfDetail: true,
      style: { color: "color('white')" }
    });
  });

  it("keeps GeoJSON style and clamp config recoverable", async () => {
    registerDefaultLayerFactories();

    const layer = await layerRegistry.create<GeoJsonLayerConfig>({
      id: "geojson-demo",
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: []
      },
      clampToGround: true,
      style: {
        markerColor: "#00d4ff",
        stroke: "#35d07f",
        strokeWidth: 2,
        fill: { red: 0, green: 0.8, blue: 1, alpha: 0.25 }
      }
    });

    expect(layer.toConfig?.()).toMatchObject({
      id: "geojson-demo",
      type: "geojson",
      clampToGround: true,
      style: {
        markerColor: "#00d4ff",
        stroke: "#35d07f",
        strokeWidth: 2,
        fill: { red: 0, green: 0.8, blue: 1, alpha: 0.25 }
      }
    });
  });

  it("keeps glTF runtime options and height mode recoverable", async () => {
    registerDefaultLayerFactories();

    const layer = await layerRegistry.create<GltfLayerConfig>({
      id: "model-demo",
      type: "gltf",
      url: "/models/demo.glb",
      position: Cartesian3.fromDegrees(114.16, 22.31, 20),
      height: { mode: "relativeToGround", offset: 15 },
      scale: 10,
      minimumPixelSize: 32,
      maximumScale: 200,
      color: "#ffffff",
      colorBlendMode: ColorBlendMode.MIX,
      colorBlendAmount: 0.5
    });

    expect(layer.toConfig?.()).toMatchObject({
      id: "model-demo",
      type: "gltf",
      url: "/models/demo.glb",
      height: { mode: "relativeToGround", offset: 15 },
      scale: 10,
      minimumPixelSize: 32,
      maximumScale: 200,
      color: "#ffffff",
      colorBlendMode: ColorBlendMode.MIX,
      colorBlendAmount: 0.5
    });
  });
});
