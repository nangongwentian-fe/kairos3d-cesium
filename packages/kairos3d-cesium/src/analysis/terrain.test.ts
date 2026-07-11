import { Cartesian3, Entity } from "cesium";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { RuntimeConcurrencyManager } from "../concurrency";
import {
  OperationCanceledError,
  OperationManager,
  type AsyncOperationOptions
} from "../operations";
import { StyleManager } from "../style";
import { TerrainAnalysisManager } from "./terrain";
import type {
  ContourOptions,
  ContourResultSnapshot,
  ExcavationOptions,
  FloodOptions,
  SlopeAspectOptions,
  VolumeOptions
} from "./types";

function createMapMock() {
  return {
    concurrency: new RuntimeConcurrencyManager(),
    viewer: {
      terrainProvider: {
        availability: undefined
      },
      entities: {
        add: vi.fn((options) => new Entity(options)),
        remove: vi.fn()
      }
    },
    tools: {
      start: vi.fn(),
      emitClear: vi.fn()
    },
    operations: new OperationManager(),
    styles: new StyleManager()
  } as unknown as KairosMap;
}

function createArea(): Cartesian3[] {
  return [
    Cartesian3.fromDegrees(114, 22, 0),
    Cartesian3.fromDegrees(114.001, 22, 0),
    Cartesian3.fromDegrees(114.001, 22.001, 0),
    Cartesian3.fromDegrees(114, 22.001, 0)
  ];
}

describe("TerrainAnalysisManager", () => {
  it("exposes optional operation options on all compute methods", () => {
    expectTypeOf<Parameters<TerrainAnalysisManager["slopeAspect"]>>().toEqualTypeOf<
      [SlopeAspectOptions, AsyncOperationOptions?]
    >();
    expectTypeOf<Parameters<TerrainAnalysisManager["volume"]>>().toEqualTypeOf<
      [VolumeOptions, AsyncOperationOptions?]
    >();
    expectTypeOf<Parameters<TerrainAnalysisManager["flood"]>>().toEqualTypeOf<
      [FloodOptions, AsyncOperationOptions?]
    >();
    expectTypeOf<Parameters<TerrainAnalysisManager["excavation"]>>().toEqualTypeOf<
      [ExcavationOptions, AsyncOperationOptions?]
    >();
    expectTypeOf<Parameters<TerrainAnalysisManager["contour"]>>().toEqualTypeOf<
      [ContourOptions, AsyncOperationOptions?]
    >();
  });

  it("starts contour draw through the shared tool manager", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);

    await manager.drawContour({ interval: 5, sampleStep: 50 });

    expect(map.tools.start).toHaveBeenCalledWith("analysis.terrain.drawContour", {
      interval: 5,
      sampleStep: 50
    });
  });

  it("computes and stores slope-aspect results", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const result = await manager.slopeAspect({
      area: createArea(),
      sampleStep: 80,
      maxSamples: 16
    });

    expect(result.type).toBe("slope-aspect");
    expect(result.grid.samples.length).toBeGreaterThan(0);
    expect(result.grid.sampled).toBe(false);
    expect(result.entities.length).toBeGreaterThan(0);
    expect(manager.get(result.id)).toBe(result);
    expect(map.operations.list({ kind: "analysis.terrain.slope-aspect" })[0]).toMatchObject({
      status: "succeeded",
      progress: 1
    });
  });

  it("restores only terrain entities detached before a commit failure", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const first = await manager.slopeAspect({
      area: createArea(),
      sampleStep: 80,
      maxSamples: 16
    });
    const second = await manager.slopeAspect({
      area: createArea(),
      sampleStep: 80,
      maxSamples: 16
    });
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
    add.mockClear();
    vi.mocked(map.viewer.entities.remove).mockImplementation((entity) => {
      if (entity === failingEntity) {
        throw new Error("detach failed");
      }
      return current.delete(entity.id);
    });
    Object.assign(map.viewer.entities, {
      getById: (id: string) => current.get(id)
    });
    const snapshot = {
      ...manager.toJSON()[0],
      id: "terrain-new"
    };
    const stage = await manager.prepareSceneLoad([snapshot], { clear: true });

    expect(() => stage.commit()).toThrow("detach failed");
    expect(() => stage.rollback()).not.toThrow();
    await stage.dispose();

    for (const entity of allEntities) {
      expect(current.get(entity.id)).toBe(entity);
    }
    expect(add).toHaveBeenCalledTimes(first.entities.length);
  });

  it("computes contour results and serializes them", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const result = await manager.contour({
      area: createArea(),
      interval: 5,
      sampleStep: 80,
      maxSamples: 16,
      style: { line: { color: "#00d4ff", width: 4 } }
    });

    const snapshot = manager.toJSON();

    expect(result.type).toBe("contour");
    expect(snapshot[0]).toMatchObject({
      id: result.id,
      type: "contour",
      interval: 5,
      sampleStep: 80
    });
    expect(snapshot[0].style?.line?.width).toBe(4);
    expect(map.operations.list({ kind: "analysis.terrain.contour" })).toHaveLength(1);
  });

  it("computes volume, flood, and excavation results", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const area = createArea();

    const volume = await manager.volume({
      area,
      baseHeight: 10,
      sampleStep: 80,
      maxSamples: 16
    });
    const flood = await manager.flood({
      area,
      waterHeight: 10,
      sampleStep: 80,
      maxSamples: 16
    });
    const excavation = await manager.excavation({
      area,
      depth: 5,
      sampleStep: 80,
      maxSamples: 16
    });

    expect(volume.type).toBe("volume");
    expect(volume.fillVolume).toBeGreaterThan(0);
    expect(volume.netVolume).toBeLessThan(0);
    expect(flood.type).toBe("flood");
    expect(flood.floodedArea).toBeGreaterThan(0);
    expect(flood.waterVolume).toBeGreaterThan(0);
    expect(excavation.type).toBe("excavation");
    expect(excavation.bottomHeight).toBe(-5);
    expect(excavation.cutVolume).toBeGreaterThan(0);
    expect(manager.list()).toHaveLength(3);
    expect(map.operations.list().map((operation) => operation.kind)).toEqual(
      expect.arrayContaining([
        "analysis.terrain.volume",
        "analysis.terrain.flood",
        "analysis.terrain.excavation"
      ])
    );
  });

  it("does not sample, render, or store an already canceled terrain analysis", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const controller = new AbortController();
    controller.abort();

    await expect(
      manager.volume(
        {
          area: createArea(),
          baseHeight: 10,
          sampleStep: 80,
          maxSamples: 16
        },
        { signal: controller.signal, operationId: "terrain-canceled" }
      )
    ).rejects.toBeInstanceOf(OperationCanceledError);

    expect(manager.list()).toEqual([]);
    expect(map.viewer.entities.add).not.toHaveBeenCalled();
    expect(map.operations.get("terrain-canceled")).toMatchObject({
      kind: "analysis.terrain.volume",
      status: "canceled"
    });
  });

  it("does not render when a progress listener cancels terrain analysis", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    map.operations.on("change", (event) => {
      if (event.data.phase === "render" && event.data.status === "running") {
        map.operations.cancel(event.data.id);
      }
    });

    await expect(
      manager.contour(
        {
          area: createArea(),
          interval: 5,
          sampleStep: 80,
          maxSamples: 16
        },
        { operationId: "terrain-render-canceled" }
      )
    ).rejects.toBeInstanceOf(OperationCanceledError);

    expect(manager.list()).toEqual([]);
    expect(map.viewer.entities.add).not.toHaveBeenCalled();
  });

  it("rolls back terrain entities when cancellation races the add event", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    manager.on("add", () => {
      queueMicrotask(() => map.operations.cancel("terrain-add-canceled"));
    });

    await expect(
      manager.volume(
        {
          area: createArea(),
          baseHeight: 10,
          sampleStep: 80,
          maxSamples: 16
        },
        { operationId: "terrain-add-canceled" }
      )
    ).rejects.toBeInstanceOf(OperationCanceledError);

    expect(manager.list()).toEqual([]);
    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(
      vi.mocked(map.viewer.entities.add).mock.calls.length
    );
  });

  it("serializes and restores data-first terrain volume results", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const result = await manager.volume({
      area: createArea(),
      baseHeight: 10,
      sampleStep: 80,
      maxSamples: 16,
      style: { polygon: { fillColor: "#ffcc00" } }
    });
    const snapshot = manager.toJSON();
    const restoredMap = createMapMock();
    const restoredManager = new TerrainAnalysisManager(restoredMap);

    const restored = await restoredManager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: result.id,
      type: "volume",
      baseHeight: 10,
      fillVolume: result.fillVolume
    });
    expect(snapshot[0].style?.polygon?.fillColor).toBeDefined();
    expect(restored[0]).toMatchObject({
      id: result.id,
      type: "volume",
      baseHeight: 10
    });
    expect(restored[0].entities.length).toBeGreaterThan(0);
  });

  it("restores contour snapshots without resampling terrain", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const snapshot: ContourResultSnapshot = {
      id: "contour-1",
      type: "contour",
      area: [
        { longitude: 114, latitude: 22, height: 0 },
        { longitude: 114.001, latitude: 22, height: 0 },
        { longitude: 114.001, latitude: 22.001, height: 0 }
      ],
      interval: 10,
      sampleStep: 50,
      lines: [
        {
          height: 10,
          positions: [
            { longitude: 114, latitude: 22, height: 10 },
            { longitude: 114.001, latitude: 22, height: 10 }
          ]
        }
      ],
      minHeight: 0,
      maxHeight: 20,
      createdAt: "2026-07-08T00:00:00.000Z"
    };

    const restored = await manager.load([snapshot]);

    expect(restored[0]).toMatchObject({
      id: "contour-1",
      type: "contour",
      minHeight: 0,
      maxHeight: 20
    });
    expect(restored[0].entities).toHaveLength(1);
  });

  it("validates terrain snapshots before clearing existing results", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const existing = await manager.slopeAspect({
      area: createArea(),
      sampleStep: 80,
      maxSamples: 16
    });
    const invalidSnapshot: ContourResultSnapshot = {
      id: "contour-bad",
      type: "contour",
      area: [
        { longitude: 114, latitude: 22, height: 0 },
        { longitude: 114.001, latitude: 22, height: 0 },
        { longitude: 114.001, latitude: 22.001, height: 0 }
      ],
      interval: 10,
      sampleStep: Number.NaN,
      lines: [],
      minHeight: 0,
      maxHeight: 20,
      createdAt: "2026-07-08T00:00:00.000Z"
    };

    await expect(manager.load([invalidSnapshot], { clear: true })).rejects.toThrow(
      "Terrain contour sampleStep must be a finite number."
    );

    expect(manager.list()).toEqual([existing]);
  });

  it("rejects duplicate terrain snapshot ids before restoring", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const snapshot: ContourResultSnapshot = {
      id: "contour-duplicate",
      type: "contour",
      area: [
        { longitude: 114, latitude: 22, height: 0 },
        { longitude: 114.001, latitude: 22, height: 0 },
        { longitude: 114.001, latitude: 22.001, height: 0 }
      ],
      interval: 10,
      sampleStep: 50,
      lines: [],
      minHeight: 0,
      maxHeight: 20,
      createdAt: "2026-07-08T00:00:00.000Z"
    };

    await expect(manager.load([snapshot, snapshot])).rejects.toThrow(
      'Terrain result snapshot id "contour-duplicate" is duplicated.'
    );
    expect(manager.list()).toEqual([]);
  });

  it("updates style and clears terrain results", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const result = await manager.slopeAspect({
      area: createArea(),
      sampleStep: 80,
      maxSamples: 16
    });

    manager.setStyle(result.id, {
      polygon: { fillColor: "#ffcc00" },
      line: { color: "#ffcc00", width: 3 }
    });
    manager.clear();

    expect(map.viewer.entities.remove).toHaveBeenCalled();
    expect(map.tools.emitClear).toHaveBeenCalledWith({
      source: "terrain",
      ids: [result.id]
    });
    expect(manager.list()).toEqual([]);
  });

  it("replaces duplicate terrain result ids without leaking previous entities", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const first = await manager.slopeAspect({
      area: createArea(),
      sampleStep: 80,
      maxSamples: 16
    });
    const second = {
      ...first,
      entities: [new Entity({ id: "replacement" })]
    };

    manager.addResult(first);
    manager.addResult(second);

    for (const entity of first.entities) {
      expect(map.viewer.entities.remove).toHaveBeenCalledWith(entity);
    }
    expect(manager.list()).toEqual([second]);
  });

  it("updates styles for non-contour terrain area results", async () => {
    const map = createMapMock();
    const manager = new TerrainAnalysisManager(map);
    const result = await manager.flood({
      area: createArea(),
      waterHeight: 10,
      sampleStep: 80,
      maxSamples: 16
    });

    const styled = manager.setStyle(result.id, {
      polygon: { fillColor: "#00d4ff" },
      line: { color: "#00d4ff", width: 4 }
    });

    expect(styled.type).toBe("flood");
    expect(styled.style?.line?.width).toBe(4);
    expect(map.viewer.entities.remove).toHaveBeenCalled();
    expect(styled.entities.length).toBeGreaterThan(0);
  });
});
