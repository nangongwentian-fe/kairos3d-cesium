import type { Color } from "cesium";

export interface SerializableColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export type ColorLike = Color | string | SerializableColor;

export interface PointSymbolStyle {
  color?: ColorLike;
  pixelSize?: number;
  outlineColor?: ColorLike;
  outlineWidth?: number;
}

export interface LineSymbolStyle {
  color?: ColorLike;
  width?: number;
  clampToGround?: boolean;
}

export interface PolygonSymbolStyle {
  fillColor?: ColorLike;
  outlineColor?: ColorLike;
  outlineWidth?: number;
  clampToGround?: boolean;
}

export interface LabelSymbolStyle {
  color?: ColorLike;
  outlineColor?: ColorLike;
  font?: string;
  pixelOffset?: [number, number];
}

export interface ResultSymbolStyle {
  point?: PointSymbolStyle;
  line?: LineSymbolStyle;
  polygon?: PolygonSymbolStyle;
  label?: LabelSymbolStyle;
  visibleLine?: LineSymbolStyle;
  blockedLine?: LineSymbolStyle;
  blockedPoint?: PointSymbolStyle;
}

export interface SerializablePointSymbolStyle
  extends Omit<PointSymbolStyle, "color" | "outlineColor"> {
  color?: SerializableColor;
  outlineColor?: SerializableColor;
}

export interface SerializableLineSymbolStyle extends Omit<LineSymbolStyle, "color"> {
  color?: SerializableColor;
}

export interface SerializablePolygonSymbolStyle
  extends Omit<PolygonSymbolStyle, "fillColor" | "outlineColor"> {
  fillColor?: SerializableColor;
  outlineColor?: SerializableColor;
}

export interface SerializableLabelSymbolStyle
  extends Omit<LabelSymbolStyle, "color" | "outlineColor"> {
  color?: SerializableColor;
  outlineColor?: SerializableColor;
}

export interface SerializableResultSymbolStyle {
  point?: SerializablePointSymbolStyle;
  line?: SerializableLineSymbolStyle;
  polygon?: SerializablePolygonSymbolStyle;
  label?: SerializableLabelSymbolStyle;
  visibleLine?: SerializableLineSymbolStyle;
  blockedLine?: SerializableLineSymbolStyle;
  blockedPoint?: SerializablePointSymbolStyle;
}

export interface SelectionSymbolStyle {
  entity?: {
    point?: PointSymbolStyle;
  };
  tilesFeature?: {
    color?: ColorLike;
  };
}

export interface SDKStyleDefaults {
  draw?: {
    point?: ResultSymbolStyle;
    polyline?: ResultSymbolStyle;
    polygon?: ResultSymbolStyle;
  };
  measure?: {
    distance?: ResultSymbolStyle;
    area?: ResultSymbolStyle;
    height?: ResultSymbolStyle;
  };
  visibility?: ResultSymbolStyle;
  profile?: ResultSymbolStyle;
  clipping?: ResultSymbolStyle;
  terrain?: {
    "slope-aspect"?: ResultSymbolStyle;
    contour?: ResultSymbolStyle;
    volume?: ResultSymbolStyle;
    flood?: ResultSymbolStyle;
    excavation?: ResultSymbolStyle;
  };
  selection?: SelectionSymbolStyle;
}
