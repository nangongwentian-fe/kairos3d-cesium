import type { Cartesian3, Color, Entity } from "cesium";
import type { RuntimeResultLoadOptions, SerializablePosition } from "../core";
import type { HeightOptions } from "../height";
import type {
  ResultPrimitiveRuntime,
  ResultRenderMode
} from "../primitives";
import type {
  ResultSymbolStyle,
  SerializableResultSymbolStyle
} from "../style";

export type DrawType = "point" | "polyline" | "polygon";
export type DrawEditReason = "drag" | "insert" | "delete" | "programmatic";

export interface DrawStyle {
  pointColor?: Color;
  lineColor?: Color;
  fillColor?: Color;
  pointSize?: number;
  lineWidth?: number;
}

export interface DrawResult {
  id: string;
  type: DrawType;
  entity: Entity;
  positions: Cartesian3[];
  createdAt: Date;
  updatedAt?: Date;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
  renderMode?: ResultRenderMode;
  primitives?: ResultPrimitiveRuntime[];
}

export interface DrawResultSnapshot {
  id: string;
  type: DrawType;
  positions: SerializablePosition[];
  createdAt: string;
  updatedAt?: string;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
  renderMode?: ResultRenderMode;
}

export type DrawResultLoadOptions = RuntimeResultLoadOptions;

export interface DrawToolOptions {
  style?: ResultSymbolStyle | DrawStyle;
  once?: boolean;
  height?: HeightOptions;
  renderMode?: ResultRenderMode;
}

export interface DrawEditHandleStyle {
  vertexColor?: Color;
  midpointColor?: Color;
  selectedColor?: Color;
  pixelSize?: number;
}

export interface DrawEditOptions {
  allowInsert?: boolean;
  allowDelete?: boolean;
  showMidpoints?: boolean;
  handleStyle?: DrawEditHandleStyle;
}

export interface DrawEditStartOptions extends DrawEditOptions {
  resultId: string;
}

export interface DrawEditEvent {
  result: DrawResult;
  previousPositions: Cartesian3[];
  positions: Cartesian3[];
  reason: DrawEditReason;
}
