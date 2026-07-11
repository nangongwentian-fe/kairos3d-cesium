import type {
  Cartesian3,
  ColorBlendMode,
  Entity,
  GeoJsonDataSource,
  GetFeatureInfoFormat,
  HeightReference,
  ImageryLayer,
  Matrix4,
  Quaternion,
  TerrainProvider,
  Viewer
} from "cesium";
import type { KairosMap } from "../core";
import type { Disposable } from "../core/disposable";
import type { HeightOptions } from "../height";
import type { AsyncOperationOptions } from "../operations";
import type { ColorLike } from "../style";

export type LayerType = "xyz" | "wms" | "wmts" | "terrain" | "3dtiles" | "geojson" | "gltf";

export interface BaseLayerConfig {
  id?: string;
  type: string;
  name?: string;
  group?: string;
  order?: number;
  show?: boolean;
  flyTo?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ImageryLayerConfig extends BaseLayerConfig {
  alpha?: number;
  index?: number;
}

export interface XyzLayerConfig extends ImageryLayerConfig {
  type: "xyz";
  url: string;
  pickFeaturesUrl?: string;
  subdomains?: string | string[];
  minimumLevel?: number;
  maximumLevel?: number;
  credit?: string;
  tileWidth?: number;
  tileHeight?: number;
  hasAlphaChannel?: boolean;
  enablePickFeatures?: boolean;
}

export interface WmsLayerConfig extends ImageryLayerConfig {
  type: "wms";
  url: string;
  layers: string;
  parameters?: Record<string, string>;
  enablePickFeatures?: boolean;
  getFeatureInfoParameters?: Record<string, string>;
  getFeatureInfoUrl?: string;
  getFeatureInfoFormats?: GetFeatureInfoFormat[];
  minimumLevel?: number;
  maximumLevel?: number;
  tileWidth?: number;
  tileHeight?: number;
  crs?: string;
  srs?: string;
  credit?: string;
  subdomains?: string | string[];
}

export interface WmtsLayerConfig extends ImageryLayerConfig {
  type: "wmts";
  url: string;
  layer: string;
  style: string;
  format?: string;
  tileMatrixSetID: string;
  enablePickFeatures?: boolean;
  getFeatureInfoParameters?: Record<string, string>;
  getFeatureInfoUrl?: string;
  getFeatureInfoFormats?: GetFeatureInfoFormat[];
  minimumLevel?: number;
  maximumLevel?: number;
  tileWidth?: number;
  tileHeight?: number;
  tileMatrixLabels?: string[];
  credit?: string;
  subdomains?: string | string[];
  dimensions?: Record<string, string>;
}

export interface TerrainLayerConfig extends BaseLayerConfig {
  type: "terrain";
  url?: string;
  assetId?: number;
  requestVertexNormals?: boolean;
  requestWaterMask?: boolean;
}

export interface TilesetLayerConfig extends BaseLayerConfig {
  type: "3dtiles";
  url: string;
  style?: Record<string, unknown>;
  modelMatrix?: Matrix4;
  maximumScreenSpaceError?: number;
  dynamicScreenSpaceError?: boolean;
  dynamicScreenSpaceErrorDensity?: number;
  dynamicScreenSpaceErrorFactor?: number;
  dynamicScreenSpaceErrorHeightFalloff?: number;
  skipLevelOfDetail?: boolean;
  baseScreenSpaceError?: number;
  skipScreenSpaceErrorFactor?: number;
  skipLevels?: number;
  immediatelyLoadDesiredLevelOfDetail?: boolean;
  loadSiblings?: boolean;
  enableCollision?: boolean;
  enablePick?: boolean;
}

export interface GeoJsonLayerStyle {
  markerSize?: number;
  markerSymbol?: string;
  markerColor?: ColorLike;
  stroke?: ColorLike;
  strokeWidth?: number;
  fill?: ColorLike;
}

export interface GeoJsonLayerConfig extends BaseLayerConfig {
  type: "geojson";
  data: string | object;
  clampToGround?: boolean;
  style?: GeoJsonLayerStyle;
  credit?: string;
}

export interface GltfLayerConfig extends BaseLayerConfig {
  type: "gltf";
  url: string;
  position: Cartesian3;
  orientation?: Quaternion;
  height?: HeightOptions;
  heightReference?: HeightReference;
  scale?: number;
  minimumPixelSize?: number;
  maximumScale?: number;
  color?: ColorLike;
  colorBlendMode?: ColorBlendMode;
  colorBlendAmount?: number;
  silhouetteColor?: ColorLike;
  silhouetteSize?: number;
}

export type LayerConfig =
  | XyzLayerConfig
  | WmsLayerConfig
  | WmtsLayerConfig
  | TerrainLayerConfig
  | TilesetLayerConfig
  | GeoJsonLayerConfig
  | GltfLayerConfig;

export interface LayerTransactionHooks {
  preflight?(map: KairosMap): void | Promise<void>;
  prepare(map: KairosMap): void | Promise<void>;
  attach(map: KairosMap): void | Promise<void>;
  detach(map: KairosMap): void | Promise<void>;
}

export interface LayerAdapter extends Disposable {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly transaction?: LayerTransactionHooks;
  show: boolean;
  addTo(map: KairosMap): Promise<void> | void;
  remove(): void;
  getState?(): LayerState;
  toConfig?(): LayerConfig | undefined;
  getRuntimeObjects?(): unknown[];
  ownsRuntimeObject?(object: unknown): boolean;
  getFeatureProperties?(object: unknown): Record<string, unknown> | undefined;
  setOpacity?(alpha: number): void;
  setOrder?(order: number): void;
  flyTo?(): Promise<boolean> | boolean;
}

export interface LayerState {
  id: string;
  type: string;
  name?: string;
  group?: string;
  show: boolean;
  order: number;
  opacity?: number;
  metadata?: Record<string, unknown>;
  config?: LayerConfig;
}

export interface LayerLoadOptions extends AsyncOperationOptions {
  clear?: boolean;
  flyTo?: boolean;
}

export interface LayerFactory<TConfig extends BaseLayerConfig = BaseLayerConfig> {
  (config: TConfig): LayerAdapter | Promise<LayerAdapter>;
}

export interface ImageryLayerHandle {
  viewer: Viewer;
  layer: ImageryLayer;
}

export interface TerrainLayerHandle {
  viewer: Viewer;
  previousTerrainProvider: TerrainProvider;
  terrainProvider: TerrainProvider;
}

export type LayerRuntimeObject = ImageryLayer | TerrainProvider | Entity | GeoJsonDataSource | unknown;
