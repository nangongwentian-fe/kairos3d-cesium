import { Cartesian3, Entity } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { StyleManager } from "../style";
import { TerrainAnalysisManager } from "./terrain";
import type { ContourResultSnapshot } from "./types";

function createMapMock() {
  return {
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
