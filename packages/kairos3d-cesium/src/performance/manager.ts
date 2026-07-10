import type { Entity } from "cesium";
import type { KairosMap } from "../core";
import { countResultPrimitiveRuntimes } from "../primitives";
import type {
  ResultPerformanceRecord,
  ResultPerformanceSummary
} from "./types";
import type {
  LayerPerformanceRecord,
  LayerPerformanceSummary,
  PerformanceBudget,
  PerformanceStats,
  PerformanceStatsOptions,
  PerformanceWarning,
  PrimitiveCandidateOptions,
  PrimitiveOptimizationCandidate
} from "./types";

export class PerformanceManager {
  private budget: PerformanceBudget = {};

  constructor(private readonly map: KairosMap) {}

  setBudget(budget: PerformanceBudget): PerformanceBudget {
    this.budget = normalizeBudget(budget);
    return this.getBudget();
  }

  getBudget(): PerformanceBudget {
    return { ...this.budget };
  }

  getStats(options: PerformanceStatsOptions = {}): PerformanceStats {
    const budget = options.budget ? normalizeBudget(options.budget) : this.getBudget();
    const results = this.map.results.list().map((record) => ({
      id: record.id,
      source: record.source,
      type: record.type,
      entityCount: countResultEntities(record.result),
      primitiveCount: countResultPrimitiveRuntimes(record.result),
      renderMode: getResultRenderMode(record.result),
      createdAt: record.createdAt
    }));
    const layers = this.map.layers.listState().map((layer) => ({
      id: layer.id,
      type: layer.type,
      show: layer.show,
      runtimeObjectCount: this.map.layers.getRuntimeObjects(layer.id).length
    }));
    const resultEntityCount = results.reduce((sum, result) => sum + result.entityCount, 0);
    const resultPrimitiveCount = results.reduce(
      (sum, result) => sum + result.primitiveCount,
      0
    );
    const overlayEntityCount = countOverlayEntities(this.map);
    const layerRuntimeObjectCount = layers.reduce(
      (sum, layer) => sum + layer.runtimeObjectCount,
      0
    );
    const entityCount = countViewerEntities(this.map);
    const statsWithoutWarnings = {
      createdAt: new Date(),
      entityCount,
      resultCount: results.length,
      resultEntityCount,
      resultPrimitiveCount,
      unmanagedEntityCount: Math.max(
        0,
        entityCount - resultEntityCount - overlayEntityCount
      ),
      overlayEntityCount,
      primitiveOverlayCount: this.map.primitives.list().length,
      layerCount: layers.length,
      layerRuntimeObjectCount,
      effectCount: this.map.effects.list().length,
      effectRuntimeObjectCount: this.map.effects.getRuntimeObjectCount(),
      animatedEffectCount: this.map.effects.getAnimatedCount(),
      results,
      resultBySource: summarizeResultsBySource(results),
      resultByType: summarizeResultsByType(results),
      layers,
      layerByType: summarizeLayersByType(layers),
      budget,
      warnings: []
    };

    return {
      ...statsWithoutWarnings,
      warnings: createWarnings(statsWithoutWarnings, budget)
    };
  }

  checkBudget(budget?: PerformanceBudget): PerformanceWarning[] {
    return this.getStats({ budget }).warnings;
  }

  recommendPrimitiveCandidates(
    options: PrimitiveCandidateOptions = {}
  ): PrimitiveOptimizationCandidate[] {
    const minEntityCount = normalizeThreshold(options.minEntityCount ?? 20);
    return this.getStats().results
      .filter((record) => record.entityCount >= minEntityCount && record.primitiveCount === 0)
      .map((record) => ({
        id: record.id,
        source: record.source,
        type: record.type,
        entityCount: record.entityCount,
        priority: getCandidatePriority(record.entityCount, minEntityCount),
        reason: `Result uses ${record.entityCount} Cesium entities. Consider a Primitive renderer if this result is long-lived or frequently updated.`
      }));
  }

  destroy(): void {
    this.budget = {};
  }
}

function countViewerEntities(map: KairosMap): number {
  const collection = map.viewer.entities as unknown as { values?: Entity[] };
  return Array.isArray(collection.values) ? collection.values.length : 0;
}

function countOverlayEntities(map: KairosMap): number {
  const overlays = map.overlays as unknown as { list?: () => unknown[] } | undefined;
  return overlays?.list?.().length ?? 0;
}

function countResultEntities(result: unknown): number {
  if (isRecord(result) && Array.isArray(result.entities)) {
    return result.entities.length;
  }

  if (isRecord(result) && result.entity) {
    return 1;
  }

  return 0;
}

function getResultRenderMode(result: unknown): ResultPerformanceRecord["renderMode"] {
  if (isRecord(result) && result.renderMode === "primitive") {
    return "primitive";
  }
  return "entity";
}

function summarizeResultsBySource(
  results: ResultPerformanceRecord[]
): PerformanceStats["resultBySource"] {
  return results.reduce<PerformanceStats["resultBySource"]>((summary, result) => {
    const current = summary[result.source] ?? createResultSummary();
    current.count += 1;
    current.entityCount += result.entityCount;
    current.primitiveCount += result.primitiveCount;
    summary[result.source] = current;
    return summary;
  }, {});
}

function summarizeResultsByType(
  results: ResultPerformanceRecord[]
): PerformanceStats["resultByType"] {
  return results.reduce<PerformanceStats["resultByType"]>((summary, result) => {
    const current = summary[result.type] ?? createResultSummary();
    current.count += 1;
    current.entityCount += result.entityCount;
    current.primitiveCount += result.primitiveCount;
    summary[result.type] = current;
    return summary;
  }, {});
}

function summarizeLayersByType(
  layers: LayerPerformanceRecord[]
): Record<string, LayerPerformanceSummary> {
  return layers.reduce<Record<string, LayerPerformanceSummary>>((summary, layer) => {
    const current = summary[layer.type] ?? { count: 0, runtimeObjectCount: 0 };
    current.count += 1;
    current.runtimeObjectCount += layer.runtimeObjectCount;
    summary[layer.type] = current;
    return summary;
  }, {});
}

function createResultSummary(): ResultPerformanceSummary {
  return { count: 0, entityCount: 0, primitiveCount: 0 };
}

function createWarnings(
  stats: Omit<PerformanceStats, "warnings">,
  budget: PerformanceBudget
): PerformanceWarning[] {
  const warnings: PerformanceWarning[] = [];
  pushWarning(warnings, "entity-budget", "Cesium entity count exceeds budget.", stats.entityCount, budget.maxEntities);
  pushWarning(warnings, "result-budget", "SDK-managed result count exceeds budget.", stats.resultCount, budget.maxResults);
  pushWarning(warnings, "result-entity-budget", "SDK-managed result entity count exceeds budget.", stats.resultEntityCount, budget.maxResultEntities);
  pushWarning(warnings, "layer-runtime-budget", "Layer runtime object count exceeds budget.", stats.layerRuntimeObjectCount, budget.maxLayerRuntimeObjects);
  return warnings;
}

function pushWarning(
  warnings: PerformanceWarning[],
  code: PerformanceWarning["code"],
  message: string,
  current: number,
  limit: number | undefined
): void {
  if (limit !== undefined && current > limit) {
    warnings.push({ code, message, current, limit });
  }
}

function normalizeBudget(budget: PerformanceBudget): PerformanceBudget {
  return {
    maxEntities: normalizeOptionalPositiveInteger(budget.maxEntities, "maxEntities"),
    maxResults: normalizeOptionalPositiveInteger(budget.maxResults, "maxResults"),
    maxResultEntities: normalizeOptionalPositiveInteger(
      budget.maxResultEntities,
      "maxResultEntities"
    ),
    maxLayerRuntimeObjects: normalizeOptionalPositiveInteger(
      budget.maxLayerRuntimeObjects,
      "maxLayerRuntimeObjects"
    )
  };
}

function normalizeOptionalPositiveInteger(
  value: number | undefined,
  label: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Performance budget ${label} must be a non-negative finite number.`);
  }
  return Math.floor(value);
}

function normalizeThreshold(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Primitive candidate minEntityCount must be a positive finite number.");
  }
  return Math.floor(value);
}

function getCandidatePriority(
  entityCount: number,
  minEntityCount: number
): PrimitiveOptimizationCandidate["priority"] {
  if (entityCount >= minEntityCount * 3) {
    return "high";
  }
  if (entityCount >= minEntityCount * 2) {
    return "medium";
  }
  return "low";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
