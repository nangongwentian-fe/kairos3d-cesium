import type { Cartesian3 } from "cesium";

export type HeightMode = "absolute" | "clampToGround" | "relativeToGround";

export interface HeightOptions {
  mode?: HeightMode;
  offset?: number;
  sampleTerrain?: boolean;
}

export interface ResolvedHeightOptions {
  mode: HeightMode;
  offset: number;
  sampleTerrain: boolean;
}

export interface HeightSample {
  original: Cartesian3;
  position: Cartesian3;
  height: number;
  sampled: boolean;
}

export type DistanceMeasureMode = "space" | "surface";
export type AreaMeasureMode = "projected" | "surface";
