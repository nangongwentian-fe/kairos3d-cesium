import type { Cartesian3, Entity } from "cesium";
import type { RuntimeResultLoadOptions, SerializablePosition } from "../core";
import type { HeightOptions } from "../height";
import type {
  ResultSymbolStyle,
  SerializableResultSymbolStyle
} from "../style";

export type OverlayType =
  | "point"
  | "polyline"
  | "polygon"
  | "circle"
  | "rectangle"
  | "billboard"
  | "label"
  | "model";

export interface OverlayData {
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
}

export interface OverlayConfig {
  id?: string;
  type: OverlayType;
  positions: Cartesian3[];
  data?: OverlayData;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
  show?: boolean;
  metadata?: Record<string, unknown>;
}

export interface OverlayUpdateOptions {
  positions?: Cartesian3[];
  position?: Cartesian3;
  center?: Cartesian3;
  data?: OverlayData;
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
  show?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PointOverlayOptions extends Omit<OverlayConfig, "type" | "positions"> {
  position: Cartesian3;
}

export interface PolylineOverlayOptions extends Omit<OverlayConfig, "type"> {
  positions: Cartesian3[];
}

export interface PolygonOverlayOptions extends Omit<OverlayConfig, "type"> {
  positions: Cartesian3[];
}

export interface CircleOverlayOptions
  extends Omit<OverlayConfig, "type" | "positions" | "data"> {
  center: Cartesian3;
  radius: number;
  data?: Omit<OverlayData, "radius">;
}

export interface RectangleOverlayOptions extends Omit<OverlayConfig, "type"> {
  positions: Cartesian3[];
}

export interface BillboardOverlayOptions
  extends Omit<OverlayConfig, "type" | "positions" | "data"> {
  position: Cartesian3;
  image: string;
  scale?: number;
  data?: Omit<OverlayData, "image" | "scale">;
}

export interface LabelOverlayOptions
  extends Omit<OverlayConfig, "type" | "positions" | "data"> {
  position: Cartesian3;
  text: string;
  data?: Omit<OverlayData, "text">;
}

export interface ModelOverlayOptions
  extends Omit<OverlayConfig, "type" | "positions" | "data"> {
  position: Cartesian3;
  uri: string;
  scale?: number;
  minimumPixelSize?: number;
  maximumScale?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  data?: Omit<
    OverlayData,
    | "uri"
    | "scale"
    | "minimumPixelSize"
    | "maximumScale"
    | "heading"
    | "pitch"
    | "roll"
  >;
}

export interface Overlay {
  id: string;
  type: OverlayType;
  entity: Entity;
  positions: Cartesian3[];
  data?: OverlayData;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
  show: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
}

export interface OverlaySnapshot {
  id: string;
  type: OverlayType;
  positions: SerializablePosition[];
  data?: OverlayData;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
  show: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export type OverlayLoadOptions = RuntimeResultLoadOptions;
