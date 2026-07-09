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
  | "model"
  | "ellipse"
  | "wall"
  | "corridor"
  | "box"
  | "cylinder";

export interface OverlayData {
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
}

export interface ManagedOverlayState {
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  show?: boolean;
  locked?: boolean;
  editable?: boolean;
}

export interface OverlayConfig {
  id?: string;
  type: OverlayType;
  positions: Cartesian3[];
  data?: OverlayData;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
  show?: boolean;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  locked?: boolean;
  editable?: boolean;
}

export interface OverlayUpdateOptions {
  positions?: Cartesian3[];
  position?: Cartesian3;
  center?: Cartesian3;
  data?: OverlayData;
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
  show?: boolean;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  locked?: boolean;
  editable?: boolean;
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

export interface EllipseOverlayOptions
  extends Omit<OverlayConfig, "type" | "positions" | "data"> {
  center: Cartesian3;
  semiMajorAxis: number;
  semiMinorAxis: number;
  data?: Omit<OverlayData, "semiMajorAxis" | "semiMinorAxis">;
}

export interface WallOverlayOptions extends Omit<OverlayConfig, "type" | "data"> {
  positions: Cartesian3[];
  minimumHeights?: number[];
  maximumHeights?: number[];
  data?: Omit<OverlayData, "minimumHeights" | "maximumHeights">;
}

export interface CorridorOverlayOptions
  extends Omit<OverlayConfig, "type" | "data"> {
  positions: Cartesian3[];
  width: number;
  data?: Omit<OverlayData, "width">;
}

export interface BoxOverlayOptions
  extends Omit<OverlayConfig, "type" | "positions" | "data"> {
  position: Cartesian3;
  dimensions: [number, number, number];
  data?: Omit<OverlayData, "dimensions">;
}

export interface CylinderOverlayOptions
  extends Omit<OverlayConfig, "type" | "positions" | "data"> {
  position: Cartesian3;
  length: number;
  topRadius: number;
  bottomRadius: number;
  data?: Omit<OverlayData, "length" | "topRadius" | "bottomRadius">;
}

export interface OverlayQueryOptions {
  type?: OverlayType | OverlayType[];
  group?: string;
  visible?: boolean;
  locked?: boolean;
  editable?: boolean;
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
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  locked: boolean;
  editable: boolean;
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
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  locked?: boolean;
  editable?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface KairosGeoJsonFeature {
  type: "Feature";
  id?: string;
  geometry:
    | { type: "Point"; coordinates: number[] }
    | { type: "LineString"; coordinates: number[][] }
    | { type: "Polygon"; coordinates: number[][][] };
  properties: Record<string, unknown>;
}

export interface KairosGeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: KairosGeoJsonFeature[];
}

export interface GeoJsonExportOptions {
  includeSnapshot?: boolean;
}

export type OverlayLoadOptions = RuntimeResultLoadOptions;
