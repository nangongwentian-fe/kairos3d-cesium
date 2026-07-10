import { Cartesian2, Cartesian3, Ellipsoid, Entity, SceneTransforms } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { PickingManager } from "./manager";

function createMapMock(picked: unknown[] = []) {
  const position = Cartesian3.fromDegrees(114, 22, 100);
  const overlays = new Map<Entity, unknown>();
  const layer = {
    id: "layer-1",
    ownsRuntimeObject: vi.fn(() => true),
    getFeatureProperties: vi.fn(() => ({ fromLayer: true }))
  };
  const selection = {
    select: vi.fn()
  };

  return {
    layer,
    selection,
    map: {
      viewer: {
        scene: {
          canvas: {} as HTMLCanvasElement,
          drillPick: vi.fn(() => picked),
          pickPositionSupported: false,
          globe: {
            ellipsoid: Ellipsoid.WGS84
          }
        },
        camera: {
          pickEllipsoid: vi.fn(() => position),
          getPickRay: vi.fn()
        },
        imageryLayers: {
          pickImageryLayerFeatures: vi.fn()
        }
      },
      layers: {
        findByRuntimeObject: vi.fn(() => layer)
      },
      overlays: {
        findByEntity: vi.fn((entity: Entity) => overlays.get(entity)),
        list: vi.fn(() => [...overlays.values()])
      },
      selection
    } as unknown as KairosMap,
    overlays
  };
}

describe("PickingManager", () => {
  it("picks, normalizes, and emits a result", async () => {
    const entity = new Entity({ id: "entity-1", name: "Picked" });
    const { map, layer } = createMapMock([{ id: entity }]);
    const manager = new PickingManager(map);
    const listener = vi.fn();
    manager.on("pick", listener);

    const result = await manager.pick(new Cartesian2(10, 20));

    expect(result).toMatchObject({
      id: "entity-1",
      type: "entity",
      layerId: "layer-1",
      properties: { fromLayer: true }
    });
    expect(layer.getFeatureProperties).toHaveBeenCalledWith(entity);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ result })
      })
    );
  });

  it("binds only one click handler and destroys it", () => {
    const { map } = createMapMock();
    const firstHandler = { setInputAction: vi.fn(), destroy: vi.fn() };
    const secondHandler = { setInputAction: vi.fn(), destroy: vi.fn() };
    const createHandler = vi.fn()
      .mockReturnValueOnce(firstHandler)
      .mockReturnValueOnce(secondHandler);
    const manager = new PickingManager(map, createHandler);

    expect(manager.isClickEnabled()).toBe(false);
    manager.enableClick();
    expect(manager.isClickEnabled()).toBe(true);
    manager.enableClick();
    manager.disableClick();
    expect(manager.isClickEnabled()).toBe(false);

    expect(createHandler).toHaveBeenCalledTimes(2);
    expect(firstHandler.destroy).toHaveBeenCalledOnce();
    expect(secondHandler.destroy).toHaveBeenCalledOnce();
  });

  it("attributes picked SDK overlay entities before layer ownership", async () => {
    const entity = new Entity({ id: "overlay-entity" });
    const { map, overlays } = createMapMock([{ id: entity }]);
    overlays.set(entity, {
      id: "overlay-1",
      type: "label",
      entity,
      positions: [],
      data: { text: "Overlay" },
      metadata: { group: "test" },
      show: true,
      createdAt: new Date()
    });
    const manager = new PickingManager(map);

    const result = await manager.pick(new Cartesian2(10, 20));

    expect(result).toMatchObject({
      id: "overlay-entity",
      type: "entity",
      source: "overlay",
      overlayId: "overlay-1",
      overlayType: "label",
      layerId: undefined,
      properties: {
        overlayId: "overlay-1",
        overlayType: "label",
        data: { text: "Overlay" },
        metadata: { group: "test" }
      }
    });
    expect(map.layers.findByRuntimeObject).not.toHaveBeenCalled();
  });

  it("falls back to overlay screen distance when Cesium drillPick misses an overlay", async () => {
    const entity = new Entity({ id: "overlay-point" });
    const { map, overlays } = createMapMock([]);
    overlays.set(entity, {
      id: "overlay-1",
      type: "point",
      entity,
      positions: [new Cartesian3(1, 2, 3)],
      style: { point: { pixelSize: 20 } },
      show: true,
      createdAt: new Date()
    });
    const transformSpy = vi
      .spyOn(SceneTransforms, "worldToWindowCoordinates")
      .mockReturnValue(new Cartesian2(14, 24));
    const manager = new PickingManager(map);

    const result = await manager.pick(new Cartesian2(10, 20), { width: 16, height: 16 });

    expect(result).toMatchObject({
      id: "overlay-point",
      source: "overlay",
      overlayId: "overlay-1",
      overlayType: "point"
    });
    transformSpy.mockRestore();
  });
});
