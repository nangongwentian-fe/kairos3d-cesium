import { Cartesian3, Entity, ImageryLayerFeatureInfo } from "cesium";
import { describe, expect, it, vi } from "vitest";
import {
  GeoJsonConfigLayer,
  GltfConfigLayer,
  ImageryConfigLayer,
  TerrainConfigLayer,
  TilesetConfigLayer
} from "./adapters";

describe("default layer adapter runtime ownership", () => {
  it("recognizes imagery feature ownership", () => {
    const layer = new ImageryConfigLayer({
      id: "imagery",
      type: "xyz",
      url: "https://example.com/{z}/{x}/{y}.png"
    });
    const imageryLayer = {};
    const feature = new ImageryLayerFeatureInfo();
    feature.imageryLayer = imageryLayer;
    (layer as unknown as { layer: unknown }).layer = imageryLayer;

    expect(layer.ownsRuntimeObject(feature)).toBe(true);
  });

  it("recognizes GeoJSON entity ownership", () => {
    const layer = new GeoJsonConfigLayer({
      id: "geojson",
      type: "geojson",
      data: {}
    });
    const entity = new Entity({ id: "feature-1", properties: { code: "A001" } });
    (layer as unknown as { dataSource: { entities: { contains: (value: Entity) => boolean } } }).dataSource = {
      entities: {
        contains: vi.fn((value) => value === entity)
      }
    };

    expect(layer.ownsRuntimeObject({ id: entity })).toBe(true);
    expect(layer.getFeatureProperties({ id: entity })).toMatchObject({ code: "A001" });
  });

  it("recognizes tagged GeoJSON entity ownership", () => {
    const layer = new GeoJsonConfigLayer({
      id: "geojson",
      type: "geojson",
      data: {}
    });
    const entity = new Entity({ id: "feature-1" });
    Object.defineProperty(entity, "__kairosLayerId", {
      value: "geojson",
      configurable: true
    });

    expect(layer.ownsRuntimeObject({ id: entity })).toBe(true);
  });

  it("recognizes glTF entity ownership", () => {
    const layer = new GltfConfigLayer({
      id: "model",
      type: "gltf",
      url: "model.glb",
      position: Cartesian3.ZERO
    });
    const entity = new Entity({ id: "model", properties: { kind: "gltf" } });
    (layer as unknown as { entity: Entity }).entity = entity;

    expect(layer.ownsRuntimeObject({ id: entity })).toBe(true);
    expect(layer.getFeatureProperties({ id: entity })).toMatchObject({ kind: "gltf" });
  });

  it("recognizes 3D Tiles feature ownership", () => {
    const layer = new TilesetConfigLayer({
      id: "tiles",
      type: "3dtiles",
      url: "tileset.json"
    });
    const tileset = {};
    const feature = {
      tileset,
      featureId: 2,
      getPropertyIds: () => ["name"],
      getProperty: () => "Building"
    };
    (layer as unknown as { tileset: unknown }).tileset = tileset;

    expect(layer.ownsRuntimeObject(feature)).toBe(true);
    expect(layer.getFeatureProperties(feature)).toMatchObject({
      featureId: 2,
      name: "Building"
    });
  });

  it("recognizes terrain provider ownership", () => {
    const layer = new TerrainConfigLayer({
      id: "terrain",
      type: "terrain"
    });
    const provider = {};
    (layer as unknown as { terrainProvider: unknown }).terrainProvider = provider;

    expect(layer.getRuntimeObjects()).toEqual([provider]);
    expect(layer.ownsRuntimeObject(provider)).toBe(true);
  });
});
