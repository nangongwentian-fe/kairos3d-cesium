import type {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileFeature,
  ClippingPlaneCollection,
  ClippingPolygonCollection,
  Color,
  ColorBlendMode,
  Entity,
  HeightReference,
  ImageryLayerFeatureInfo,
  Material,
  MaterialProperty
} from "cesium";
import { describe, expectTypeOf, it } from "vitest";
import type { KairosMap, SerializablePosition, SerializableVector3 } from "./core";
import type { ToolManagerEvents } from "./tools";
import type {
  GeoJsonLayerStyle,
  GltfLayerConfig,
  LayerAdapter,
  LayerLoadOptions,
  LayerState,
  LayerTransactionHooks,
  TilesetLayerConfig
} from "./layers";
import type {
  DrawEditEvent,
  DrawEditOptions,
  DrawBoxToolOptions,
  DrawCorridorToolOptions,
  DrawCylinderToolOptions,
  DrawGeoJsonExportOptions,
  DrawGeoJsonFeatureCollection,
  DrawPlotOptions,
  DrawPlotToolOptions,
  DrawResultData,
  DrawResult,
  DrawResultSnapshot,
  DrawStyle,
  DrawToolOptions,
  DrawType,
  DrawWallToolOptions
} from "./draw";
import type {
  CameraBookmark,
  CameraView,
  RuntimeResultsSnapshot,
  SceneCleanupStatus,
  SceneLoadMode,
  SceneRollbackStatus,
  SceneSnapshot,
  SceneStateSnapshotOptions,
  SceneStateLoadOptions,
  SceneTransactionState,
  SceneTransactionStatus
} from "./scene";
import type {
  AnalysisType,
  AnalysisResultsSnapshot,
  ClippingPlaneOptions,
  ClippingPlaneUpdateOptions,
  ClippingPolygonDrawOptions,
  ClippingPolygonOptions,
  ClippingPolygonUpdateOptions,
  ClippingResult,
  ClippingResultSnapshot,
  ClippingTarget,
  ClippingTargetType,
  ClippingType,
  ContourDrawOptions,
  ContourLine,
  ContourResult,
  ContourResultSnapshot,
  ExcavationOptions,
  ExcavationResult,
  ExcavationResultSnapshot,
  FloodOptions,
  FloodResult,
  FloodResultSnapshot,
  MeasureResult,
  MeasureResultSnapshot,
  MeasureType,
  MeasureUnit,
  ProfileResult,
  ProfileResultSnapshot,
  ProfileSample,
  SlopeAspectOptions,
  SlopeAspectResult,
  SlopeAspectResultSnapshot,
  TerrainAnalysisType,
  TerrainAreaMode,
  TerrainGridSample,
  TerrainPrecisionOptions,
  TerrainResult,
  TerrainResultSnapshot,
  TerrainSampleGrid,
  TerrainVolumeMode,
  VolumeOptions,
  VolumeResult,
  VolumeResultSnapshot,
  VisibilityBlockedBy,
  VisibilityOcclusionMode,
  VisibilityResult,
  VisibilityResultSnapshot
} from "./analysis";
import type {
  PickOptions,
  PickResult,
  PickResultSource,
  PickResultType,
  PickingClickOptions,
  SelectionState
} from "./picking";
import type {
  BillboardSymbolStyle,
  ColorLike,
  LabelSymbolStyle,
  LineSymbolStyle,
  ModelSymbolStyle,
  PointSymbolStyle,
  PolygonSymbolStyle,
  ResultSymbolStyle,
  SDKStyleDefaults,
  SelectionSymbolStyle,
  SerializableBillboardSymbolStyle,
  SerializableColor,
  SerializableModelSymbolStyle,
  SerializableResultSymbolStyle,
  StyleManager
} from "./style";
import type {
  AreaMeasureMode,
  DistanceMeasureMode,
  HeightMode,
  HeightOptions,
  HeightSample
} from "./height";
import type {
  ResultManagerEvents,
  ResultQueryOptions,
  ResultRecord,
  ResultSource,
  SDKManagedResult
} from "./results";
import type {
  LayerPerformanceRecord,
  PerformanceBudget,
  PerformanceStats,
  PerformanceWarning,
  PrimitiveOptimizationCandidate,
  ResultPerformanceRecord
} from "./performance";
import type {
  PrimitiveOverlay,
  PrimitiveOverlaySnapshot,
  PrimitiveOverlayType,
  ResultPrimitiveRuntime,
  ResultPrimitiveType,
  ResultRenderMode,
  PrimitivePolylineOptions,
  PrimitivePolylineOverlay,
  PrimitivePolylineSnapshot
} from "./primitives";
import type {
  BillboardOverlayOptions,
  BoxOverlayOptions,
  CircleOverlayOptions,
  CorridorOverlayOptions,
  CylinderOverlayOptions,
  EllipseOverlayOptions,
  GeoJsonExportOptions,
  KairosGeoJsonFeatureCollection,
  LabelOverlayOptions,
  ModelOverlayOptions,
  Overlay,
  OverlayConfig,
  OverlayData,
  OverlayQueryOptions,
  OverlaySnapshot,
  OverlayType,
  OverlayUpdateOptions,
  PlotOverlayOptions,
  PointOverlayOptions,
  PolygonOverlayOptions,
  PolylineOverlayOptions,
  RectangleOverlayOptions,
  WallOverlayOptions
} from "./overlays";
import type { SnapshotStorageAdapter, SnapshotStorageRecord } from "./persistence";
import type {
  PlotAlgorithmOptions,
  PlotGeometry,
  PlotGeometryKind,
  PlotType
} from "./plotting";
import type {
  MaterialDefinition,
  MaterialDefinitionInfo,
  MaterialDescriptor,
  MaterialTarget
} from "./materials";
import type {
  EffectConfig,
  EffectInstance,
  EffectLoadOptions,
  EffectSnapshot,
  EffectType,
  EffectUpdateOptions
} from "./effects";
import type {
  AsyncOperationOptions,
  OperationErrorInfo,
  OperationManagerEvents,
  OperationQuery,
  OperationState,
  OperationStatus
} from "./operations";
import type {
  RuntimeConcurrencyManagerEvents,
  RuntimeConcurrencyQuery,
  RuntimeLeaseMode,
  RuntimeLeaseState,
  RuntimeLeaseStatus,
  RuntimeMutationConflictError,
  RuntimeResource,
  RuntimeWhenIdleOptions
} from "./concurrency";

describe("public SDK types", () => {
  it("exposes operations contracts", () => {
    expectTypeOf<OperationStatus>().toEqualTypeOf<
      "running" | "succeeded" | "failed" | "canceled"
    >();
    expectTypeOf<AsyncOperationOptions>().toMatchTypeOf<{
      signal?: AbortSignal;
      operationId?: string;
    }>();
    expectTypeOf<OperationState>().toMatchTypeOf<{
      id: string;
      kind: string;
      status: OperationStatus;
      progress?: number;
      phase?: string;
      error?: OperationErrorInfo;
      startedAt: Date;
      finishedAt?: Date;
    }>();
    expectTypeOf<OperationQuery>().toMatchTypeOf<{
      kind?: string;
      status?: OperationStatus | OperationStatus[];
    }>();
    expectTypeOf<OperationManagerEvents["change"]>().toEqualTypeOf<OperationState>();
    expectTypeOf<KairosMap["operations"]["get"]>().returns.toEqualTypeOf<
      OperationState | undefined
    >();
    expectTypeOf<KairosMap["operations"]["list"]>().returns.toEqualTypeOf<
      OperationState[]
    >();
  });

  it("exposes runtime concurrency diagnostics without a public acquire API", () => {
    expectTypeOf<RuntimeResource>().toEqualTypeOf<
      | "scene"
      | "camera"
      | "bookmarks"
      | "layers"
      | "materials"
      | "tools"
      | "selection"
      | "draw"
      | "analysis"
      | "primitives"
      | "overlays"
      | "effects"
    >();
    expectTypeOf<RuntimeLeaseMode>().toEqualTypeOf<"write" | "exclusive">();
    expectTypeOf<RuntimeLeaseStatus>().toEqualTypeOf<"waiting" | "active">();
    expectTypeOf<RuntimeLeaseState>().toEqualTypeOf<{
      id: string;
      kind: string;
      mode: RuntimeLeaseMode;
      status: RuntimeLeaseStatus;
      resources: readonly RuntimeResource[];
      operationId?: string;
      startedAt: Date;
      activatedAt?: Date;
    }>();
    expectTypeOf<RuntimeConcurrencyQuery>().toEqualTypeOf<{
      resource?: RuntimeResource;
      kind?: string;
      mode?: RuntimeLeaseMode;
      status?: RuntimeLeaseStatus;
    }>();
    expectTypeOf<RuntimeWhenIdleOptions>().toEqualTypeOf<{ signal?: AbortSignal }>();
    expectTypeOf<RuntimeConcurrencyManagerEvents["change"]>().toEqualTypeOf<{
      leases: RuntimeLeaseState[];
    }>();
    expectTypeOf<RuntimeMutationConflictError>().toMatchTypeOf<Error & {
      resource: RuntimeResource;
      holder?: RuntimeLeaseState;
    }>();
    expectTypeOf<KairosMap["concurrency"]["isBusy"]>().toEqualTypeOf<
      (resource?: RuntimeResource) => boolean
    >();
    expectTypeOf<KairosMap["concurrency"]["list"]>().toEqualTypeOf<
      (query?: RuntimeConcurrencyQuery) => RuntimeLeaseState[]
    >();
    expectTypeOf<KairosMap["concurrency"]["whenIdle"]>().toEqualTypeOf<
      (query?: RuntimeConcurrencyQuery, options?: RuntimeWhenIdleOptions) => Promise<void>
    >();
  });

  it("exposes stable draw and measure result contracts", () => {
    expectTypeOf<DrawType>().toEqualTypeOf<
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
      | "cylinder"
      | PlotType
    >();
    expectTypeOf<PlotType>().toEqualTypeOf<
      | "fine-arrow"
      | "straight-arrow"
      | "attack-arrow"
      | "double-arrow"
      | "curve"
      | "closed-curve"
      | "sector"
      | "lune"
      | "gathering-place"
    >();
    expectTypeOf<PlotGeometryKind>().toEqualTypeOf<"polygon" | "polyline">();
    expectTypeOf<PlotAlgorithmOptions>().toEqualTypeOf<{
      steps?: number;
      headWidthFactor?: number;
      headHeightFactor?: number;
      neckWidthFactor?: number;
      neckHeightFactor?: number;
      tailWidthFactor?: number;
    }>();
    expectTypeOf<PlotGeometry>().toMatchTypeOf<{
      type: PlotType;
      kind: PlotGeometryKind;
      controlPositions: Cartesian3[];
      positions: Cartesian3[];
    }>();
    expectTypeOf<MeasureType>().toEqualTypeOf<"distance" | "area" | "height">();
    expectTypeOf<MeasureUnit>().toEqualTypeOf<"m" | "km" | "m2" | "km2">();
    expectTypeOf<DistanceMeasureMode>().toEqualTypeOf<"space" | "surface">();
    expectTypeOf<AreaMeasureMode>().toEqualTypeOf<"projected" | "surface">();
    expectTypeOf<AnalysisType>().toEqualTypeOf<
      "visibility" | "profile" | "clipping" | "terrain"
    >();
    expectTypeOf<TerrainAreaMode>().toEqualTypeOf<"planar" | "triangulated">();
    expectTypeOf<TerrainVolumeMode>().toEqualTypeOf<"sample-cell" | "triangulated">();
    expectTypeOf<TerrainPrecisionOptions>().toEqualTypeOf<{
      areaMode?: TerrainAreaMode;
      volumeMode?: TerrainVolumeMode;
    }>();
    expectTypeOf<VisibilityOcclusionMode>().toEqualTypeOf<
      "terrain" | "scene" | "terrain-and-scene"
    >();
    expectTypeOf<VisibilityBlockedBy>().toEqualTypeOf<"terrain" | "scene">();

    expectTypeOf<DrawResult>().toMatchTypeOf<{
      id: string;
      entity: Entity;
      positions: Cartesian3[];
      data?: DrawResultData;
      createdAt: Date;
      updatedAt?: Date;
      style?: ResultSymbolStyle;
      height?: HeightOptions;
      renderMode?: ResultRenderMode;
      primitives?: ResultPrimitiveRuntime[];
      properties?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      group?: string;
      show: boolean;
      locked: boolean;
      editable: boolean;
    }>();

    expectTypeOf<DrawToolOptions>().toMatchTypeOf<{
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
    }>();
    expectTypeOf<DrawWallToolOptions>().toMatchTypeOf<{
      minimumHeights?: number[];
      maximumHeights?: number[];
    }>();
    expectTypeOf<DrawCorridorToolOptions>().toMatchTypeOf<{ width?: number }>();
    expectTypeOf<DrawBoxToolOptions>().toMatchTypeOf<{
      dimensions?: [number, number, number];
    }>();
    expectTypeOf<DrawPlotToolOptions>().toMatchTypeOf<{
      type: PlotType;
      plot?: PlotAlgorithmOptions;
    }>();
    expectTypeOf<DrawGeoJsonExportOptions>().toEqualTypeOf<GeoJsonExportOptions>();
    expectTypeOf<DrawGeoJsonFeatureCollection>().toEqualTypeOf<
      KairosGeoJsonFeatureCollection
    >();
    expectTypeOf<KairosMap["draw"]["getProperties"]>().toMatchTypeOf<
      (id: string) => Record<string, unknown> | undefined
    >();
    expectTypeOf<KairosMap["draw"]["setProperties"]>().toMatchTypeOf<
      (id: string, properties: Record<string, unknown> | undefined) => DrawResult
    >();
    expectTypeOf<KairosMap["draw"]["mergeProperties"]>().toMatchTypeOf<
      (id: string, patch: Record<string, unknown>) => DrawResult
    >();
    expectTypeOf<KairosMap["draw"]["getMetadata"]>().toMatchTypeOf<
      (id: string) => Record<string, unknown> | undefined
    >();
    expectTypeOf<KairosMap["draw"]["setMetadata"]>().toMatchTypeOf<
      (id: string, metadata: Record<string, unknown> | undefined) => DrawResult
    >();
    expectTypeOf<KairosMap["draw"]["mergeMetadata"]>().toMatchTypeOf<
      (id: string, patch: Record<string, unknown>) => DrawResult
    >();
    expectTypeOf<KairosMap["draw"]["setStyleMany"]>().toMatchTypeOf<
      (ids: string[], style: ResultSymbolStyle) => DrawResult[]
    >();
    expectTypeOf<KairosMap["draw"]["setStyleWhere"]>().toMatchTypeOf<
      (options: import("./draw").DrawQueryOptions, style: ResultSymbolStyle) => DrawResult[]
    >();
    expectTypeOf<KairosMap["draw"]["toGeoJSON"]>().toMatchTypeOf<
      (options?: DrawGeoJsonExportOptions) => DrawGeoJsonFeatureCollection
    >();
    expectTypeOf<KairosMap["draw"]["plot"]>().toMatchTypeOf<
      (options: DrawPlotOptions) => DrawResult
    >();
    expectTypeOf<DrawCylinderToolOptions>().toMatchTypeOf<{
      length?: number;
      topRadius?: number;
      bottomRadius?: number;
    }>();

    expectTypeOf<MeasureResult>().toMatchTypeOf<{
      id: string;
      value: number;
      entityIds: string[];
      entities: Entity[];
      createdAt: Date;
      style?: ResultSymbolStyle;
      height?: HeightOptions;
      mode?: DistanceMeasureMode | AreaMeasureMode;
      renderMode?: ResultRenderMode;
      primitives?: ResultPrimitiveRuntime[];
    }>();

    expectTypeOf<VisibilityResult>().toMatchTypeOf<{
      id: string;
      type: "visibility";
      positions: [Cartesian3, Cartesian3];
      visible: boolean;
      distance: number;
      blockedPosition?: Cartesian3;
      blockedBy?: VisibilityBlockedBy;
      blockedObject?: unknown;
      entities: Entity[];
      createdAt: Date;
      style?: ResultSymbolStyle;
      height?: HeightOptions;
    }>();

    expectTypeOf<ProfileSample>().toMatchTypeOf<{
      position: Cartesian3;
      distance: number;
      height: number;
    }>();

    expectTypeOf<ProfileResult>().toMatchTypeOf<{
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
    }>();

    expectTypeOf<ClippingType>().toEqualTypeOf<"plane" | "polygon">();
    expectTypeOf<ClippingTargetType>().toEqualTypeOf<"globe" | "layer" | "picked">();
    expectTypeOf<ClippingTarget>().toMatchTypeOf<{
      type: ClippingTargetType;
      layerId?: string;
      result?: PickResult;
    }>();
    expectTypeOf<ClippingPlaneOptions>().toMatchTypeOf<{
      target: ClippingTarget;
      normal: Cartesian3;
      distance: number;
    }>();
    expectTypeOf<ClippingPlaneUpdateOptions>().toMatchTypeOf<{
      normal?: Cartesian3;
      distance?: number;
      enabled?: boolean;
    }>();
    expectTypeOf<ClippingPolygonOptions>().toMatchTypeOf<{
      target: ClippingTarget;
      positions: Cartesian3[];
      inverse?: boolean;
      quality?: number;
    }>();
    expectTypeOf<ClippingPolygonDrawOptions>().toEqualTypeOf<
      Omit<ClippingPolygonOptions, "positions">
    >();
    expectTypeOf<ClippingPolygonUpdateOptions>().toMatchTypeOf<{
      inverse?: boolean;
      quality?: number;
      enabled?: boolean;
    }>();
    expectTypeOf<ClippingResult>().toMatchTypeOf<{
      id: string;
      type: ClippingType;
      target: ClippingTarget;
      enabled: boolean;
      collection: ClippingPlaneCollection | ClippingPolygonCollection;
      positions?: Cartesian3[];
      entities: Entity[];
      createdAt: Date;
      style?: ResultSymbolStyle;
    }>();

    expectTypeOf<TerrainAnalysisType>().toEqualTypeOf<
      "slope-aspect" | "contour" | "volume" | "flood" | "excavation"
    >();
    expectTypeOf<TerrainGridSample>().toMatchTypeOf<{
      row: number;
      column: number;
      position: Cartesian3;
      height: number;
      sampled: boolean;
      slope?: number;
      aspect?: number;
    }>();
    expectTypeOf<TerrainSampleGrid>().toMatchTypeOf<{
      area: Cartesian3[];
      rows: number;
      columns: number;
      sampleStep: number;
      samples: TerrainGridSample[];
      sampled: boolean;
    }>();
    expectTypeOf<ContourLine>().toMatchTypeOf<{
      height: number;
      positions: Cartesian3[];
    }>();
    expectTypeOf<SlopeAspectOptions>().toMatchTypeOf<{
      area: Cartesian3[];
      sampleStep?: number;
      maxSamples?: number;
      height?: HeightOptions;
      style?: ResultSymbolStyle;
      precision?: TerrainPrecisionOptions;
    }>();
    expectTypeOf<ContourDrawOptions>().toMatchTypeOf<{
      interval: number;
      sampleStep?: number;
      maxSamples?: number;
    }>();
    expectTypeOf<VolumeOptions>().toMatchTypeOf<{
      area: Cartesian3[];
      baseHeight: number;
      sampleStep?: number;
      maxSamples?: number;
    }>();
    expectTypeOf<FloodOptions>().toMatchTypeOf<{
      area: Cartesian3[];
      waterHeight: number;
      sampleStep?: number;
      maxSamples?: number;
    }>();
    expectTypeOf<ExcavationOptions>().toMatchTypeOf<{
      area: Cartesian3[];
      bottomHeight?: number;
      depth?: number;
      sampleStep?: number;
      maxSamples?: number;
    }>();
    expectTypeOf<SlopeAspectResult>().toMatchTypeOf<{
      id: string;
      type: "slope-aspect";
      grid: TerrainSampleGrid;
      minSlope: number;
      maxSlope: number;
      averageSlope: number;
      entities: Entity[];
    }>();
    expectTypeOf<ContourResult>().toMatchTypeOf<{
      id: string;
      type: "contour";
      interval: number;
      lines: ContourLine[];
      minHeight: number;
      maxHeight: number;
      entities: Entity[];
    }>();
    expectTypeOf<VolumeResult>().toMatchTypeOf<{
      id: string;
      type: "volume";
      grid: TerrainSampleGrid;
      baseHeight: number;
      cutVolume: number;
      fillVolume: number;
      netVolume: number;
      sampleArea: number;
      surfaceArea: number;
      calculationMode: TerrainVolumeMode;
      entities: Entity[];
    }>();
    expectTypeOf<FloodResult>().toMatchTypeOf<{
      id: string;
      type: "flood";
      grid: TerrainSampleGrid;
      waterHeight: number;
      floodedArea: number;
      waterVolume: number;
      sampleArea: number;
      surfaceArea: number;
      calculationMode: TerrainVolumeMode;
      entities: Entity[];
    }>();
    expectTypeOf<ExcavationResult>().toMatchTypeOf<{
      id: string;
      type: "excavation";
      grid: TerrainSampleGrid;
      bottomHeight: number;
      depth?: number;
      cutVolume: number;
      sampleArea: number;
      surfaceArea: number;
      calculationMode: TerrainVolumeMode;
      entities: Entity[];
    }>();
    expectTypeOf<TerrainResult>().toEqualTypeOf<
      SlopeAspectResult | ContourResult | VolumeResult | FloodResult | ExcavationResult
    >();
  });

  it("exposes serializable runtime snapshot types", () => {
    expectTypeOf<SerializablePosition>().toEqualTypeOf<{
      longitude: number;
      latitude: number;
      height: number;
    }>();
    expectTypeOf<SerializableVector3>().toEqualTypeOf<{
      x: number;
      y: number;
      z: number;
    }>();
    expectTypeOf<DrawResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: DrawType;
      positions: SerializablePosition[];
      data?: DrawResultData;
      createdAt: string;
      updatedAt?: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
      renderMode?: ResultRenderMode;
      properties?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      group?: string;
      show?: boolean;
      locked?: boolean;
      editable?: boolean;
    }>();
    expectTypeOf<MeasureResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: MeasureType;
      positions: SerializablePosition[];
      value: number;
      unit: MeasureUnit;
      createdAt: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
      mode?: DistanceMeasureMode | AreaMeasureMode;
      renderMode?: ResultRenderMode;
    }>();
    expectTypeOf<VisibilityResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: "visibility";
      positions: [SerializablePosition, SerializablePosition];
      visible: boolean;
      distance: number;
      blockedPosition?: SerializablePosition;
      blockedBy?: VisibilityBlockedBy;
      createdAt: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
    }>();
    expectTypeOf<ProfileResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: "profile";
      positions: SerializablePosition[];
      totalDistance: number;
      minHeight: number;
      maxHeight: number;
      createdAt: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
    }>();
    expectTypeOf<ClippingResultSnapshot>().toMatchTypeOf<
      | {
          id: string;
          type: "plane";
          enabled: boolean;
          normal: SerializableVector3;
          distance: number;
          createdAt: string;
          style?: SerializableResultSymbolStyle;
        }
      | {
          id: string;
          type: "polygon";
          enabled: boolean;
          positions: SerializablePosition[];
          createdAt: string;
          style?: SerializableResultSymbolStyle;
        }
    >();
    expectTypeOf<SlopeAspectResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: "slope-aspect";
      area: SerializablePosition[];
      minSlope: number;
      maxSlope: number;
      averageSlope: number;
      createdAt: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
    }>();
    expectTypeOf<ContourResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: "contour";
      area: SerializablePosition[];
      interval: number;
      sampleStep: number;
      lines: Array<{ height: number; positions: SerializablePosition[] }>;
      createdAt: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
    }>();
    expectTypeOf<VolumeResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: "volume";
      area: SerializablePosition[];
      baseHeight: number;
      cutVolume: number;
      fillVolume: number;
      netVolume: number;
      sampleArea: number;
      surfaceArea: number;
      calculationMode?: TerrainVolumeMode;
      createdAt: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
    }>();
    expectTypeOf<FloodResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: "flood";
      area: SerializablePosition[];
      waterHeight: number;
      floodedArea: number;
      waterVolume: number;
      sampleArea: number;
      surfaceArea: number;
      calculationMode?: TerrainVolumeMode;
      createdAt: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
    }>();
    expectTypeOf<ExcavationResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: "excavation";
      area: SerializablePosition[];
      bottomHeight: number;
      depth?: number;
      cutVolume: number;
      sampleArea: number;
      surfaceArea: number;
      calculationMode?: TerrainVolumeMode;
      createdAt: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
    }>();
    expectTypeOf<TerrainResultSnapshot>().toEqualTypeOf<
      | SlopeAspectResultSnapshot
      | ContourResultSnapshot
      | VolumeResultSnapshot
      | FloodResultSnapshot
      | ExcavationResultSnapshot
    >();
    expectTypeOf<AnalysisResultsSnapshot>().toEqualTypeOf<{
      measure: MeasureResultSnapshot[];
      visibility: VisibilityResultSnapshot[];
      profile: ProfileResultSnapshot[];
      clipping: ClippingResultSnapshot[];
      terrain: TerrainResultSnapshot[];
    }>();
  });

  it("exposes style types", () => {
    expectTypeOf<SerializableColor>().toEqualTypeOf<{
      red: number;
      green: number;
      blue: number;
      alpha: number;
    }>();
    expectTypeOf<ColorLike>().toEqualTypeOf<Color | string | SerializableColor>();
    expectTypeOf<PointSymbolStyle>().toMatchTypeOf<{
      color?: ColorLike;
      pixelSize?: number;
      outlineColor?: ColorLike;
      outlineWidth?: number;
    }>();
    expectTypeOf<LineSymbolStyle>().toMatchTypeOf<{
      color?: ColorLike;
      width?: number;
      clampToGround?: boolean;
    }>();
    expectTypeOf<PolygonSymbolStyle>().toMatchTypeOf<{
      fillColor?: ColorLike;
      outlineColor?: ColorLike;
      outlineWidth?: number;
      clampToGround?: boolean;
    }>();
    expectTypeOf<LabelSymbolStyle>().toMatchTypeOf<{
      color?: ColorLike;
      outlineColor?: ColorLike;
      font?: string;
      pixelOffset?: [number, number];
    }>();
    expectTypeOf<BillboardSymbolStyle>().toMatchTypeOf<{
      color?: ColorLike;
      scale?: number;
      pixelOffset?: [number, number];
      width?: number;
      height?: number;
    }>();
    expectTypeOf<ModelSymbolStyle>().toMatchTypeOf<{
      color?: ColorLike;
      scale?: number;
      minimumPixelSize?: number;
      maximumScale?: number;
      silhouetteColor?: ColorLike;
      silhouetteSize?: number;
    }>();
    expectTypeOf<SerializableBillboardSymbolStyle>().toMatchTypeOf<{
      color?: SerializableColor;
      scale?: number;
    }>();
    expectTypeOf<SerializableModelSymbolStyle>().toMatchTypeOf<{
      color?: SerializableColor;
      silhouetteColor?: SerializableColor;
      scale?: number;
    }>();
    expectTypeOf<ResultSymbolStyle>().toMatchTypeOf<{
      point?: PointSymbolStyle;
      line?: LineSymbolStyle;
      polygon?: PolygonSymbolStyle;
      label?: LabelSymbolStyle;
      billboard?: BillboardSymbolStyle;
      model?: ModelSymbolStyle;
    }>();
    expectTypeOf<SelectionSymbolStyle>().toMatchTypeOf<{
      entity?: { point?: PointSymbolStyle };
      tilesFeature?: { color?: ColorLike };
    }>();
    expectTypeOf<SDKStyleDefaults>().toMatchTypeOf<{
      draw?: {
        point?: ResultSymbolStyle;
        polyline?: ResultSymbolStyle;
        polygon?: ResultSymbolStyle;
        circle?: ResultSymbolStyle;
        rectangle?: ResultSymbolStyle;
        billboard?: ResultSymbolStyle;
        label?: ResultSymbolStyle;
        model?: ResultSymbolStyle;
        ellipse?: ResultSymbolStyle;
        wall?: ResultSymbolStyle;
        corridor?: ResultSymbolStyle;
        box?: ResultSymbolStyle;
        cylinder?: ResultSymbolStyle;
        "fine-arrow"?: ResultSymbolStyle;
        "straight-arrow"?: ResultSymbolStyle;
        "attack-arrow"?: ResultSymbolStyle;
        "double-arrow"?: ResultSymbolStyle;
        curve?: ResultSymbolStyle;
        "closed-curve"?: ResultSymbolStyle;
        sector?: ResultSymbolStyle;
        lune?: ResultSymbolStyle;
        "gathering-place"?: ResultSymbolStyle;
      };
      selection?: SelectionSymbolStyle;
      terrain?: {
        "slope-aspect"?: ResultSymbolStyle;
        contour?: ResultSymbolStyle;
        volume?: ResultSymbolStyle;
        flood?: ResultSymbolStyle;
        excavation?: ResultSymbolStyle;
      };
    }>();
    expectTypeOf<StyleManager["hasPreset"]>().toMatchTypeOf<
      (id: string) => boolean
    >();
    expectTypeOf<StyleManager["listPresets"]>().toMatchTypeOf<
      () => Array<{ id: string; style: ResultSymbolStyle }>
    >();
    expectTypeOf<StyleManager["removePreset"]>().toMatchTypeOf<
      (id: string) => boolean
    >();
  });

  it("exposes aggregate result manager types", () => {
    expectTypeOf<ResultSource>().toEqualTypeOf<
      "draw" | "measure" | "visibility" | "profile" | "clipping" | "terrain"
    >();
    expectTypeOf<SDKManagedResult>().toEqualTypeOf<
      | DrawResult
      | MeasureResult
      | VisibilityResult
      | ProfileResult
      | ClippingResult
      | TerrainResult
    >();
    expectTypeOf<ResultRecord>().toMatchTypeOf<{
      id: string;
      source: ResultSource;
      type: SDKManagedResult["type"];
      result: SDKManagedResult;
      createdAt: Date;
    }>();
    expectTypeOf<ResultQueryOptions>().toEqualTypeOf<{
      source?: ResultSource | ResultSource[];
      type?: SDKManagedResult["type"] | SDKManagedResult["type"][];
    }>();
    expectTypeOf<ResultManagerEvents>().toEqualTypeOf<{
      add: ResultRecord;
      remove: ResultRecord;
      clear: ResultRecord[];
    }>();
  });

  it("exposes map-level results manager", () => {
    expectTypeOf<KairosMap["results"]["list"]>().toMatchTypeOf<
      (options?: ResultQueryOptions) => ResultRecord[]
    >();
    expectTypeOf<KairosMap["results"]["get"]>().toMatchTypeOf<
      (id: string, source?: ResultSource) => ResultRecord | undefined
    >();
    expectTypeOf<KairosMap["results"]["remove"]>().toMatchTypeOf<
      (id: string, source?: ResultSource) => boolean
    >();
    expectTypeOf<KairosMap["results"]["clear"]>().toMatchTypeOf<
      (options?: ResultQueryOptions) => ResultRecord[]
    >();
  });

  it("exposes result subpath types", () => {
    expectTypeOf<ResultSource>().toMatchTypeOf<import("./results").ResultSource>();
    expectTypeOf<ResultRecord>().toMatchTypeOf<import("./results").ResultRecord>();
    expectTypeOf<import("./results").ResultManager>().toMatchTypeOf<KairosMap["results"]>();
  });

  it("exposes performance manager types", () => {
    expectTypeOf<PerformanceBudget>().toEqualTypeOf<{
      maxEntities?: number;
      maxResults?: number;
      maxResultEntities?: number;
      maxLayerRuntimeObjects?: number;
    }>();
    expectTypeOf<PerformanceWarning>().toMatchTypeOf<{
      code: string;
      message: string;
      current: number;
      limit: number;
    }>();
    expectTypeOf<ResultPerformanceRecord>().toMatchTypeOf<{
      id: string;
      source: ResultSource;
      type: SDKManagedResult["type"];
      entityCount: number;
      primitiveCount: number;
      renderMode?: ResultRenderMode;
      createdAt: Date;
    }>();
    expectTypeOf<LayerPerformanceRecord>().toMatchTypeOf<{
      id: string;
      type: string;
      show: boolean;
      runtimeObjectCount: number;
    }>();
    expectTypeOf<PerformanceStats>().toMatchTypeOf<{
      entityCount: number;
      resultCount: number;
      resultEntityCount: number;
      resultPrimitiveCount: number;
      unmanagedEntityCount: number;
      overlayEntityCount: number;
      primitiveOverlayCount: number;
      layerCount: number;
      layerRuntimeObjectCount: number;
      effectCount: number;
      effectRuntimeObjectCount: number;
      animatedEffectCount: number;
      activeOperationCount: number;
      failedOperationCount: number;
      activeMutationLeaseCount: number;
      waitingMutationLeaseCount: number;
      warnings: PerformanceWarning[];
    }>();
    expectTypeOf<PrimitiveOptimizationCandidate>().toMatchTypeOf<{
      id: string;
      source: ResultSource;
      type: SDKManagedResult["type"];
      entityCount: number;
      priority: "low" | "medium" | "high";
    }>();
  });

  it("exposes map-level performance manager", () => {
    expectTypeOf<KairosMap["performance"]["getStats"]>().toMatchTypeOf<
      (options?: { budget?: PerformanceBudget }) => PerformanceStats
    >();
    expectTypeOf<KairosMap["performance"]["checkBudget"]>().toMatchTypeOf<
      (budget?: PerformanceBudget) => PerformanceWarning[]
    >();
    expectTypeOf<KairosMap["performance"]["recommendPrimitiveCandidates"]>().toMatchTypeOf<
      (options?: { minEntityCount?: number }) => PrimitiveOptimizationCandidate[]
    >();
    expectTypeOf<import("./performance").PerformanceManager>().toMatchTypeOf<
      KairosMap["performance"]
    >();
  });

  it("exposes primitive overlay types", () => {
    expectTypeOf<PrimitiveOverlayType>().toEqualTypeOf<"polyline">();
    expectTypeOf<ResultRenderMode>().toEqualTypeOf<"entity" | "primitive">();
    expectTypeOf<ResultPrimitiveType>().toEqualTypeOf<"polyline" | "polygon">();
    expectTypeOf<PrimitivePolylineOptions>().toMatchTypeOf<{
      id?: string;
      positions: Cartesian3[];
      color?: ColorLike;
      width?: number;
      show?: boolean;
      loop?: boolean;
      metadata?: Record<string, unknown>;
    }>();
    expectTypeOf<PrimitivePolylineOverlay>().toMatchTypeOf<{
      id: string;
      type: "polyline";
      positions: Cartesian3[];
      width: number;
      show: boolean;
      loop: boolean;
      createdAt: Date;
    }>();
    expectTypeOf<PrimitivePolylineSnapshot>().toMatchTypeOf<{
      id: string;
      type: "polyline";
      positions: SerializablePosition[];
      color: SerializableColor;
      width: number;
      show: boolean;
      loop: boolean;
      createdAt: string;
    }>();
    expectTypeOf<PrimitiveOverlay>().toEqualTypeOf<PrimitivePolylineOverlay>();
    expectTypeOf<PrimitiveOverlaySnapshot>().toEqualTypeOf<PrimitivePolylineSnapshot>();
    expectTypeOf<ResultPrimitiveRuntime>().toMatchTypeOf<
      | {
          id: string;
          type: "polyline";
          positions: Cartesian3[];
        }
      | {
          id: string;
          type: "polygon";
          positions: Cartesian3[];
        }
    >();
  });

  it("exposes map-level primitive overlay manager", () => {
    expectTypeOf<KairosMap["primitives"]["addPolyline"]>().toMatchTypeOf<
      (options: PrimitivePolylineOptions) => PrimitivePolylineOverlay
    >();
    expectTypeOf<KairosMap["primitives"]["toJSON"]>().toMatchTypeOf<
      () => PrimitiveOverlaySnapshot[]
    >();
    expectTypeOf<import("./primitives").PrimitiveOverlayManager>().toMatchTypeOf<
      KairosMap["primitives"]
    >();
  });

  it("exposes entity overlay manager types", () => {
    expectTypeOf<OverlayType>().toEqualTypeOf<DrawType>();
    expectTypeOf<OverlayData>().toEqualTypeOf<{
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
      plot?: PlotAlgorithmOptions;
    }>();
    expectTypeOf<OverlayConfig>().toMatchTypeOf<{
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
    }>();
    expectTypeOf<OverlayUpdateOptions>().toMatchTypeOf<{
      positions?: Cartesian3[];
      position?: Cartesian3;
      center?: Cartesian3;
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
      plot?: PlotAlgorithmOptions;
      text?: string;
      image?: string;
      uri?: string;
      style?: ResultSymbolStyle;
      properties?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      group?: string;
      locked?: boolean;
      editable?: boolean;
    }>();
    expectTypeOf<PointOverlayOptions>().toMatchTypeOf<{ position: Cartesian3 }>();
    expectTypeOf<PolylineOverlayOptions>().toMatchTypeOf<{ positions: Cartesian3[] }>();
    expectTypeOf<PolygonOverlayOptions>().toMatchTypeOf<{ positions: Cartesian3[] }>();
    expectTypeOf<CircleOverlayOptions>().toMatchTypeOf<{
      center: Cartesian3;
      radius: number;
    }>();
    expectTypeOf<RectangleOverlayOptions>().toMatchTypeOf<{
      positions: Cartesian3[];
    }>();
    expectTypeOf<BillboardOverlayOptions>().toMatchTypeOf<{
      position: Cartesian3;
      image: string;
      scale?: number;
    }>();
    expectTypeOf<LabelOverlayOptions>().toMatchTypeOf<{
      position: Cartesian3;
      text: string;
    }>();
    expectTypeOf<ModelOverlayOptions>().toMatchTypeOf<{
      position: Cartesian3;
      uri: string;
      scale?: number;
      minimumPixelSize?: number;
      maximumScale?: number;
      heading?: number;
      pitch?: number;
      roll?: number;
    }>();
    expectTypeOf<EllipseOverlayOptions>().toMatchTypeOf<{
      center: Cartesian3;
      semiMajorAxis: number;
      semiMinorAxis: number;
    }>();
    expectTypeOf<WallOverlayOptions>().toMatchTypeOf<{
      positions: Cartesian3[];
      minimumHeights?: number[];
      maximumHeights?: number[];
    }>();
    expectTypeOf<CorridorOverlayOptions>().toMatchTypeOf<{
      positions: Cartesian3[];
      width: number;
    }>();
    expectTypeOf<BoxOverlayOptions>().toMatchTypeOf<{
      position: Cartesian3;
      dimensions: [number, number, number];
    }>();
    expectTypeOf<CylinderOverlayOptions>().toMatchTypeOf<{
      position: Cartesian3;
      length: number;
      topRadius: number;
      bottomRadius: number;
    }>();
    expectTypeOf<PlotOverlayOptions>().toMatchTypeOf<{
      type: PlotType;
      positions: Cartesian3[];
      plot?: PlotAlgorithmOptions;
    }>();
    expectTypeOf<OverlayQueryOptions>().toEqualTypeOf<{
      type?: OverlayType | OverlayType[];
      group?: string;
      visible?: boolean;
      locked?: boolean;
      editable?: boolean;
    }>();
    expectTypeOf<Overlay>().toMatchTypeOf<{
      id: string;
      type: OverlayType;
      entity: Entity;
      positions: Cartesian3[];
      data?: OverlayData;
      show: boolean;
      properties?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      group?: string;
      locked: boolean;
      editable: boolean;
      createdAt: Date;
      updatedAt?: Date;
    }>();
    expectTypeOf<OverlaySnapshot>().toMatchTypeOf<{
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
    }>();
    expectTypeOf<KairosGeoJsonFeatureCollection>().toMatchTypeOf<{
      type: "FeatureCollection";
      features: Array<{
        type: "Feature";
        properties: Record<string, unknown>;
      }>;
    }>();
    expectTypeOf<GeoJsonExportOptions>().toEqualTypeOf<{
      includeSnapshot?: boolean;
    }>();
    expectTypeOf<KairosMap["overlays"]["add"]>().toMatchTypeOf<
      (config: OverlayConfig) => Overlay
    >();
    expectTypeOf<KairosMap["overlays"]["addPlot"]>().toMatchTypeOf<
      (options: PlotOverlayOptions) => Overlay
    >();
    expectTypeOf<KairosMap["overlays"]["update"]>().toMatchTypeOf<
      (id: string, options: OverlayUpdateOptions) => Overlay
    >();
    expectTypeOf<KairosMap["overlays"]["getProperties"]>().toMatchTypeOf<
      (id: string) => Record<string, unknown> | undefined
    >();
    expectTypeOf<KairosMap["overlays"]["setProperties"]>().toMatchTypeOf<
      (id: string, properties: Record<string, unknown> | undefined) => Overlay
    >();
    expectTypeOf<KairosMap["overlays"]["mergeProperties"]>().toMatchTypeOf<
      (id: string, patch: Record<string, unknown>) => Overlay
    >();
    expectTypeOf<KairosMap["overlays"]["getMetadata"]>().toMatchTypeOf<
      (id: string) => Record<string, unknown> | undefined
    >();
    expectTypeOf<KairosMap["overlays"]["setMetadata"]>().toMatchTypeOf<
      (id: string, metadata: Record<string, unknown> | undefined) => Overlay
    >();
    expectTypeOf<KairosMap["overlays"]["mergeMetadata"]>().toMatchTypeOf<
      (id: string, patch: Record<string, unknown>) => Overlay
    >();
    expectTypeOf<KairosMap["overlays"]["setStyleMany"]>().toMatchTypeOf<
      (ids: string[], style: ResultSymbolStyle) => Overlay[]
    >();
    expectTypeOf<KairosMap["overlays"]["setStyleWhere"]>().toMatchTypeOf<
      (options: OverlayQueryOptions, style: ResultSymbolStyle) => Overlay[]
    >();
    expectTypeOf<KairosMap["overlays"]["toJSON"]>().toMatchTypeOf<
      () => OverlaySnapshot[]
    >();
    expectTypeOf<KairosMap["overlays"]["toGeoJSON"]>().toMatchTypeOf<
      (options?: GeoJsonExportOptions) => KairosGeoJsonFeatureCollection
    >();
    expectTypeOf<import("./overlays").OverlayManager>().toMatchTypeOf<
      KairosMap["overlays"]
    >();
  });

  it("exposes height mode types", () => {
    expectTypeOf<HeightMode>().toEqualTypeOf<
      "absolute" | "clampToGround" | "relativeToGround"
    >();
    expectTypeOf<HeightOptions>().toEqualTypeOf<{
      mode?: HeightMode;
      offset?: number;
      sampleTerrain?: boolean;
    }>();
    expectTypeOf<HeightSample>().toEqualTypeOf<{
      original: Cartesian3;
      position: Cartesian3;
      height: number;
      sampled: boolean;
    }>();
  });

  it("exposes materials and effects contracts", () => {
    expectTypeOf<MaterialTarget>().toEqualTypeOf<"entity" | "primitive">();
    expectTypeOf<MaterialDefinition>().toMatchTypeOf<{
      type: string;
      targets: readonly MaterialTarget[];
      createProperty?: (descriptor: never) => MaterialProperty;
      createMaterial?: (descriptor: never) => Material | Promise<Material>;
    }>();
    expectTypeOf<KairosMap["materials"]["list"]>().returns.toEqualTypeOf<
      MaterialDefinitionInfo[]
    >();
    expectTypeOf<KairosMap["materials"]["createProperty"]>().returns.toEqualTypeOf<
      MaterialProperty
    >();
    expectTypeOf<KairosMap["materials"]["createMaterial"]>().returns.toEqualTypeOf<
      Promise<Material>
    >();
    expectTypeOf<MaterialDescriptor>().toHaveProperty("target");

    expectTypeOf<EffectType>().toEqualTypeOf<
      | "flow-line"
      | "flow-wall"
      | "pulse-circle"
      | "radar-scan"
      | "water-surface"
      | "particle"
      | "rain"
      | "snow"
      | "fog"
    >();
    expectTypeOf<EffectInstance>().toMatchTypeOf<{
      id: string;
      type: EffectType;
      show: boolean;
      group?: string;
      metadata?: Record<string, unknown>;
      config: EffectConfig;
      runtimeObjects: unknown[];
      createdAt: Date;
      updatedAt?: Date;
    }>();
    expectTypeOf<KairosMap["effects"]["add"]>().parameters.toEqualTypeOf<
      [EffectConfig, AsyncOperationOptions?]
    >();
    expectTypeOf<KairosMap["effects"]["update"]>().parameters.toEqualTypeOf<
      [string, EffectUpdateOptions, AsyncOperationOptions?]
    >();
    expectTypeOf<KairosMap["effects"]["load"]>().parameters.toEqualTypeOf<
      [EffectSnapshot[], EffectLoadOptions?]
    >();
  });

  it("exposes shared tool lifecycle event types", () => {
    expectTypeOf<ToolManagerEvents["cancel"]>().toEqualTypeOf<{ toolId: string }>();
    expectTypeOf<ToolManagerEvents["clear"]>().toEqualTypeOf<{
      source: "draw" | "measure" | "visibility" | "profile" | "clipping" | "terrain";
      ids: string[];
    }>();
  });

  it("exposes draw edit types", () => {
    expectTypeOf<DrawEditOptions>().toMatchTypeOf<{
      allowInsert?: boolean;
      allowDelete?: boolean;
      showMidpoints?: boolean;
    }>();

    expectTypeOf<DrawEditEvent>().toMatchTypeOf<{
      result: DrawResult;
      previousPositions: Cartesian3[];
      positions: Cartesian3[];
      reason: "drag" | "insert" | "delete" | "programmatic";
    }>();
  });

  it("exposes layer state and load types", () => {
    expectTypeOf<LayerState>().toMatchTypeOf<{
      id: string;
      type: string;
      show: boolean;
      order: number;
      opacity?: number;
      metadata?: Record<string, unknown>;
    }>();

    expectTypeOf<LayerLoadOptions>().toEqualTypeOf<{
      clear?: boolean;
      flyTo?: boolean;
      signal?: AbortSignal;
      operationId?: string;
    }>();

    expectTypeOf<LayerAdapter>().toMatchTypeOf<{
      id: string;
      type: string;
      transaction?: LayerTransactionHooks;
      show: boolean;
      getState?: () => LayerState;
      getRuntimeObjects?: () => unknown[];
      ownsRuntimeObject?: (object: unknown) => boolean;
      getFeatureProperties?: (object: unknown) => Record<string, unknown> | undefined;
    }>();

    expectTypeOf<LayerTransactionHooks>().toEqualTypeOf<{
      preflight?: (map: KairosMap) => void | Promise<void>;
      prepare: (map: KairosMap) => void | Promise<void>;
      attach: (map: KairosMap) => void | Promise<void>;
      detach: (map: KairosMap) => void | Promise<void>;
    }>();

    expectTypeOf<TilesetLayerConfig>().toMatchTypeOf<{
      type: "3dtiles";
      url: string;
      style?: Record<string, unknown>;
      maximumScreenSpaceError?: number;
      dynamicScreenSpaceError?: boolean;
      skipLevelOfDetail?: boolean;
      enablePick?: boolean;
    }>();

    expectTypeOf<GeoJsonLayerStyle>().toMatchTypeOf<{
      markerColor?: ColorLike;
      stroke?: ColorLike;
      fill?: ColorLike;
      strokeWidth?: number;
    }>();

    expectTypeOf<GltfLayerConfig>().toMatchTypeOf<{
      type: "gltf";
      position: Cartesian3;
      height?: HeightOptions;
      heightReference?: HeightReference;
      maximumScale?: number;
      color?: ColorLike;
      colorBlendMode?: ColorBlendMode;
    }>();
  });

  it("exposes scene state types", () => {
    expectTypeOf<CameraView>().toEqualTypeOf<{
      longitude: number;
      latitude: number;
      height: number;
      heading: number;
      pitch: number;
      roll: number;
    }>();

    expectTypeOf<CameraBookmark>().toMatchTypeOf<{
      id: string;
      name?: string;
      view: CameraView;
      createdAt: string;
    }>();

    expectTypeOf<SceneSnapshot>().toMatchTypeOf<{
      version: 1;
      camera?: CameraView;
      bookmarks: CameraBookmark[];
      results?: RuntimeResultsSnapshot;
      primitives?: PrimitiveOverlaySnapshot[];
      overlays?: OverlaySnapshot[];
      effects?: EffectSnapshot[];
      createdAt: string;
    }>();

    expectTypeOf<SceneStateSnapshotOptions>().toEqualTypeOf<{
      includeResults?: boolean;
      includePrimitives?: boolean;
      includeOverlays?: boolean;
      includeEffects?: boolean;
    }>();

    expectTypeOf<SceneStateLoadOptions>().toEqualTypeOf<{
      conflictPolicy?: "wait" | "reject";
      mode?: SceneLoadMode;
      clearLayers?: boolean;
      flyToCamera?: boolean;
      restoreResults?: boolean;
      clearResults?: boolean;
      restorePrimitives?: boolean;
      clearPrimitives?: boolean;
      restoreOverlays?: boolean;
      clearOverlays?: boolean;
      restoreEffects?: boolean;
      clearEffects?: boolean;
      signal?: AbortSignal;
      operationId?: string;
    }>();

    expectTypeOf<SceneLoadMode>().toEqualTypeOf<"transactional" | "progressive">();
    expectTypeOf<SceneTransactionStatus>().toEqualTypeOf<
      | "preparing"
      | "committing"
      | "rolling-back"
      | "succeeded"
      | "failed"
      | "canceled"
    >();
    expectTypeOf<SceneRollbackStatus>().toEqualTypeOf<
      "not-needed" | "running" | "succeeded" | "failed"
    >();
    expectTypeOf<SceneCleanupStatus>().toEqualTypeOf<
      "not-needed" | "running" | "succeeded" | "failed"
    >();
    expectTypeOf<SceneTransactionState>().toMatchTypeOf<{
      operationId: string;
      mode: SceneLoadMode;
      status: SceneTransactionStatus;
      stage?: string;
      rollbackStatus: SceneRollbackStatus;
      cleanupStatus: SceneCleanupStatus;
      cleanupErrors?: OperationErrorInfo[];
      startedAt: Date;
      finishedAt?: Date;
    }>();
    expectTypeOf<KairosMap["sceneState"]["getTransactionState"]>().returns.toEqualTypeOf<
      SceneTransactionState | undefined
    >();
    expectTypeOf<KairosMap["sceneState"]["whenIdle"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<import("./scene").SceneTransactionError>().toMatchTypeOf<Error>();

    expectTypeOf<RuntimeResultsSnapshot>().toEqualTypeOf<{
      draw: DrawResultSnapshot[];
      measure: MeasureResultSnapshot[];
      visibility: VisibilityResultSnapshot[];
      profile: ProfileResultSnapshot[];
      clipping: ClippingResultSnapshot[];
      terrain: TerrainResultSnapshot[];
    }>();
  });

  it("exposes persistence adapter types", () => {
    expectTypeOf<SnapshotStorageRecord>().toEqualTypeOf<{
      id: string;
      name?: string;
      createdAt: string;
      updatedAt?: string;
    }>();
    expectTypeOf<SnapshotStorageAdapter>().toMatchTypeOf<{
      save: (id: string, snapshot: SceneSnapshot, options?: { name?: string }) => Promise<void>;
      load: (id: string) => Promise<SceneSnapshot | undefined>;
      remove: (id: string) => Promise<boolean>;
      list: () => Promise<SnapshotStorageRecord[]>;
    }>();
    expectTypeOf<import("./persistence").SnapshotStorageAdapter>().toMatchTypeOf<
      SnapshotStorageAdapter
    >();
  });

  it("exposes picking and selection types", () => {
    expectTypeOf<PickResultType>().toEqualTypeOf<
      "entity" | "3dtiles" | "imagery" | "primitive"
    >();
    expectTypeOf<PickResultSource>().toEqualTypeOf<"layer" | "overlay">();

    expectTypeOf<PickOptions>().toEqualTypeOf<{
      includeImagery?: boolean;
      limit?: number;
      width?: number;
      height?: number;
    }>();

    expectTypeOf<PickingClickOptions>().toMatchTypeOf<PickOptions & {
      select?: boolean;
    }>();

    expectTypeOf<PickResult>().toMatchTypeOf<{
      id: string;
      type: PickResultType;
      source?: PickResultSource;
      layerId?: string;
      overlayId?: string;
      overlayType?: OverlayType;
      object: unknown;
      entity?: Entity;
      feature?: Cesium3DTileFeature | ImageryLayerFeatureInfo;
      position?: Cartesian3;
      cartographic?: Cartographic;
      windowPosition: Cartesian2;
      properties: Record<string, unknown>;
    }>();

    expectTypeOf<SelectionState>().toEqualTypeOf<{
      result?: PickResult;
      highlighted: boolean;
    }>();
  });
});
