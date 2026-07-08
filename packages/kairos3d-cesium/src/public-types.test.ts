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
  ImageryLayerFeatureInfo
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
  TilesetLayerConfig
} from "./layers";
import type {
  DrawEditEvent,
  DrawEditOptions,
  DrawResult,
  DrawResultSnapshot,
  DrawType
} from "./draw";
import type {
  CameraBookmark,
  CameraView,
  RuntimeResultsSnapshot,
  SceneSnapshot,
  SceneStateSnapshotOptions,
  SceneStateLoadOptions
} from "./scene";
import type {
  AnalysisType,
  AnalysisResultsSnapshot,
  ClippingPlaneOptions,
  ClippingPolygonDrawOptions,
  ClippingPolygonOptions,
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
  TerrainGridSample,
  TerrainResult,
  TerrainResultSnapshot,
  TerrainSampleGrid,
  VolumeOptions,
  VolumeResult,
  VolumeResultSnapshot,
  VisibilityResult,
  VisibilityResultSnapshot
} from "./analysis";
import type {
  PickOptions,
  PickResult,
  PickResultType,
  PickingClickOptions,
  SelectionState
} from "./picking";
import type {
  ColorLike,
  LabelSymbolStyle,
  LineSymbolStyle,
  PointSymbolStyle,
  PolygonSymbolStyle,
  ResultSymbolStyle,
  SDKStyleDefaults,
  SelectionSymbolStyle,
  SerializableColor,
  SerializableResultSymbolStyle
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
  PrimitivePolylineOptions,
  PrimitivePolylineOverlay,
  PrimitivePolylineSnapshot
} from "./primitives";

describe("public SDK types", () => {
  it("exposes stable draw and measure result contracts", () => {
    expectTypeOf<DrawType>().toEqualTypeOf<"point" | "polyline" | "polygon">();
    expectTypeOf<MeasureType>().toEqualTypeOf<"distance" | "area" | "height">();
    expectTypeOf<MeasureUnit>().toEqualTypeOf<"m" | "km" | "m2" | "km2">();
    expectTypeOf<DistanceMeasureMode>().toEqualTypeOf<"space" | "surface">();
    expectTypeOf<AreaMeasureMode>().toEqualTypeOf<"projected" | "surface">();
    expectTypeOf<AnalysisType>().toEqualTypeOf<
      "visibility" | "profile" | "clipping" | "terrain"
    >();

    expectTypeOf<DrawResult>().toMatchTypeOf<{
      id: string;
      entity: Entity;
      positions: Cartesian3[];
      createdAt: Date;
      updatedAt?: Date;
      style?: ResultSymbolStyle;
      height?: HeightOptions;
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
    }>();

    expectTypeOf<VisibilityResult>().toMatchTypeOf<{
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
    expectTypeOf<ClippingPolygonOptions>().toMatchTypeOf<{
      target: ClippingTarget;
      positions: Cartesian3[];
      inverse?: boolean;
      quality?: number;
    }>();
    expectTypeOf<ClippingPolygonDrawOptions>().toEqualTypeOf<
      Omit<ClippingPolygonOptions, "positions">
    >();
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
      createdAt: string;
      updatedAt?: string;
      style?: SerializableResultSymbolStyle;
      height?: HeightOptions;
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
    }>();
    expectTypeOf<VisibilityResultSnapshot>().toMatchTypeOf<{
      id: string;
      type: "visibility";
      positions: [SerializablePosition, SerializablePosition];
      visible: boolean;
      distance: number;
      blockedPosition?: SerializablePosition;
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
    expectTypeOf<ResultSymbolStyle>().toMatchTypeOf<{
      point?: PointSymbolStyle;
      line?: LineSymbolStyle;
      polygon?: PolygonSymbolStyle;
      label?: LabelSymbolStyle;
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
      unmanagedEntityCount: number;
      primitiveOverlayCount: number;
      layerCount: number;
      layerRuntimeObjectCount: number;
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
    }>();

    expectTypeOf<LayerAdapter>().toMatchTypeOf<{
      id: string;
      type: string;
      show: boolean;
      getState?: () => LayerState;
      getRuntimeObjects?: () => unknown[];
      ownsRuntimeObject?: (object: unknown) => boolean;
      getFeatureProperties?: (object: unknown) => Record<string, unknown> | undefined;
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
      createdAt: string;
    }>();

    expectTypeOf<SceneStateSnapshotOptions>().toEqualTypeOf<{
      includeResults?: boolean;
    }>();

    expectTypeOf<SceneStateLoadOptions>().toEqualTypeOf<{
      clearLayers?: boolean;
      flyToCamera?: boolean;
      restoreResults?: boolean;
      clearResults?: boolean;
    }>();

    expectTypeOf<RuntimeResultsSnapshot>().toEqualTypeOf<{
      draw: DrawResultSnapshot[];
      measure: MeasureResultSnapshot[];
      visibility: VisibilityResultSnapshot[];
      profile: ProfileResultSnapshot[];
      clipping: ClippingResultSnapshot[];
      terrain: TerrainResultSnapshot[];
    }>();
  });

  it("exposes picking and selection types", () => {
    expectTypeOf<PickResultType>().toEqualTypeOf<
      "entity" | "3dtiles" | "imagery" | "primitive"
    >();

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
      layerId?: string;
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
