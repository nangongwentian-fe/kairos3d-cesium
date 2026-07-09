import type { Cartesian3, Color, Entity } from "cesium";
import type { RuntimeResultLoadOptions, SerializablePosition } from "../core";
import type { HeightOptions } from "../height";
import type {
  ResultPrimitiveRuntime,
  ResultRenderMode
} from "../primitives";
import type {
  BoxOverlayOptions,
  CorridorOverlayOptions,
  CylinderOverlayOptions,
  EllipseOverlayOptions,
  KairosGeoJsonFeatureCollection,
  OverlayData,
  OverlayQueryOptions,
  WallOverlayOptions
} from "../overlays/types";
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
  | "model"
  | "ellipse"
  | "wall"
  | "corridor"
  | "box"
  | "cylinder";
export type DrawEditReason = "drag" | "insert" | "delete" | "programmatic";
export type DrawResultData = OverlayData;
export type DrawQueryOptions = OverlayQueryOptions;
export type DrawGeoJsonFeatureCollection = KairosGeoJsonFeatureCollection;

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
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  show: boolean;
  locked: boolean;
  editable: boolean;
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
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  show?: boolean;
  locked?: boolean;
  editable?: boolean;
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
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  show?: boolean;
  locked?: boolean;
  editable?: boolean;
}

export interface DrawWallToolOptions extends DrawToolOptions {
  minimumHeights?: number[];
  maximumHeights?: number[];
}

export interface DrawCorridorToolOptions extends DrawToolOptions {
  width?: number;
}

export interface DrawBoxToolOptions extends DrawToolOptions {
  dimensions?: [number, number, number];
}

export interface DrawCylinderToolOptions extends DrawToolOptions {
  length?: number;
  topRadius?: number;
  bottomRadius?: number;
}

export interface DrawCreateOptions {
  id?: string;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
  renderMode?: ResultRenderMode;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  show?: boolean;
  locked?: boolean;
  editable?: boolean;
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

export interface DrawEllipseOptions extends DrawCreateOptions, EllipseOverlayOptions {}

export interface DrawWallOptions extends DrawCreateOptions, WallOverlayOptions {}

export interface DrawCorridorOptions extends DrawCreateOptions, CorridorOverlayOptions {}

export interface DrawBoxOptions extends DrawCreateOptions, BoxOverlayOptions {}

export interface DrawCylinderOptions extends DrawCreateOptions, CylinderOverlayOptions {}

export interface DrawResultUpdateOptions {
  positions?: Cartesian3[];
  position?: Cartesian3;
  center?: Cartesian3;
  data?: DrawResultData;
  radius?: number;
  semiMajorAxis?: number;
  semiMinorAxis?: number;
  width?: number;
  minimumHeights?: number[];
  maximumHeights?: number[];
  dimensions?: [number, number, number];
  length?: number;
  topRadius?: number;
  bottomRadius?: number;
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
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  show?: boolean;
  locked?: boolean;
  editable?: boolean;
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
