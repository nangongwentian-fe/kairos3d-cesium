import type {
  Cartesian3,
  Polyline,
  PolylineCollection
} from "cesium";
import type {
  SerializablePosition
} from "../core";
import type {
  ColorLike,
  SerializableColor
} from "../style";

export type PrimitiveOverlayType = "polyline";

export interface PrimitivePolylineOptions {
  id?: string;
  positions: Cartesian3[];
  color?: ColorLike;
  width?: number;
  show?: boolean;
  loop?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PrimitivePolylineOverlay {
  id: string;
  type: "polyline";
  positions: Cartesian3[];
  color: SerializableColor;
  width: number;
  show: boolean;
  loop: boolean;
  polyline: Polyline;
  collection: PolylineCollection;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface PrimitivePolylineSnapshot {
  id: string;
  type: "polyline";
  positions: SerializablePosition[];
  color: SerializableColor;
  width: number;
  show: boolean;
  loop: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type PrimitiveOverlay = PrimitivePolylineOverlay;
export type PrimitiveOverlaySnapshot = PrimitivePolylineSnapshot;
