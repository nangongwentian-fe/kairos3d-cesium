import type { Cartesian3, Color, Entity } from "cesium";
import type { RuntimeResultLoadOptions, SerializablePosition } from "../core";
import type { HeightOptions } from "../height";
import type {
  ResultPrimitiveRuntime,
  ResultRenderMode
} from "../primitives";
import type { OverlayData } from "../overlays/types";
import type {
  ResultSymbolStyle,
  SerializableResultSymbolStyle
} from "../style";

export type DrawType =
  | "point"
  | "polyline"
  | "polygon"
  | "circle"
  | "rectangle"
  | "billboard"
  | "label"
  | "model";
export type DrawEditReason = "drag" | "insert" | "delete" | "programmatic";
export type DrawResultData = OverlayData;

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
  data?: DrawResultData;
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
  data?: DrawResultData;
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

export interface DrawCreateOptions {
  id?: string;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
  renderMode?: ResultRenderMode;
}

export interface DrawCircleOptions extends DrawCreateOptions {
  center: Cartesian3;
  radius: number;
  data?: Omit<DrawResultData, "radius">;
}

export interface DrawRectangleOptions extends DrawCreateOptions {
  positions: Cartesian3[];
  data?: DrawResultData;
}

export interface DrawBillboardOptions extends DrawCreateOptions {
  position: Cartesian3;
  image: string;
  scale?: number;
  data?: Omit<DrawResultData, "image" | "scale">;
}

export interface DrawLabelOptions extends DrawCreateOptions {
  position: Cartesian3;
  text: string;
  data?: Omit<DrawResultData, "text">;
}

export interface DrawModelOptions extends DrawCreateOptions {
  position: Cartesian3;
  uri: string;
  scale?: number;
  minimumPixelSize?: number;
  maximumScale?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  data?: Omit<
    DrawResultData,
    | "uri"
    | "scale"
    | "minimumPixelSize"
    | "maximumScale"
    | "heading"
    | "pitch"
    | "roll"
  >;
}

export interface DrawResultUpdateOptions {
  positions?: Cartesian3[];
  position?: Cartesian3;
  center?: Cartesian3;
  data?: DrawResultData;
  radius?: number;
  text?: string;
  image?: string;
  uri?: string;
  scale?: number;
  minimumPixelSize?: number;
  maximumScale?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  style?: ResultSymbolStyle;
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
