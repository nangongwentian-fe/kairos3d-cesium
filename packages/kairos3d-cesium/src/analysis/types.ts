import type {
  Cartesian3,
  ClippingPlaneCollection,
  ClippingPolygonCollection,
  Color,
  Entity
} from "cesium";
import type {
  RuntimeResultLoadOptions,
  SerializablePosition,
  SerializableVector3
} from "../core";
import type {
  AreaMeasureMode,
  DistanceMeasureMode,
  HeightOptions
} from "../height";
import type { PickResult } from "../picking";
import type {
  ResultPrimitiveRuntime,
  ResultRenderMode
} from "../primitives";
import type {
  ResultSymbolStyle,
  SerializableResultSymbolStyle
} from "../style";

export type MeasureType = "distance" | "area" | "height";
export type MeasureUnit = "m" | "km" | "m2" | "km2";
export type AnalysisType = "visibility" | "profile" | "clipping" | "terrain";
export type ClippingType = "plane" | "polygon";
export type ClippingTargetType = "globe" | "layer" | "picked";
export type TerrainAnalysisType =
  | "slope-aspect"
  | "contour"
  | "volume"
  | "flood"
  | "excavation";

export interface MeasureToolOptions {
  lineColor?: Color;
  fillColor?: Color;
  labelColor?: Color;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
  mode?: DistanceMeasureMode | AreaMeasureMode;
  renderMode?: ResultRenderMode;
}

export interface VisibilityComputeOptions {
  start: Cartesian3;
  end: Cartesian3;
  sampleCount?: number;
  heightTolerance?: number;
  visibleColor?: Color;
  blockedColor?: Color;
  pointColor?: Color;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export type VisibilityPickOptions = Omit<VisibilityComputeOptions, "start" | "end">;

export interface ProfileComputeOptions {
  positions: Cartesian3[];
  sampleCount?: number;
  lineColor?: Color;
  pointColor?: Color;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export type ProfileDrawOptions = Omit<ProfileComputeOptions, "positions">;

export interface TerrainAnalysisOptions {
  area: Cartesian3[];
  sampleStep?: number;
  maxSamples?: number;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export interface SlopeAspectOptions extends TerrainAnalysisOptions {}

export interface ContourOptions extends TerrainAnalysisOptions {
  interval: number;
}

export type ContourDrawOptions = Omit<ContourOptions, "area">;

export interface VolumeOptions extends TerrainAnalysisOptions {
  baseHeight: number;
}

export interface FloodOptions extends TerrainAnalysisOptions {
  waterHeight: number;
}

export interface ExcavationOptions extends TerrainAnalysisOptions {
  bottomHeight?: number;
  depth?: number;
}

export interface ClippingTarget {
  type: ClippingTargetType;
  layerId?: string;
  result?: PickResult;
}

export interface ClippingPlaneOptions {
  target: ClippingTarget;
  normal: Cartesian3;
  distance: number;
  unionClippingRegions?: boolean;
  edgeColor?: Color;
  edgeWidth?: number;
  style?: ResultSymbolStyle;
}

export interface ClippingPolygonOptions {
  target: ClippingTarget;
  positions: Cartesian3[];
  inverse?: boolean;
  quality?: number;
  style?: ResultSymbolStyle;
}

export type ClippingPolygonDrawOptions = Omit<ClippingPolygonOptions, "positions">;

export interface MeasureResult {
  id: string;
  type: MeasureType;
  positions: Cartesian3[];
  value: number;
  unit: MeasureUnit;
  label?: string;
  entities: Entity[];
  entityIds: string[];
  createdAt: Date;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
  mode?: DistanceMeasureMode | AreaMeasureMode;
  renderMode?: ResultRenderMode;
  primitives?: ResultPrimitiveRuntime[];
}

export interface MeasureResultSnapshot {
  id: string;
  type: MeasureType;
  positions: SerializablePosition[];
  value: number;
  unit: MeasureUnit;
  label?: string;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
  mode?: DistanceMeasureMode | AreaMeasureMode;
  renderMode?: ResultRenderMode;
}

export interface VisibilityResult {
  id: string;
  type: "visibility";
  positions: [Cartesian3, Cartesian3];
  visible: boolean;
  distance: number;
  blockedPosition?: Cartesian3;
  entities: Entity[];
  createdAt: Date;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export interface VisibilityResultSnapshot {
  id: string;
  type: "visibility";
  positions: [SerializablePosition, SerializablePosition];
  visible: boolean;
  distance: number;
  blockedPosition?: SerializablePosition;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
}

export interface ProfileSample {
  position: Cartesian3;
  distance: number;
  height: number;
}

export interface ProfileSampleSnapshot {
  position: SerializablePosition;
  distance: number;
  height: number;
}

export interface ProfileResult {
  id: string;
  type: "profile";
  positions: Cartesian3[];
  samples: ProfileSample[];
  totalDistance: number;
  minHeight: number;
  maxHeight: number;
  entities: Entity[];
  createdAt: Date;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export interface ProfileResultSnapshot {
  id: string;
  type: "profile";
  positions: SerializablePosition[];
  samples: ProfileSampleSnapshot[];
  totalDistance: number;
  minHeight: number;
  maxHeight: number;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
}

export interface TerrainGridSample {
  row: number;
  column: number;
  position: Cartesian3;
  height: number;
  sampled: boolean;
  slope?: number;
  aspect?: number;
}

export interface TerrainSampleGrid {
  area: Cartesian3[];
  rows: number;
  columns: number;
  sampleStep: number;
  samples: TerrainGridSample[];
  sampled: boolean;
}

export interface ContourLine {
  height: number;
  positions: Cartesian3[];
}

export interface TerrainGridSampleSnapshot {
  row: number;
  column: number;
  position: SerializablePosition;
  height: number;
  sampled: boolean;
  slope?: number;
  aspect?: number;
}

export interface TerrainSampleGridSnapshot {
  area: SerializablePosition[];
  rows: number;
  columns: number;
  sampleStep: number;
  samples: TerrainGridSampleSnapshot[];
  sampled: boolean;
}

export interface ContourLineSnapshot {
  height: number;
  positions: SerializablePosition[];
}

export interface SlopeAspectResult {
  id: string;
  type: "slope-aspect";
  area: Cartesian3[];
  grid: TerrainSampleGrid;
  minSlope: number;
  maxSlope: number;
  averageSlope: number;
  entities: Entity[];
  createdAt: Date;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export interface ContourResult {
  id: string;
  type: "contour";
  area: Cartesian3[];
  interval: number;
  sampleStep: number;
  lines: ContourLine[];
  minHeight: number;
  maxHeight: number;
  entities: Entity[];
  createdAt: Date;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export interface VolumeResult {
  id: string;
  type: "volume";
  area: Cartesian3[];
  grid: TerrainSampleGrid;
  baseHeight: number;
  cutVolume: number;
  fillVolume: number;
  netVolume: number;
  sampleArea: number;
  minHeight: number;
  maxHeight: number;
  entities: Entity[];
  createdAt: Date;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export interface FloodResult {
  id: string;
  type: "flood";
  area: Cartesian3[];
  grid: TerrainSampleGrid;
  waterHeight: number;
  floodedArea: number;
  waterVolume: number;
  sampleArea: number;
  minHeight: number;
  maxHeight: number;
  entities: Entity[];
  createdAt: Date;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export interface ExcavationResult {
  id: string;
  type: "excavation";
  area: Cartesian3[];
  grid: TerrainSampleGrid;
  bottomHeight: number;
  depth?: number;
  cutVolume: number;
  sampleArea: number;
  minHeight: number;
  maxHeight: number;
  entities: Entity[];
  createdAt: Date;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
}

export interface SlopeAspectResultSnapshot {
  id: string;
  type: "slope-aspect";
  area: SerializablePosition[];
  grid: TerrainSampleGridSnapshot;
  minSlope: number;
  maxSlope: number;
  averageSlope: number;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
}

export interface ContourResultSnapshot {
  id: string;
  type: "contour";
  area: SerializablePosition[];
  interval: number;
  sampleStep: number;
  lines: ContourLineSnapshot[];
  minHeight: number;
  maxHeight: number;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
}

export interface VolumeResultSnapshot {
  id: string;
  type: "volume";
  area: SerializablePosition[];
  grid: TerrainSampleGridSnapshot;
  baseHeight: number;
  cutVolume: number;
  fillVolume: number;
  netVolume: number;
  sampleArea: number;
  minHeight: number;
  maxHeight: number;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
}

export interface FloodResultSnapshot {
  id: string;
  type: "flood";
  area: SerializablePosition[];
  grid: TerrainSampleGridSnapshot;
  waterHeight: number;
  floodedArea: number;
  waterVolume: number;
  sampleArea: number;
  minHeight: number;
  maxHeight: number;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
}

export interface ExcavationResultSnapshot {
  id: string;
  type: "excavation";
  area: SerializablePosition[];
  grid: TerrainSampleGridSnapshot;
  bottomHeight: number;
  depth?: number;
  cutVolume: number;
  sampleArea: number;
  minHeight: number;
  maxHeight: number;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
  height?: HeightOptions;
}

export type TerrainResult =
  | SlopeAspectResult
  | ContourResult
  | VolumeResult
  | FloodResult
  | ExcavationResult;
export type TerrainResultSnapshot =
  | SlopeAspectResultSnapshot
  | ContourResultSnapshot
  | VolumeResultSnapshot
  | FloodResultSnapshot
  | ExcavationResultSnapshot;

export interface ClippingResult {
  id: string;
  type: ClippingType;
  target: ClippingTarget;
  enabled: boolean;
  collection: ClippingPlaneCollection | ClippingPolygonCollection;
  positions?: Cartesian3[];
  entities: Entity[];
  createdAt: Date;
  style?: ResultSymbolStyle;
}

export type ClippingSnapshotTarget =
  | { type: "globe" }
  | { type: "layer"; layerId: string };

export interface ClippingPlaneResultSnapshot {
  id: string;
  type: "plane";
  target: ClippingSnapshotTarget;
  enabled: boolean;
  normal: SerializableVector3;
  distance: number;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
}

export interface ClippingPolygonResultSnapshot {
  id: string;
  type: "polygon";
  target: ClippingSnapshotTarget;
  enabled: boolean;
  positions: SerializablePosition[];
  inverse?: boolean;
  quality?: number;
  createdAt: string;
  style?: SerializableResultSymbolStyle;
}

export type ClippingResultSnapshot =
  | ClippingPlaneResultSnapshot
  | ClippingPolygonResultSnapshot;

export interface AnalysisResultsSnapshot {
  measure: MeasureResultSnapshot[];
  visibility: VisibilityResultSnapshot[];
  profile: ProfileResultSnapshot[];
  clipping: ClippingResultSnapshot[];
  terrain: TerrainResultSnapshot[];
}

export type AnalysisResultLoadOptions = RuntimeResultLoadOptions;

export type AnalysisResult = VisibilityResult | ProfileResult | ClippingResult | TerrainResult;
