import type { AnalysisResultsSnapshot } from "../analysis";
import type { DrawResultSnapshot } from "../draw";
import type { LayerConfig } from "../layers";

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
}

export interface SceneStateLoadOptions {
  clearLayers?: boolean;
  flyToCamera?: boolean;
  restoreResults?: boolean;
  clearResults?: boolean;
}
