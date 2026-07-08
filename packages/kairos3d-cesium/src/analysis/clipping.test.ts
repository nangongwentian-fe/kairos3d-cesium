import {
  Cartesian2,
  Cartesian3,
  ClippingPlaneCollection,
  ClippingPolygonCollection,
  Entity
} from "cesium";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import type { PickResult } from "../picking";
import { StyleManager } from "../style";
import { ClippingManager } from "./clipping";

interface ClippingHost {
  clippingPlanes?: ClippingPlaneCollection;
  clippingPolygons?: ClippingPolygonCollection;
}

function createMapMock(globe: ClippingHost = createClippingHost()) {
  return {
    viewer: {
      scene: {
        globe
      },
      entities: {
        add: vi.fn((options) => new Entity(options)),
        remove: vi.fn()
      }
    },
    layers: {
      get: vi.fn(),
      getRuntimeObjects: vi.fn()
    },
    tools: {
      start: vi.fn(),
      emitClear: vi.fn()
    },
    styles: new StyleManager()
  } as unknown as KairosMap;
}

function createClippingHost(): ClippingHost {
  return {
    clippingPlanes: undefined,
    clippingPolygons: undefined
  };
}

function createPositions(): Cartesian3[] {
  return [
    Cartesian3.fromDegrees(114, 22, 0),
    Cartesian3.fromDegrees(114.01, 22, 0),
    Cartesian3.fromDegrees(114.01, 22.01, 0)
  ];
}

function createPickResult(object: unknown): PickResult {
  return {
    id: "pick-1",
    type: "primitive",
    object,
    primitive: object,
    windowPosition: new Cartesian2(1, 2),
    properties: {}
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClippingManager", () => {
  it("adds plane clipping to the globe target", () => {
    const globe = createClippingHost();
    const map = createMapMock(globe);
    const manager = new ClippingManager(map);

    const result = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_X,
      distance: 0
    });

    expect(result.type).toBe("plane");
    expect(result.collection).toBe(globe.clippingPlanes);
    expect(result.collection.length).toBe(1);
    expect(manager.get(result.id)).toBe(result);
  });

  it("rejects invalid plane clipping parameters", () => {
    const map = createMapMock();
    const manager = new ClippingManager(map);

    expect(() =>
      manager.addPlane({
        target: { type: "globe" },
        normal: Cartesian3.ZERO,
        distance: 0
      })
    ).toThrow("non-zero Cartesian3");

    expect(() =>
      manager.addPlane({
        target: { type: "globe" },
        normal: Cartesian3.UNIT_X,
        distance: Number.POSITIVE_INFINITY
      })
    ).toThrow("finite number");
  });

  it("adds polygon clipping and renders a boundary entity", () => {
    vi.spyOn(ClippingPolygonCollection, "isSupported").mockReturnValue(true);
    const globe = createClippingHost();
    const map = createMapMock(globe);
    const manager = new ClippingManager(map);

    const result = manager.addPolygon({
      target: { type: "globe" },
      positions: createPositions(),
      inverse: true
    });

    expect(result.type).toBe("polygon");
    expect(result.collection).toBe(globe.clippingPolygons);
    expect(result.positions).toHaveLength(3);
    expect(result.entities).toHaveLength(1);
    expect(map.viewer.entities.add).toHaveBeenCalledTimes(1);
  });

  it("rejects polygon clipping when scene support is unavailable", () => {
    vi.spyOn(ClippingPolygonCollection, "isSupported").mockReturnValue(false);
    const map = createMapMock();
    const manager = new ClippingManager(map);

    expect(() =>
      manager.addPolygon({
        target: { type: "globe" },
        positions: createPositions()
      })
    ).toThrow("Polygon clipping is not supported");
  });

  it("rejects polygon clipping with fewer than three positions", () => {
    vi.spyOn(ClippingPolygonCollection, "isSupported").mockReturnValue(true);
    const map = createMapMock();
    const manager = new ClippingManager(map);

    expect(() =>
      manager.addPolygon({
        target: { type: "globe" },
        positions: createPositions().slice(0, 2)
      })
    ).toThrow("at least three positions");
  });

  it("restores the previous target collection when a result is removed", () => {
    const globe = createClippingHost();
    const previous = new ClippingPlaneCollection();
    globe.clippingPlanes = previous;
    const map = createMapMock(globe);
    const manager = new ClippingManager(map);
    const result = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_Z,
      distance: 10
    });

    expect(globe.clippingPlanes).toBe(result.collection);

    expect(manager.remove(result.id)).toBe(true);
    expect(globe.clippingPlanes).toBe(previous);
    expect(manager.get(result.id)).toBeUndefined();
    expect(map.tools.emitClear).toHaveBeenCalledWith({
      source: "clipping",
      ids: [result.id]
    });
  });

  it("replaces the previous SDK clipping result on the same target", () => {
    const globe = createClippingHost();
    const map = createMapMock(globe);
    const manager = new ClippingManager(map);
    const first = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_X,
      distance: 0
    });
    const second = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_Y,
      distance: 5
    });

    expect(manager.get(first.id)).toBeUndefined();
    expect(manager.get(second.id)).toBe(second);
    expect(globe.clippingPlanes).toBe(second.collection);
  });

  it("serializes and restores globe clipping results", async () => {
    const globe = createClippingHost();
    const map = createMapMock(globe);
    const manager = new ClippingManager(map);
    const result = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_X,
      distance: 12
    });
    manager.setEnabled(result.id, false);

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: result.id,
      type: "plane",
      target: { type: "globe" },
      enabled: false,
      distance: 12
    });
    expect(restored[0].id).toBe(result.id);
    expect(restored[0].enabled).toBe(false);
    expect(globe.clippingPlanes).toBe(restored[0].collection);
  });

  it("updates and restores clipping style", async () => {
    const globe = createClippingHost();
    const map = createMapMock(globe);
    const manager = new ClippingManager(map);
    const result = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_X,
      distance: 12
    });

    manager.setStyle(result.id, {
      line: { color: "#ff3b30", width: 6 }
    });
    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0].style?.line?.width).toBe(6);
    expect(restored[0].style?.line?.width).toBe(6);
    expect((restored[0].collection as ClippingPlaneCollection).edgeWidth).toBe(6);
  });

  it("serializes layer clipping targets and skips picked clipping targets", () => {
    const layerTarget = createClippingHost();
    const pickedTarget = createClippingHost();
    const map = createMapMock();
    vi.mocked(map.layers.getRuntimeObjects).mockReturnValue([layerTarget]);
    const manager = new ClippingManager(map);
    const layerResult = manager.addPlane({
      target: { type: "layer", layerId: "tileset" },
      normal: Cartesian3.UNIT_X,
      distance: 0
    });
    manager.addPlane({
      target: { type: "picked", result: createPickResult(pickedTarget) },
      normal: Cartesian3.UNIT_Y,
      distance: 0
    });

    expect(manager.toJSON()).toEqual([
      expect.objectContaining({
        id: layerResult.id,
        target: { type: "layer", layerId: "tileset" }
      })
    ]);
  });

  it("resolves layer and picked clipping targets", () => {
    const layerTarget = createClippingHost();
    const pickedTarget = createClippingHost();
    const map = createMapMock();
    vi.mocked(map.layers.getRuntimeObjects).mockReturnValue([layerTarget]);
    const manager = new ClippingManager(map);

    const layerResult = manager.addPlane({
      target: { type: "layer", layerId: "tileset" },
      normal: Cartesian3.UNIT_X,
      distance: 0
    });
    const pickedResult = manager.addPlane({
      target: { type: "picked", result: createPickResult(pickedTarget) },
      normal: Cartesian3.UNIT_Y,
      distance: 0
    });

    expect(layerTarget.clippingPlanes).toBe(layerResult.collection);
    expect(pickedTarget.clippingPlanes).toBe(pickedResult.collection);
  });

  it("starts the draw polygon tool through the shared tool manager", async () => {
    const map = createMapMock();
    const manager = new ClippingManager(map);

    await manager.drawPolygon({ target: { type: "globe" } });

    expect(map.tools.start).toHaveBeenCalledWith("analysis.clipping.drawPolygon", {
      target: { type: "globe" }
    });
  });
});
