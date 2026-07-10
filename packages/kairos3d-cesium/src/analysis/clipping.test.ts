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
      stop: vi.fn(),
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

  it("validates clipping snapshots before clearing existing results", async () => {
    const globe = createClippingHost();
    const map = createMapMock(globe);
    vi.mocked(map.layers.getRuntimeObjects).mockReturnValue([]);
    const manager = new ClippingManager(map);
    const existing = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_X,
      distance: 12
    });

    await expect(
      manager.load(
        [
          {
            id: "missing-layer-clipping",
            type: "plane",
            target: { type: "layer", layerId: "missing" },
            enabled: true,
            normal: { x: 1, y: 0, z: 0 },
            distance: 0,
            createdAt: "2026-07-08T00:00:00.000Z"
          }
        ],
        { clear: true }
      )
    ).rejects.toThrow('Clipping target "layer" does not support plane clipping.');

    expect(manager.get(existing.id)).toBe(existing);
    expect(globe.clippingPlanes).toBe(existing.collection);
  });

  it("rejects duplicate clipping snapshot ids before restoring", async () => {
    const globe = createClippingHost();
    const map = createMapMock(globe);
    const manager = new ClippingManager(map);
    const result = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_X,
      distance: 12
    });
    const snapshot = manager.toJSON()[0];

    await expect(manager.load([snapshot, snapshot])).rejects.toThrow(
      `Clipping result snapshot id "${result.id}" is duplicated.`
    );
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

  it("updates plane clipping while keeping the result id stable", () => {
    const globe = createClippingHost();
    const map = createMapMock(globe);
    const manager = new ClippingManager(map);
    const result = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_X,
      distance: 1
    });

    const updated = manager.updatePlane(result.id, {
      normal: Cartesian3.UNIT_Y,
      distance: 8,
      enabled: false,
      edgeWidth: 5
    });

    expect(updated.id).toBe(result.id);
    expect(updated.enabled).toBe(false);
    expect((updated.collection as ClippingPlaneCollection).get(0).distance).toBe(8);
    expect((updated.collection as ClippingPlaneCollection).edgeWidth).toBe(5);
    expect(globe.clippingPlanes).toBe(updated.collection);
  });

  it("updates polygon clipping positions and rejects invalid updates", () => {
    vi.spyOn(ClippingPolygonCollection, "isSupported").mockReturnValue(true);
    const map = createMapMock();
    const manager = new ClippingManager(map);
    const result = manager.addPolygon({
      target: { type: "globe" },
      positions: createPositions()
    });
    const nextPositions = [
      Cartesian3.fromDegrees(114, 22, 0),
      Cartesian3.fromDegrees(114.02, 22, 0),
      Cartesian3.fromDegrees(114.02, 22.02, 0)
    ];

    const updated = manager.updatePolygon(result.id, nextPositions, { inverse: true });

    expect(updated.id).toBe(result.id);
    expect(updated.positions).toEqual(nextPositions);
    expect((updated.collection as ClippingPolygonCollection).inverse).toBe(true);
    expect(() => manager.updatePolygon(result.id, nextPositions.slice(0, 2))).toThrow(
      "at least three positions"
    );
  });

  it("can stop or cancel an edit session and clean temporary handles", () => {
    vi.spyOn(ClippingPolygonCollection, "isSupported").mockReturnValue(true);
    const map = createMapMock();
    const manager = new ClippingManager(map);
    const result = manager.addPolygon({
      target: { type: "globe" },
      positions: createPositions()
    });

    manager.edit(result.id);
    expect(map.tools.stop).toHaveBeenCalledOnce();
    expect(map.viewer.entities.add).toHaveBeenCalledTimes(4);

    const changedPositions = [
      Cartesian3.fromDegrees(114, 22, 0),
      Cartesian3.fromDegrees(114.03, 22, 0),
      Cartesian3.fromDegrees(114.03, 22.03, 0)
    ];
    manager.updatePolygon(result.id, changedPositions);
    const restored = manager.cancelEdit();

    expect(restored?.id).toBe(result.id);
    expect(restored?.positions).toEqual(createPositions());
    expect(map.viewer.entities.remove).toHaveBeenCalled();

    manager.edit(result.id);
    expect(manager.stopEdit()?.id).toBe(result.id);
  });

  it("does not clear the active clipping edit session when editing a missing id", () => {
    vi.spyOn(ClippingPolygonCollection, "isSupported").mockReturnValue(true);
    const map = createMapMock();
    const manager = new ClippingManager(map);
    const result = manager.addPolygon({
      target: { type: "globe" },
      positions: createPositions()
    });

    manager.edit(result.id);
    expect(() => manager.edit("missing")).toThrow(
      'Clipping result "missing" does not exist.'
    );

    expect(map.tools.stop).toHaveBeenCalledOnce();
    expect(map.viewer.entities.remove).not.toHaveBeenCalled();
    expect(manager.stopEdit()?.id).toBe(result.id);
  });

  it("defers layer target resolution until commit and rolls it back", async () => {
    const host = createClippingHost();
    const map = createMapMock();
    const manager = new ClippingManager(map);
    const getRuntimeObjects = vi.mocked(map.layers.getRuntimeObjects);

    const stage = await manager.prepareSceneLoad(
      [
        {
          id: "clip-layer",
          type: "plane",
          target: { type: "layer", layerId: "layer-next" },
          enabled: true,
          normal: { x: 1, y: 0, z: 0 },
          distance: 10,
          createdAt: "2026-07-10T00:00:00.000Z"
        }
      ],
      { clear: true }
    );

    expect(getRuntimeObjects).not.toHaveBeenCalled();
    getRuntimeObjects.mockReturnValue([host]);
    await stage.commit();
    const result = manager.get("clip-layer")!;
    expect(host.clippingPlanes).toBe(result.collection);

    await stage.rollback();
    await stage.dispose();
    expect(host.clippingPlanes).toBeUndefined();
    expect(manager.get("clip-layer")).toBeUndefined();
  });

  it("restores only clipping targets detached before a commit failure", async () => {
    const globe = createClippingHost();
    const layerHost = createClippingHost();
    const map = createMapMock(globe);
    vi.mocked(map.layers.getRuntimeObjects).mockReturnValue([layerHost]);
    const manager = new ClippingManager(map);
    const first = manager.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_X,
      distance: 0
    });
    const second = manager.addPlane({
      target: { type: "layer", layerId: "layer-old" },
      normal: Cartesian3.UNIT_Y,
      distance: 0
    });
    Object.defineProperty(layerHost, "clippingPlanes", {
      configurable: true,
      get: () => second.collection,
      set: () => {
        throw new Error("detach failed");
      }
    });
    const stage = await manager.prepareSceneLoad(
      [
        {
          id: "clip-new",
          type: "plane",
          target: { type: "globe" },
          enabled: true,
          normal: { x: 1, y: 0, z: 0 },
          distance: 10,
          createdAt: "2026-07-10T00:00:00.000Z"
        }
      ],
      { clear: true }
    );

    expect(() => stage.commit()).toThrow("detach failed");
    expect(() => stage.rollback()).not.toThrow();
    await stage.dispose();

    expect(globe.clippingPlanes).toBe(first.collection);
    expect(layerHost.clippingPlanes).toBe(second.collection);
    expect(manager.get(first.id)).toBe(first);
    expect(manager.get(second.id)).toBe(second);
  });
});
