import type { ResultSource, SDKManagedResult } from "../results";
import type { ResultRenderMode } from "../primitives";

export interface PerformanceBudget {
  maxEntities?: number;
  maxResults?: number;
  maxResultEntities?: number;
  maxLayerRuntimeObjects?: number;
}

export type PerformanceWarningCode =
  | "entity-budget"
  | "result-budget"
  | "result-entity-budget"
  | "layer-runtime-budget";

export interface PerformanceWarning {
  code: PerformanceWarningCode;
  message: string;
  current: number;
  limit: number;
}

export interface ResultPerformanceRecord {
  id: string;
  source: ResultSource;
  type: SDKManagedResult["type"];
  entityCount: number;
  primitiveCount: number;
  renderMode?: ResultRenderMode;
  createdAt: Date;
}

export interface ResultPerformanceSummary {
  count: number;
  entityCount: number;
  primitiveCount: number;
}

export interface LayerPerformanceRecord {
  id: string;
  type: string;
  show: boolean;
  runtimeObjectCount: number;
}

export interface LayerPerformanceSummary {
  count: number;
  runtimeObjectCount: number;
}

export interface PerformanceStatsOptions {
  budget?: PerformanceBudget;
}

export interface PerformanceStats {
  createdAt: Date;
  entityCount: number;
  resultCount: number;
  resultEntityCount: number;
  resultPrimitiveCount: number;
  unmanagedEntityCount: number;
  overlayEntityCount: number;
  primitiveOverlayCount: number;
  layerCount: number;
  layerRuntimeObjectCount: number;
  effectCount: number;
  effectRuntimeObjectCount: number;
  animatedEffectCount: number;
  results: ResultPerformanceRecord[];
  resultBySource: Partial<Record<ResultSource, ResultPerformanceSummary>>;
  resultByType: Partial<Record<SDKManagedResult["type"], ResultPerformanceSummary>>;
  layers: LayerPerformanceRecord[];
  layerByType: Record<string, LayerPerformanceSummary>;
  budget?: PerformanceBudget;
  warnings: PerformanceWarning[];
}

export interface PrimitiveCandidateOptions {
  minEntityCount?: number;
}

export interface PrimitiveOptimizationCandidate {
  id: string;
  source: ResultSource;
  type: SDKManagedResult["type"];
  entityCount: number;
  priority: "low" | "medium" | "high";
  reason: string;
}
