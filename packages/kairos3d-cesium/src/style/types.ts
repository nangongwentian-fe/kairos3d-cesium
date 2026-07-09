import type { Color } from "cesium";
import type { DrawType } from "../draw/types";

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

export interface BillboardSymbolStyle {
  color?: ColorLike;
  scale?: number;
  pixelOffset?: [number, number];
  width?: number;
  height?: number;
  rotation?: number;
  sizeInMeters?: boolean;
  disableDepthTestDistance?: number;
}

export interface ModelSymbolStyle {
  color?: ColorLike;
  scale?: number;
  minimumPixelSize?: number;
  maximumScale?: number;
  silhouetteColor?: ColorLike;
  silhouetteSize?: number;
  colorBlendAmount?: number;
}

export interface ResultSymbolStyle {
  point?: PointSymbolStyle;
  line?: LineSymbolStyle;
  polygon?: PolygonSymbolStyle;
  label?: LabelSymbolStyle;
  billboard?: BillboardSymbolStyle;
  model?: ModelSymbolStyle;
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

export interface SerializableBillboardSymbolStyle
  extends Omit<BillboardSymbolStyle, "color"> {
  color?: SerializableColor;
}

export interface SerializableModelSymbolStyle
  extends Omit<ModelSymbolStyle, "color" | "silhouetteColor"> {
  color?: SerializableColor;
  silhouetteColor?: SerializableColor;
}

export interface SerializableResultSymbolStyle {
  point?: SerializablePointSymbolStyle;
  line?: SerializableLineSymbolStyle;
  polygon?: SerializablePolygonSymbolStyle;
  label?: SerializableLabelSymbolStyle;
  billboard?: SerializableBillboardSymbolStyle;
  model?: SerializableModelSymbolStyle;
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
  draw?: Partial<Record<DrawType, ResultSymbolStyle>>;
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
