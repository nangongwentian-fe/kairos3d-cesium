import type { AnalysisResultsSnapshot } from "../analysis";
import type { DrawResultSnapshot } from "../draw";
import type { EffectSnapshot } from "../effects";
import type { LayerConfig } from "../layers";
import type { OverlaySnapshot } from "../overlays";
import type { AsyncOperationOptions, OperationErrorInfo } from "../operations";
import type { PrimitiveOverlaySnapshot } from "../primitives";

export const SCENE_SNAPSHOT_VERSION = 1;

export interface CameraView {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

export interface CameraFlightOptions {
  duration?: number;
  maximumHeight?: number;
  pitchAdjustHeight?: number;
  flyOverLongitude?: number;
  flyOverLongitudeWeight?: number;
  convert?: boolean;
}

export interface CameraBookmark {
  id: string;
  name?: string;
  view: CameraView;
  createdAt: string;
}

export type CameraBookmarkInput = Omit<CameraBookmark, "createdAt"> & {
  createdAt?: string;
};

export interface SceneSnapshot {
  version: 1;
  camera?: CameraView;
  layers: LayerConfig[];
  bookmarks: CameraBookmark[];
  results?: RuntimeResultsSnapshot;
  primitives?: PrimitiveOverlaySnapshot[];
  overlays?: OverlaySnapshot[];
  effects?: EffectSnapshot[];
  createdAt: string;
}

export interface RuntimeResultsSnapshot {
  draw: DrawResultSnapshot[];
  measure: AnalysisResultsSnapshot["measure"];
  visibility: AnalysisResultsSnapshot["visibility"];
  profile: AnalysisResultsSnapshot["profile"];
  clipping: AnalysisResultsSnapshot["clipping"];
  terrain: AnalysisResultsSnapshot["terrain"];
}

export interface SceneStateSnapshotOptions {
  includeResults?: boolean;
  includePrimitives?: boolean;
  includeOverlays?: boolean;
  includeEffects?: boolean;
}

export interface SceneStateLoadOptions extends AsyncOperationOptions {
  conflictPolicy?: "wait" | "reject";
  mode?: SceneLoadMode;
  clearLayers?: boolean;
  flyToCamera?: boolean;
  restoreResults?: boolean;
  clearResults?: boolean;
  restorePrimitives?: boolean;
  clearPrimitives?: boolean;
  restoreOverlays?: boolean;
  clearOverlays?: boolean;
  restoreEffects?: boolean;
  clearEffects?: boolean;
}

export type SceneLoadMode = "transactional" | "progressive";

export type SceneTransactionStatus =
  | "preparing"
  | "committing"
  | "rolling-back"
  | "succeeded"
  | "failed"
  | "canceled";

export type SceneRollbackStatus =
  | "not-needed"
  | "running"
  | "succeeded"
  | "failed";

export type SceneCleanupStatus =
  | "not-needed"
  | "running"
  | "succeeded"
  | "failed";

export interface SceneTransactionState {
  operationId: string;
  mode: SceneLoadMode;
  status: SceneTransactionStatus;
  stage?: string;
  rollbackStatus: SceneRollbackStatus;
  cleanupStatus: SceneCleanupStatus;
  error?: OperationErrorInfo;
  rollbackErrors?: OperationErrorInfo[];
  cleanupErrors?: OperationErrorInfo[];
  startedAt: Date;
  finishedAt?: Date;
}

export interface SceneStateManagerEvents {
  "transaction-change": SceneTransactionState;
}
