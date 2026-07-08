import type { Cartesian3 } from "cesium";
import type { KairosMap } from "../core";
import type { Disposable } from "../core/disposable";
import type { AnalysisResult, MeasureResult } from "../analysis/types";
import type { DrawResult } from "../draw/types";

export type ToolCompleteResult = DrawResult | MeasureResult | AnalysisResult;

export interface ToolPointAddEvent {
  toolId: string;
  positions: Cartesian3[];
}

export interface ToolCancelEvent {
  toolId: string;
}

export interface ToolClearEvent {
  source: "draw" | "measure" | "visibility" | "profile" | "clipping" | "terrain";
  ids: string[];
}

export interface InteractiveToolEvents {
  cancel: ToolCancelEvent;
  complete: ToolCompleteResult;
  "point-add": ToolPointAddEvent;
  clear: ToolClearEvent;
}

export interface Tool<TOptions = unknown> extends Disposable {
  readonly id: string;
  start(options?: TOptions): Promise<void> | void;
  stop(): void;
  cancel?(): void;
}

export interface ToolFactory<TOptions = unknown> {
  (map: KairosMap): Tool<TOptions>;
}
