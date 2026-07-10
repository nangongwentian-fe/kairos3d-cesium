import { Entity } from "cesium";
import { describe, expect, it } from "vitest";
import type { KairosMap } from "../core";
import type { ResultRecord, ResultSource } from "../results";
import { PerformanceManager } from "./manager";

function createRecord(
  id: string,
  source: ResultSource,
  type: ResultRecord["type"],
  entityCount: number,
  primitiveCount = 0
): ResultRecord {
  const entities = Array.from({ length: entityCount }, (_, index) =>
    new Entity({ id: `${id}-entity-${index}` })
  );
  const primitives = Array.from({ length: primitiveCount }, (_, index) => ({
    id: `${id}-primitive-${index}`
  }));
  return {
    id,
    source,
    type,
    result: {
      id,
      type,
      entities,
      primitives,
      renderMode: primitiveCount > 0 ? "primitive" : "entity",
      createdAt: new Date("2026-07-08T00:00:00.000Z")
    } as never,
    createdAt: new Date("2026-07-08T00:00:00.000Z")
  };
}

function createMapMock(records: ResultRecord[] = [], overlayCount = 0) {
  const runtimeObjects = new Map<string, unknown[]>([
    ["tileset", [{ kind: "tileset" }]],
    ["geojson", [{ kind: "geojson" }, { kind: "data-source" }]]
  ]);
  return {
    viewer: {
      entities: {
        values: [
          new Entity({ id: "entity-1" }),
          new Entity({ id: "entity-2" }),
          new Entity({ id: "entity-3" }),
          new Entity({ id: "entity-4" }),
          new Entity({ id: "entity-5" })
        ]
      }
    },
    results: {
      list: () => records
    },
    layers: {
      listState: () => [
        { id: "tileset", type: "3dtiles", show: true, order: 0 },
        { id: "geojson", type: "geojson", show: false, order: 1 }
      ],
      getRuntimeObjects: (id: string) => runtimeObjects.get(id) ?? []
    },
    primitives: {
      list: () => [{ id: "primitive-1" }]
    },
    overlays: {
      list: () => Array.from({ length: overlayCount }, (_, index) => ({ id: `overlay-${index}` }))
    },
    effects: {
      list: () => [
        { id: "flow-1", type: "flow-line" },
        { id: "fog-1", type: "fog" }
      ],
      getRuntimeObjectCount: () => 3,
      getAnimatedCount: () => 2
    }
  } as unknown as KairosMap;
}

describe("PerformanceManager", () => {
  it("collects entity, result, and layer runtime stats", () => {
    const manager = new PerformanceManager(
      createMapMock([
        createRecord("draw-1", "draw", "polyline", 1),
        createRecord("terrain-1", "terrain", "contour", 3)
      ], 1)
    );

    const stats = manager.getStats();

    expect(stats.entityCount).toBe(5);
    expect(stats.resultCount).toBe(2);
    expect(stats.resultEntityCount).toBe(4);
    expect(stats.resultPrimitiveCount).toBe(0);
    expect(stats.overlayEntityCount).toBe(1);
    expect(stats.unmanagedEntityCount).toBe(0);
    expect(stats.primitiveOverlayCount).toBe(1);
    expect(stats.layerCount).toBe(2);
    expect(stats.layerRuntimeObjectCount).toBe(3);
    expect(stats.effectCount).toBe(2);
    expect(stats.effectRuntimeObjectCount).toBe(3);
    expect(stats.animatedEffectCount).toBe(2);
    expect(stats.resultBySource.draw).toMatchObject({
      count: 1,
      entityCount: 1,
      primitiveCount: 0
    });
    expect(stats.resultByType.contour).toMatchObject({
      count: 1,
      entityCount: 3,
      primitiveCount: 0
    });
    expect(stats.layerByType.geojson).toMatchObject({ count: 1, runtimeObjectCount: 2 });
  });

  it("reports budget warnings", () => {
    const manager = new PerformanceManager(
      createMapMock([createRecord("profile-1", "profile", "profile", 4)])
    );

    const warnings = manager.checkBudget({
      maxEntities: 2,
      maxResults: 0,
      maxResultEntities: 2,
      maxLayerRuntimeObjects: 2
    });

    expect(warnings.map((warning) => warning.code)).toEqual([
      "entity-budget",
      "result-budget",
      "result-entity-budget",
      "layer-runtime-budget"
    ]);
  });

  it("stores normalized budgets", () => {
    const manager = new PerformanceManager(createMapMock());

    expect(manager.setBudget({ maxEntities: 2.8 })).toEqual({
      maxEntities: 2,
      maxResults: undefined,
      maxResultEntities: undefined,
      maxLayerRuntimeObjects: undefined
    });
    expect(() => manager.setBudget({ maxResults: Number.NaN })).toThrow(
      "Performance budget maxResults must be a non-negative finite number."
    );
  });

  it("recommends primitive candidates for entity-heavy results", () => {
    const manager = new PerformanceManager(
      createMapMock([
        createRecord("contour-1", "terrain", "contour", 10),
        createRecord("draw-1", "draw", "polyline", 2),
        createRecord("draw-primitive", "draw", "polyline", 12, 1)
      ])
    );

    const candidates = manager.recommendPrimitiveCandidates({ minEntityCount: 5 });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: "contour-1",
      source: "terrain",
      type: "contour",
      entityCount: 10,
      priority: "medium"
    });
    expect(() => manager.recommendPrimitiveCandidates({ minEntityCount: 0 })).toThrow(
      "Primitive candidate minEntityCount must be a positive finite number."
    );
  });
});
