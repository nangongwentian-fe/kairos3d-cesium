import type {
  AnalysisResult,
  ClippingResult,
  MeasureResult,
  ProfileResult,
  TerrainResult,
  VisibilityResult
} from "../analysis";
import type { DrawResult } from "../draw";

export type ResultSource =
  | "draw"
  | "measure"
  | "visibility"
  | "profile"
  | "clipping"
  | "terrain";

export type SDKManagedResult =
  | DrawResult
  | MeasureResult
  | VisibilityResult
  | ProfileResult
  | ClippingResult
  | TerrainResult;

export interface ResultRecord<R extends SDKManagedResult = SDKManagedResult> {
  id: string;
  source: ResultSource;
  type: R["type"];
  result: R;
  createdAt: Date;
}

export interface ResultQueryOptions {
  source?: ResultSource | ResultSource[];
  type?: SDKManagedResult["type"] | SDKManagedResult["type"][];
}

export interface ResultManagerEvents {
  add: ResultRecord;
  remove: ResultRecord;
  clear: ResultRecord[];
}

export type AnalysisManagedResult = AnalysisResult | MeasureResult;
