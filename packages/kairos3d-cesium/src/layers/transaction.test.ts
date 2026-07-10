import {
  Cartesian3,
  Cesium3DTileset,
  DataSourceCollection,
  EllipsoidTerrainProvider,
  EntityCollection,
  ImageryLayerCollection,
  PrimitiveCollection
} from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import {
  GeoJsonConfigLayer,
  GltfConfigLayer,
  ImageryConfigLayer,
  TerrainConfigLayer,
  TilesetConfigLayer
} from "./adapters";

function createMapMock() {
  const imageryLayers = new ImageryLayerCollection();
  const dataSources = new DataSourceCollection();
  const entities = new EntityCollection();
  const primitives = new PrimitiveCollection();
  const terrainProvider = new EllipsoidTerrainProvider();
  const flyTo = vi.fn(async () => true);
  const viewer = {
    imageryLayers,
    dataSources,
    entities,
    terrainProvider,
    scene: { primitives },
    flyTo
  };

  return {
    map: { viewer } as unknown as KairosMap,
    viewer,
    flyTo
  };
}

describe("default layer detached transactions", () => {
  it("implements addTo through prepare and attach", async () => {
    const { map, viewer } = createMapMock();
    const adapter = new ImageryConfigLayer({
      id: "imagery-add",
      type: "xyz",
      url: "https://example.com/{z}/{x}/{y}.png"
    });
    const prepare = vi.spyOn(adapter.transaction, "prepare");
    const attach = vi.spyOn(adapter.transaction, "attach");

    await adapter.addTo(map);

    expect(prepare).toHaveBeenCalledWith(map);
    expect(attach).toHaveBeenCalledWith(map);
    expect(viewer.imageryLayers.length).toBe(1);
    adapter.destroy();
  });

  it("reattaches the same imagery runtime and destroys it only on destroy", async () => {
    const { map, viewer } = createMapMock();
    const adapter = new ImageryConfigLayer({
      id: "imagery",
      type: "xyz",
      url: "https://example.com/{z}/{x}/{y}.png"
    });

    await adapter.transaction.prepare(map);
    const runtime = adapter.getRuntimeObjects()[0] as {
      isDestroyed(): boolean;
    };
    expect(viewer.imageryLayers.length).toBe(0);

    await adapter.transaction.attach(map);
    expect(viewer.imageryLayers.get(0)).toBe(runtime);

    await adapter.transaction.detach(map);
    expect(viewer.imageryLayers.length).toBe(0);
    expect(runtime.isDestroyed()).toBe(false);

    await adapter.transaction.attach(map);
    expect(viewer.imageryLayers.get(0)).toBe(runtime);
    adapter.destroy();

    expect(viewer.imageryLayers.length).toBe(0);
    expect(runtime.isDestroyed()).toBe(true);
  });

  it("retries imagery cleanup after attach mutates the collection and then throws", async () => {
    const { map, viewer } = createMapMock();
    const adapter = new ImageryConfigLayer({
      id: "imagery-attach-failure",
      type: "xyz",
      url: "https://example.com/{z}/{x}/{y}.png"
    });
    await adapter.transaction.prepare(map);

    const add = viewer.imageryLayers.add.bind(viewer.imageryLayers);
    const addSpy = vi.spyOn(viewer.imageryLayers, "add").mockImplementationOnce((layer, index) => {
      add(layer, index);
      throw new Error("imagery attach failed after add");
    });
    const removeSpy = vi.spyOn(viewer.imageryLayers, "remove").mockImplementationOnce(() => {
      throw new Error("imagery cleanup failed before remove");
    });

    await expect(adapter.transaction.attach(map)).rejects.toThrow(
      "imagery attach failed after add"
    );
    expect(viewer.imageryLayers.length).toBe(1);

    await adapter.transaction.detach(map);
    expect(viewer.imageryLayers.length).toBe(0);

    removeSpy.mockRestore();
    addSpy.mockRestore();
    adapter.destroy();
  });

  it("reattaches imagery after detach removes the runtime and then throws", async () => {
    const { map, viewer } = createMapMock();
    const adapter = new ImageryConfigLayer({
      id: "imagery-detach-failure",
      type: "xyz",
      url: "https://example.com/{z}/{x}/{y}.png"
    });
    await adapter.transaction.prepare(map);
    await adapter.transaction.attach(map);
    const runtime = adapter.getRuntimeObjects()[0];
    const remove = viewer.imageryLayers.remove.bind(viewer.imageryLayers);
    vi.spyOn(viewer.imageryLayers, "remove").mockImplementationOnce((layer, destroy) => {
      remove(layer, destroy);
      throw new Error("imagery detach failed after remove");
    });

    expect(() => adapter.transaction.detach(map)).toThrow(
      "imagery detach failed after remove"
    );
    expect(viewer.imageryLayers.contains(runtime as never)).toBe(false);

    await adapter.transaction.attach(map);
    expect(viewer.imageryLayers.contains(runtime as never)).toBe(true);
    adapter.destroy();
  });

  it("restores the previous terrain provider when detached", async () => {
    const { map, viewer } = createMapMock();
    const previous = viewer.terrainProvider;
    const adapter = new TerrainConfigLayer({ id: "terrain", type: "terrain" });

    await adapter.transaction.prepare(map);
    const runtime = adapter.getRuntimeObjects()[0];
    expect(viewer.terrainProvider).toBe(previous);

    await adapter.transaction.attach(map);
    expect(viewer.terrainProvider).toBe(runtime);

    await adapter.transaction.detach(map);
    expect(viewer.terrainProvider).toBe(previous);

    await adapter.transaction.attach(map);
    expect(viewer.terrainProvider).toBe(runtime);
    adapter.destroy();
    expect(viewer.terrainProvider).toBe(previous);
  });

  it("reattaches terrain after provider restoration mutates state and then throws", async () => {
    const { map, viewer } = createMapMock();
    let current = viewer.terrainProvider;
    let failNextSet = false;
    Object.defineProperty(viewer, "terrainProvider", {
      configurable: true,
      get: () => current,
      set: (value: typeof current) => {
        current = value;
        if (failNextSet) {
          failNextSet = false;
          throw new Error("terrain detach failed after restore");
        }
      }
    });
    const previous = current;
    const adapter = new TerrainConfigLayer({ id: "terrain-failure", type: "terrain" });
    await adapter.transaction.prepare(map);
    const runtime = adapter.getRuntimeObjects()[0];
    await adapter.transaction.attach(map);

    failNextSet = true;
    expect(() => adapter.transaction.detach(map)).toThrow(
      "terrain detach failed after restore"
    );
    expect(current).toBe(previous);

    await adapter.transaction.attach(map);
    expect(current).toBe(runtime);
    adapter.destroy();
  });

  it("uses the public async data-source collection API for GeoJSON reattachment", async () => {
    const { map, viewer, flyTo } = createMapMock();
    const adapter = new GeoJsonConfigLayer({
      id: "geojson",
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      flyTo: true
    });

    await adapter.transaction.prepare(map);
    const runtime = adapter.getRuntimeObjects()[0];
    expect(viewer.dataSources.length).toBe(0);

    await adapter.transaction.attach(map);
    expect(viewer.dataSources.get(0)).toBe(runtime);
    expect(flyTo).not.toHaveBeenCalled();

    await adapter.transaction.detach(map);
    expect(viewer.dataSources.length).toBe(0);
    await adapter.transaction.attach(map);
    expect(viewer.dataSources.get(0)).toBe(runtime);

    adapter.destroy();
    expect(viewer.dataSources.length).toBe(0);
  });

  it("reattaches GeoJSON after detach removes the data source and then throws", async () => {
    const { map, viewer } = createMapMock();
    const adapter = new GeoJsonConfigLayer({
      id: "geojson-failure",
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
    await adapter.transaction.prepare(map);
    await adapter.transaction.attach(map);
    const runtime = adapter.getRuntimeObjects()[0];
    const remove = viewer.dataSources.remove.bind(viewer.dataSources);
    vi.spyOn(viewer.dataSources, "remove").mockImplementationOnce((dataSource, destroy) => {
      remove(dataSource, destroy);
      throw new Error("GeoJSON detach failed after remove");
    });

    expect(() => adapter.transaction.detach(map)).toThrow(
      "GeoJSON detach failed after remove"
    );
    expect(viewer.dataSources.contains(runtime as never)).toBe(false);

    await adapter.transaction.attach(map);
    expect(viewer.dataSources.contains(runtime as never)).toBe(true);
    adapter.destroy();
  });

  it("prepares a glTF entity without adding it to the viewer", async () => {
    const { map, viewer, flyTo } = createMapMock();
    const adapter = new GltfConfigLayer({
      id: "model",
      type: "gltf",
      url: "/model.glb",
      position: new Cartesian3(1, 2, 3),
      flyTo: true
    });

    await adapter.transaction.prepare(map);
    const runtime = adapter.getRuntimeObjects()[0];
    expect(viewer.entities.values).toEqual([]);

    await adapter.transaction.attach(map);
    expect(viewer.entities.values).toEqual([runtime]);
    expect(flyTo).not.toHaveBeenCalled();

    await adapter.transaction.detach(map);
    expect(viewer.entities.values).toEqual([]);
    await adapter.transaction.attach(map);
    expect(viewer.entities.values).toEqual([runtime]);

    adapter.destroy();
    expect(viewer.entities.values).toEqual([]);
  });

  it("reattaches glTF after detach removes the entity and then throws", async () => {
    const { map, viewer } = createMapMock();
    const adapter = new GltfConfigLayer({
      id: "model-failure",
      type: "gltf",
      url: "/model.glb",
      position: new Cartesian3(1, 2, 3)
    });
    await adapter.transaction.prepare(map);
    await adapter.transaction.attach(map);
    const runtime = adapter.getRuntimeObjects()[0];
    const remove = viewer.entities.remove.bind(viewer.entities);
    vi.spyOn(viewer.entities, "remove").mockImplementationOnce((entity) => {
      remove(entity);
      throw new Error("glTF detach failed after remove");
    });

    expect(() => adapter.transaction.detach(map)).toThrow(
      "glTF detach failed after remove"
    );
    expect(viewer.entities.contains(runtime as never)).toBe(false);

    await adapter.transaction.attach(map);
    expect(viewer.entities.contains(runtime as never)).toBe(true);
    adapter.destroy();
  });

  it("detaches 3D Tiles without destroying the prepared tileset", async () => {
    const { map, viewer, flyTo } = createMapMock();
    let destroyed = false;
    const tileset = {
      show: true,
      isDestroyed: () => destroyed,
      destroy: vi.fn(() => {
        destroyed = true;
      })
    } as unknown as Cesium3DTileset;
    vi.spyOn(Cesium3DTileset, "fromUrl").mockResolvedValueOnce(tileset);
    const adapter = new TilesetConfigLayer({
      id: "tiles",
      type: "3dtiles",
      url: "/tileset.json",
      flyTo: true
    });

    await adapter.transaction.prepare(map);
    expect(viewer.scene.primitives.length).toBe(0);

    await adapter.transaction.attach(map);
    expect(viewer.scene.primitives.get(0)).toBe(tileset);
    expect(flyTo).not.toHaveBeenCalled();

    await adapter.transaction.detach(map);
    expect(viewer.scene.primitives.length).toBe(0);
    expect(tileset.isDestroyed()).toBe(false);

    await adapter.transaction.attach(map);
    expect(viewer.scene.primitives.get(0)).toBe(tileset);
    adapter.destroy();

    expect(viewer.scene.primitives.length).toBe(0);
    expect(tileset.isDestroyed()).toBe(true);
  });

  it("reattaches 3D Tiles after detach removes the primitive and then throws", async () => {
    const { map, viewer } = createMapMock();
    let destroyed = false;
    const tileset = {
      show: true,
      isDestroyed: () => destroyed,
      destroy: vi.fn(() => {
        destroyed = true;
      })
    } as unknown as Cesium3DTileset;
    vi.spyOn(Cesium3DTileset, "fromUrl").mockResolvedValueOnce(tileset);
    const adapter = new TilesetConfigLayer({
      id: "tiles-failure",
      type: "3dtiles",
      url: "/tileset.json"
    });
    await adapter.transaction.prepare(map);
    await adapter.transaction.attach(map);
    const remove = viewer.scene.primitives.remove.bind(viewer.scene.primitives);
    vi.spyOn(viewer.scene.primitives, "remove").mockImplementationOnce((primitive) => {
      remove(primitive);
      throw new Error("3D Tiles detach failed after remove");
    });

    expect(() => adapter.transaction.detach(map)).toThrow(
      "3D Tiles detach failed after remove"
    );
    expect(viewer.scene.primitives.contains(tileset)).toBe(false);

    await adapter.transaction.attach(map);
    expect(viewer.scene.primitives.contains(tileset)).toBe(true);
    adapter.destroy();
  });
});
