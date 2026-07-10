import { Cartesian3, Entity } from "cesium";
import { beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { KairosMap } from "../core";
import {
  OperationCanceledError,
  OperationManager,
  type AsyncOperationOptions
} from "../operations";
import { StyleManager } from "../style";
import { MeasureManager, ProfileManager, VisibilityManager } from "./manager";
import type {
  MeasureResult,
  ProfileComputeOptions,
  VisibilityComputeOptions
} from "./types";

beforeAll(() => {
  vi.stubGlobal("HTMLCanvasElement", class HTMLCanvasElementMock {});
  vi.stubGlobal("HTMLImageElement", class HTMLImageElementMock {});
  vi.stubGlobal("HTMLVideoElement", class HTMLVideoElementMock {});
  vi.stubGlobal("ImageBitmap", class ImageBitmapMock {});
  vi.stubGlobal("OffscreenCanvas", class OffscreenCanvasMock {});
});

function createMapMock() {
  return {
    viewer: {
      terrainProvider: {
        availability: undefined
      },
      scene: {
        primitives: {
          add: vi.fn((primitive) => primitive),
          remove: vi.fn(() => true)
        }
      },
      entities: {
        add: vi.fn((options) => new Entity(options)),
        remove: vi.fn()
      }
    },
    height: {
      resolvePositions: vi.fn(async (positions: Cartesian3[]) =>
        positions.map((position) => Cartesian3.clone(position))
      )
    },
    tools: {
      start: vi.fn(),
      stop: vi.fn(),
      emitClear: vi.fn()
    },
    operations: new OperationManager(),
    styles: new StyleManager()
  } as unknown as KairosMap;
}

function createResult(id: string): MeasureResult {
  const entities = [{ id: `${id}-line` }, { id: `${id}-label` }] as Entity[];
  return {
    id,
    type: "distance",
    positions: [
      Cartesian3.fromDegrees(114, 22, 10),
      Cartesian3.fromDegrees(114.01, 22.01, 20)
    ],
    value: 10,
    unit: "m",
    label: "10.00 m",
    entities,
    entityIds: entities.map((entity) => entity.id),
    createdAt: new Date()
  };
}

describe("MeasureManager", () => {
  it("starts measure tools through the shared tool manager", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);

    await manager.distance();
    await manager.area();
    await manager.height();

    expect(map.tools.start).toHaveBeenNthCalledWith(1, "measure.distance", undefined);
    expect(map.tools.start).toHaveBeenNthCalledWith(2, "measure.area", undefined);
    expect(map.tools.start).toHaveBeenNthCalledWith(3, "measure.height", undefined);
  });

  it("removes one measurement result and all related entities", () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    const result = createResult("measure-1");

    manager.addResult(result);

    expect(manager.remove("measure-1")).toBe(true);
    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(2);
    expect(map.tools.emitClear).toHaveBeenCalledWith({ source: "measure", ids: ["measure-1"] });
    expect(manager.get("measure-1")).toBeUndefined();
  });

  it("replaces duplicate measurement ids without leaking previous entities", () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    const first = createResult("measure-1");
    const second = createResult("measure-1");

    manager.addResult(first);
    manager.addResult(first);
    manager.addResult(second);

    for (const entity of first.entities) {
      expect(map.viewer.entities.remove).toHaveBeenCalledWith(entity);
    }
    expect(manager.list()).toEqual([second]);
  });

  it("clears all measurement results", () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    manager.addResult(createResult("measure-1"));
    manager.addResult(createResult("measure-2"));

    manager.clear();

    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(4);
    expect(map.tools.emitClear).toHaveBeenCalledWith({
      source: "measure",
      ids: ["measure-1", "measure-2"]
    });
    expect(manager.list()).toEqual([]);
  });

  it("serializes and restores measurement results", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    const result = createResult("measure-1");
    result.height = { mode: "clampToGround" };
    result.mode = "surface";
    manager.addResult(result);

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: "measure-1",
      type: "distance",
      value: 10,
      unit: "m",
      height: { mode: "clampToGround" },
      mode: "surface"
    });
    expect(restored[0].id).toBe("measure-1");
    expect(restored[0].height).toEqual({ mode: "clampToGround" });
    expect(restored[0].mode).toBe("surface");
    expect(restored[0].positions).toHaveLength(2);
    expect(restored[0].entities.length).toBeGreaterThan(0);
    expect(manager.get("measure-1")).toBe(restored[0]);
  });

  it("validates measurement snapshots before clearing existing results", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    const existing = createResult("measure-existing");
    manager.addResult(existing);

    await expect(
      manager.load(
        [
          {
            id: "measure-bad",
            type: "distance",
            positions: [{ longitude: 114, latitude: 22, height: 10 }],
            value: 0,
            unit: "m",
            createdAt: "2026-07-08T00:00:00.000Z"
          }
        ],
        { clear: true }
      )
    ).rejects.toThrow('Measure result "distance" requires at least 2 positions.');

    expect(manager.list()).toEqual([existing]);
    expect(map.viewer.entities.remove).not.toHaveBeenCalled();
  });

  it("rejects duplicate measurement snapshot ids before restoring", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    const snapshot = {
      id: "measure-duplicate",
      type: "distance" as const,
      positions: [
        { longitude: 114, latitude: 22, height: 10 },
        { longitude: 114.01, latitude: 22.01, height: 20 }
      ],
      value: 10,
      unit: "m" as const,
      createdAt: "2026-07-08T00:00:00.000Z"
    };

    await expect(manager.load([snapshot, snapshot])).rejects.toThrow(
      'Measure result snapshot id "measure-duplicate" is duplicated.'
    );
    expect(manager.list()).toEqual([]);
  });

  it("updates and restores measurement style", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    manager.addResult(createResult("measure-1"));

    manager.setStyle("measure-1", {
      line: { color: "#ff3b30", width: 5 },
      label: { color: "#ffffff" }
    });
    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0].style?.line?.width).toBe(5);
    expect(restored[0].style?.line?.width).toBe(5);
    expect(restored[0].entities.length).toBeGreaterThan(0);
  });

  it("restores primitive-backed measurement results and cleans them up", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);

    const restored = await manager.load([
      {
        id: "measure-primitive",
        type: "distance",
        positions: [
          { longitude: 114, latitude: 22, height: 10 },
          { longitude: 114.01, latitude: 22.01, height: 20 }
        ],
        value: 10,
        unit: "m",
        label: "10.00 m",
        createdAt: "2026-07-08T00:00:00.000Z",
        renderMode: "primitive",
        style: {
          line: { color: { red: 0, green: 1, blue: 1, alpha: 1 }, width: 4 }
        }
      }
    ]);

    expect(restored[0]).toMatchObject({
      id: "measure-primitive",
      renderMode: "primitive"
    });
    expect(restored[0].entities).toHaveLength(1);
    expect(restored[0].primitives).toHaveLength(1);
    expect(manager.toJSON()[0].renderMode).toBe("primitive");

    manager.setStyle("measure-primitive", {
      line: { color: "#35d07f", width: 6 },
      label: { color: "#ffffff" }
    });
    expect(manager.get("measure-primitive")?.primitives).toHaveLength(1);

    expect(manager.remove("measure-primitive")).toBe(true);
    expect(map.viewer.scene.primitives.remove).toHaveBeenCalled();
  });

  it("restores only measurement entities detached before a commit failure", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    const first = manager.addResult(createResult("measure-old-1"));
    const second = manager.addResult(createResult("measure-old-2"));
    const allEntities = [...first.entities, ...second.entities];
    const current = new Map(allEntities.map((entity) => [entity.id, entity]));
    const failingEntity = second.entities[0];
    const add = vi.mocked(map.viewer.entities.add).mockImplementation((entity) => {
      const value = entity as Entity;
      if (current.has(value.id)) {
        throw new Error(`duplicate ${value.id}`);
      }
      current.set(value.id, value);
      return value;
    });
    vi.mocked(map.viewer.entities.remove).mockImplementation((entity) => {
      if (entity === failingEntity) {
        throw new Error("detach failed");
      }
      return current.delete(entity.id);
    });
    Object.assign(map.viewer.entities, {
      getById: (id: string) => current.get(id)
    });
    const stage = await manager.prepareSceneLoad(
      [
        {
          id: "measure-new",
          type: "distance",
          positions: [
            { longitude: 114, latitude: 22, height: 10 },
            { longitude: 114.01, latitude: 22.01, height: 20 }
          ],
          value: 10,
          unit: "m",
          createdAt: "2026-07-10T01:00:00.000Z"
        }
      ],
      { clear: true }
    );

    expect(() => stage.commit()).toThrow("detach failed");
    expect(() => stage.rollback()).not.toThrow();
    await stage.dispose();

    for (const entity of allEntities) {
      expect(current.get(entity.id)).toBe(entity);
    }
    expect(add).toHaveBeenCalledTimes(2);
  });
});

describe("VisibilityManager", () => {
  it("exposes optional operation options on compute", () => {
    expectTypeOf<Parameters<VisibilityManager["compute"]>>().toEqualTypeOf<
      [VisibilityComputeOptions, AsyncOperationOptions?]
    >();
  });

  it("starts visibility pick through the shared tool manager", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);

    await manager.pick({ sampleCount: 16 });

    expect(map.tools.start).toHaveBeenCalledWith("analysis.visibility.pick", {
      sampleCount: 16
    });
  });

  it("computes and stores a visibility result with render entities", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const result = await manager.compute({
      start: Cartesian3.fromDegrees(114, 22, 100),
      end: Cartesian3.fromDegrees(114.01, 22, 100),
      sampleCount: 8
    });

    expect(result.type).toBe("visibility");
    expect(result.visible).toBe(true);
    expect(result.positions).toHaveLength(2);
    expect(result.entities.length).toBeGreaterThan(0);
    expect(manager.get(result.id)).toBe(result);
  });

  it("tracks visibility operations and does not commit canceled results", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const controller = new AbortController();
    let resolveHeight!: (positions: Cartesian3[]) => void;
    vi.mocked(map.height.resolvePositions).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveHeight = resolve;
      })
    );

    const promise = manager.compute(
      {
        start: Cartesian3.fromDegrees(114, 22, 100),
        end: Cartesian3.fromDegrees(114.01, 22, 100),
        height: { mode: "absolute" }
      },
      { signal: controller.signal, operationId: "visibility-canceled" }
    );
    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(OperationCanceledError);
    resolveHeight([
      Cartesian3.fromDegrees(114, 22, 100),
      Cartesian3.fromDegrees(114.01, 22, 100)
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(manager.list()).toEqual([]);
    expect(map.viewer.entities.add).not.toHaveBeenCalled();
    expect(map.operations.get("visibility-canceled")).toMatchObject({
      kind: "analysis.visibility",
      status: "canceled"
    });
  });

  it("does not render when a progress listener cancels visibility", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    map.operations.on("change", (event) => {
      if (event.data.phase === "render" && event.data.status === "running") {
        map.operations.cancel(event.data.id);
      }
    });

    await expect(
      manager.compute(
        {
          start: Cartesian3.fromDegrees(114, 22, 100),
          end: Cartesian3.fromDegrees(114.01, 22, 100),
          sampleCount: 8
        },
        { operationId: "visibility-render-canceled" }
      )
    ).rejects.toBeInstanceOf(OperationCanceledError);

    expect(manager.list()).toEqual([]);
    expect(map.viewer.entities.add).not.toHaveBeenCalled();
  });

  it("removes visibility result entities", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const result = await manager.compute({
      start: Cartesian3.fromDegrees(114, 22, 100),
      end: Cartesian3.fromDegrees(114.01, 22, 100),
      sampleCount: 8
    });

    expect(manager.remove(result.id)).toBe(true);
    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(result.entities.length);
    expect(map.tools.emitClear).toHaveBeenCalledWith({
      source: "visibility",
      ids: [result.id]
    });
  });

  it("serializes and restores visibility results", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const result = await manager.compute({
      start: Cartesian3.fromDegrees(114, 22, 100),
      end: Cartesian3.fromDegrees(114.01, 22, 100),
      sampleCount: 8
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: result.id,
      type: "visibility",
      visible: true
    });
    expect(restored[0].id).toBe(result.id);
    expect(restored[0].positions).toHaveLength(2);
    expect(restored[0].entities.length).toBeGreaterThan(0);
  });

  it("validates visibility snapshots before clearing existing results", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const existing = await manager.compute({
      start: Cartesian3.fromDegrees(114, 22, 100),
      end: Cartesian3.fromDegrees(114.01, 22, 100),
      sampleCount: 8
    });

    await expect(
      manager.load(
        [
          {
            id: "visibility-bad",
            type: "visibility",
            positions: [
              { longitude: 114, latitude: 22, height: 100 },
              { longitude: 114.01, latitude: 22, height: 100 }
            ],
            visible: true,
            distance: Number.NaN,
            createdAt: "2026-07-08T00:00:00.000Z"
          }
        ],
        { clear: true }
      )
    ).rejects.toThrow("Visibility result distance must be a finite number.");

    expect(manager.list()).toEqual([existing]);
  });

  it("serializes and restores visibility style", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const result = await manager.compute({
      start: Cartesian3.fromDegrees(114, 22, 100),
      end: Cartesian3.fromDegrees(114.01, 22, 100),
      sampleCount: 8,
      height: { mode: "clampToGround" },
      style: {
        visibleLine: { color: "#35d07f", width: 4 }
      }
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0].style?.visibleLine?.width).toBe(4);
    expect(snapshot[0].height).toEqual({ mode: "clampToGround" });
    expect(restored[0].id).toBe(result.id);
    expect(restored[0].style?.visibleLine?.width).toBe(4);
    expect(restored[0].height).toEqual({ mode: "clampToGround" });
  });
});

describe("ProfileManager", () => {
  it("exposes optional operation options on compute", () => {
    expectTypeOf<Parameters<ProfileManager["compute"]>>().toEqualTypeOf<
      [ProfileComputeOptions, AsyncOperationOptions?]
    >();
  });

  it("starts profile draw through the shared tool manager", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);

    await manager.draw({ sampleCount: 16 });

    expect(map.tools.start).toHaveBeenCalledWith("analysis.profile.draw", {
      sampleCount: 16
    });
  });

  it("computes and stores a profile result", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    const result = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      sampleCount: 5
    });

    expect(result.type).toBe("profile");
    expect(result.samples).toHaveLength(5);
    expect(result.totalDistance).toBeGreaterThan(0);
    expect(result.minHeight).toBe(0);
    expect(result.maxHeight).toBe(0);
    expect(result.entities.length).toBe(3);
    expect(manager.get(result.id)).toBe(result);
    expect(map.operations.list({ kind: "analysis.profile" })[0]).toMatchObject({
      status: "succeeded",
      progress: 1,
      phase: "render"
    });
  });

  it("rolls back profile entities when cancellation races the add event", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    manager.on("add", () => {
      queueMicrotask(() => map.operations.cancel("profile-add-canceled"));
    });

    await expect(
      manager.compute(
        {
          positions: [
            Cartesian3.fromDegrees(114, 22, 0),
            Cartesian3.fromDegrees(114.01, 22, 0)
          ],
          sampleCount: 5
        },
        { operationId: "profile-add-canceled" }
      )
    ).rejects.toBeInstanceOf(OperationCanceledError);

    expect(manager.list()).toEqual([]);
    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(
      vi.mocked(map.viewer.entities.add).mock.calls.length
    );
  });

  it("clears profile result entities", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    const first = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      sampleCount: 3
    });
    const second = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(115, 22, 0),
        Cartesian3.fromDegrees(115.01, 22, 0)
      ],
      sampleCount: 3
    });

    manager.clear();

    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(
      first.entities.length + second.entities.length
    );
    expect(map.tools.emitClear).toHaveBeenCalledWith({
      source: "profile",
      ids: [first.id, second.id]
    });
    expect(manager.list()).toEqual([]);
  });

  it("serializes and restores profile results", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    const result = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      sampleCount: 3,
      height: { mode: "relativeToGround", offset: 5 }
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: result.id,
      type: "profile",
      totalDistance: result.totalDistance,
      height: { mode: "relativeToGround", offset: 5 }
    });
    expect(restored[0].id).toBe(result.id);
    expect(restored[0].height).toEqual({ mode: "relativeToGround", offset: 5 });
    expect(restored[0].samples).toHaveLength(3);
    expect(restored[0].entities.length).toBeGreaterThan(0);
  });

  it("validates profile snapshots before clearing existing results", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    const existing = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      sampleCount: 3
    });

    await expect(
      manager.load(
        [
          {
            id: "profile-bad",
            type: "profile",
            positions: [
              { longitude: 114, latitude: 22, height: 0 },
              { longitude: 114.01, latitude: 22, height: 0 }
            ],
            samples: [
              {
                position: { longitude: 114, latitude: 22, height: 0 },
                distance: Number.NaN,
                height: 0
              }
            ],
            totalDistance: 10,
            minHeight: 0,
            maxHeight: 0,
            createdAt: "2026-07-08T00:00:00.000Z"
          }
        ],
        { clear: true }
      )
    ).rejects.toThrow("Profile sample distance must be a finite number.");

    expect(manager.list()).toEqual([existing]);
  });

  it("updates and restores profile style", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    const result = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      sampleCount: 3
    });

    manager.setStyle(result.id, {
      line: { color: "#00d4ff", width: 6 },
      point: { pixelSize: 10 }
    });
    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0].style?.line?.width).toBe(6);
    expect(restored[0].style?.point?.pixelSize).toBe(10);
  });
});
