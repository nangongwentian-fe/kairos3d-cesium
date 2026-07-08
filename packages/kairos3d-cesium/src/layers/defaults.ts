import {
  GeoJsonConfigLayer,
  GltfConfigLayer,
  ImageryConfigLayer,
  TerrainConfigLayer,
  TilesetConfigLayer
} from "./adapters";
import { layerRegistry } from "./registry";
import type {
  GeoJsonLayerConfig,
  GltfLayerConfig,
  TerrainLayerConfig,
  TilesetLayerConfig,
  WmsLayerConfig,
  WmtsLayerConfig,
  XyzLayerConfig
} from "./types";

let registered = false;

export function registerDefaultLayerFactories(): void {
  if (registered) {
    return;
  }

  layerRegistry.register<XyzLayerConfig>("xyz", (config) => new ImageryConfigLayer(config));
  layerRegistry.register<WmsLayerConfig>("wms", (config) => new ImageryConfigLayer(config));
  layerRegistry.register<WmtsLayerConfig>("wmts", (config) => new ImageryConfigLayer(config));
  layerRegistry.register<TerrainLayerConfig>("terrain", (config) => new TerrainConfigLayer(config));
  layerRegistry.register<TilesetLayerConfig>("3dtiles", (config) => new TilesetConfigLayer(config));
  layerRegistry.register<GeoJsonLayerConfig>("geojson", (config) => new GeoJsonConfigLayer(config));
  layerRegistry.register<GltfLayerConfig>("gltf", (config) => new GltfConfigLayer(config));

  registered = true;
}
