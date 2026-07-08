import { Cartesian2, Cartesian3, Ellipsoid, Entity } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { PickingManager } from "./manager";

function createMapMock(picked: unknown[] = []) {
  const position = Cartesian3.fromDegrees(114, 22, 100);
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
      selection
    } as unknown as KairosMap
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

    manager.enableClick();
    manager.enableClick();
    manager.disableClick();

    expect(createHandler).toHaveBeenCalledTimes(2);
    expect(firstHandler.destroy).toHaveBeenCalledOnce();
    expect(secondHandler.destroy).toHaveBeenCalledOnce();
  });
});
