import type { Cartesian3 } from "cesium";

export const plotTypes = [
  "fine-arrow",
  "straight-arrow",
  "attack-arrow",
  "double-arrow",
  "curve",
  "closed-curve",
  "sector",
  "lune",
  "gathering-place"
] as const;

export type PlotType = (typeof plotTypes)[number];
export type PlotGeometryKind = "polygon" | "polyline";

export interface PlotAlgorithmOptions {
  steps?: number;
  headWidthFactor?: number;
  headHeightFactor?: number;
  neckWidthFactor?: number;
  neckHeightFactor?: number;
  tailWidthFactor?: number;
}

export interface PlotGeometry {
  type: PlotType;
  kind: PlotGeometryKind;
  controlPositions: Cartesian3[];
  positions: Cartesian3[];
}

export function isPlotType(value: unknown): value is PlotType {
  return typeof value === "string" && plotTypes.includes(value as PlotType);
}

export function plotGeometryKind(type: PlotType): PlotGeometryKind {
  return type === "curve" ? "polyline" : "polygon";
}

export function minPlotPositionCount(type: PlotType): number {
  if (type === "fine-arrow" || type === "straight-arrow" || type === "curve") {
    return 2;
  }
  return 3;
}
