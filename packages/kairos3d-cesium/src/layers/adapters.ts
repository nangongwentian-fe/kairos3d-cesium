import {
  Cesium3DTileset,
  Cesium3DTileStyle,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  Entity,
  GeoJsonDataSource,
  ImageryLayer,
  UrlTemplateImageryProvider,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider
} from "cesium";
import type { Cartesian3 } from "cesium";
import type { KairosMap } from "../core";
import {
  cartesianWithHeight,
  heightReferenceFromMode,
  resolveHeightOptions,
  serializeHeightOptions
} from "../height";
import {
  extractEntityProperties,
  extractImageryFeatureProperties,
  extractTileFeatureProperties
} from "../picking/properties";
import {
  getImageryFeature,
  getPickedEntity,
  getTileFeature
} from "../picking/normalize";
import type {
  BaseLayerConfig,
  GeoJsonLayerConfig,
  GeoJsonLayerStyle,
  GltfLayerConfig,
  LayerAdapter,
  LayerConfig,
  LayerState,
  TerrainLayerConfig,
  TilesetLayerConfig,
  WmsLayerConfig,
  WmtsLayerConfig,
  XyzLayerConfig
} from "./types";
import { parseColorLike } from "../style";

abstract class BaseLayerAdapter<TConfig extends BaseLayerConfig> implements LayerAdapter {
  readonly id: string;
  readonly type: string;
  readonly name?: string;

  protected map?: KairosMap;
  protected visible: boolean;
  protected order: number;
  protected opacity?: number;

  constructor(protected readonly config: TConfig) {
    this.id = config.id ?? `${config.type}-${cryptoRandomId()}`;
    this.type = config.type;
    this.name = config.name;
    this.visible = config.show ?? true;
    this.order = config.order ?? 0;
  }

  get show(): boolean {
    return this.visible;
  }

  set show(value: boolean) {
    this.visible = value;
    this.setVisible(value);
  }

  abstract addTo(map: KairosMap): Promise<void> | void;
  abstract remove(): void;

  getState(): LayerState {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      group: this.config.group,
      show: this.show,
      order: this.order,
      opacity: this.opacity,
      metadata: this.config.metadata,
      config: this.toConfig()
    };
  }

  toConfig(): LayerConfig | undefined {
    return {
      ...this.config,
      id: this.id,
      show: this.show,
      order: this.order
    } as LayerConfig;
  }

  getRuntimeObjects(): unknown[] {
    return [];
  }

  ownsRuntimeObject(object: unknown): boolean {
    return this.getRuntimeObjects().includes(object);
  }

  getFeatureProperties(_object: unknown): Record<string, unknown> | undefined {
    return undefined;
  }

  setOpacity(alpha: number): void {
    this.opacity = alpha;
    this.applyOpacity(alpha);
  }

  setOrder(order: number): void {
    this.order = order;
    this.applyOrder(order);
  }

  async flyTo(): Promise<boolean> {
    if (!this.map) {
      return false;
    }

    const target = this.getRuntimeObjects()[0] as Parameters<KairosMap["viewer"]["flyTo"]>[0]
      | undefined;
    return target ? this.map.viewer.flyTo(target) : false;
  }

  destroy(): void {
    this.remove();
  }

  protected setVisible(_value: boolean): void {
    // Subclasses update native Cesium objects after they are added.
  }

  protected applyOpacity(_alpha: number): void {
    // Only layer kinds with native opacity update Cesium objects.
  }

  protected applyOrder(_order: number): void {
    // Subclasses with ordered Cesium collections update native order.
  }
}

export class ImageryConfigLayer extends BaseLayerAdapter<
  XyzLayerConfig | WmsLayerConfig | WmtsLayerConfig
> {
  private layer?: ImageryLayer;

  constructor(config: XyzLayerConfig | WmsLayerConfig | WmtsLayerConfig) {
    super(config);
    this.order = config.order ?? config.index ?? 0;
    this.opacity = config.alpha ?? 1;
  }

  async addTo(map: KairosMap): Promise<void> {
    this.map = map;
    const provider = createImageryProviderFromConfig(this.config);
    this.layer = new ImageryLayer(provider, {
      alpha: this.opacity,
      show: this.show
    });

    const index = this.order;
    map.viewer.imageryLayers.add(this.layer, index);
  }

  override toConfig(): LayerConfig | undefined {
    return {
      ...this.config,
      id: this.id,
      show: this.show,
      order: this.order,
      alpha: this.opacity
    } as LayerConfig;
  }

  override getRuntimeObjects(): unknown[] {
    return this.layer ? [this.layer] : [];
  }

  override ownsRuntimeObject(object: unknown): boolean {
    const imageryFeature = getImageryFeature(object);
    return object === this.layer || imageryFeature?.imageryLayer === this.layer;
  }

  override getFeatureProperties(object: unknown): Record<string, unknown> | undefined {
    const imageryFeature = getImageryFeature(object);
    return imageryFeature ? extractImageryFeatureProperties(imageryFeature) : undefined;
  }

  remove(): void {
    if (this.map && this.layer) {
      this.map.viewer.imageryLayers.remove(this.layer, true);
    }
    this.layer = undefined;
    this.map = undefined;
  }

  protected setVisible(value: boolean): void {
    if (this.layer) {
      this.layer.show = value;
    }
  }

  protected override applyOpacity(alpha: number): void {
    if (this.layer) {
      this.layer.alpha = alpha;
    }
  }

  protected override applyOrder(order: number): void {
    if (this.map && this.layer) {
      moveImageryLayerToIndex(this.map, this.layer, order);
    }
  }
}

export class TerrainConfigLayer extends BaseLayerAdapter<TerrainLayerConfig> {
  private previousTerrainProvider?: EllipsoidTerrainProvider | CesiumTerrainProvider;
  private terrainProvider?: EllipsoidTerrainProvider | CesiumTerrainProvider;

  async addTo(map: KairosMap): Promise<void> {
    this.map = map;
    this.previousTerrainProvider = map.viewer.terrainProvider as
      | EllipsoidTerrainProvider
      | CesiumTerrainProvider;
    this.terrainProvider = await createTerrainProviderFromConfig(this.config);
    map.viewer.terrainProvider = this.show
      ? this.terrainProvider
      : new EllipsoidTerrainProvider();
  }

  remove(): void {
    if (this.map && this.previousTerrainProvider) {
      this.map.viewer.terrainProvider = this.previousTerrainProvider;
    }
    this.map = undefined;
    this.terrainProvider = undefined;
    this.previousTerrainProvider = undefined;
  }

  protected setVisible(value: boolean): void {
    if (!this.map || !this.terrainProvider) {
      return;
    }
    this.map.viewer.terrainProvider = value
      ? this.terrainProvider
      : new EllipsoidTerrainProvider();
  }

  override getRuntimeObjects(): unknown[] {
    return this.terrainProvider ? [this.terrainProvider] : [];
  }

  override ownsRuntimeObject(object: unknown): boolean {
    return object === this.terrainProvider;
  }
}

export class TilesetConfigLayer extends BaseLayerAdapter<TilesetLayerConfig> {
  private tileset?: Cesium3DTileset;

  async addTo(map: KairosMap): Promise<void> {
    this.map = map;
    this.tileset = await Cesium3DTileset.fromUrl(
      this.config.url,
      createTilesetOptionsFromConfig(this.config)
    );
    this.tileset.show = this.show;
    if (this.config.style) {
      this.tileset.style = new Cesium3DTileStyle(this.config.style);
    }
    map.viewer.scene.primitives.add(this.tileset);

    if (this.config.flyTo) {
      await map.viewer.flyTo(this.tileset);
    }
  }

  override getRuntimeObjects(): unknown[] {
    return this.tileset ? [this.tileset] : [];
  }

  override ownsRuntimeObject(object: unknown): boolean {
    const tileFeature = getTileFeature(object);
    return object === this.tileset || tileFeature?.tileset === this.tileset;
  }

  override getFeatureProperties(object: unknown): Record<string, unknown> | undefined {
    const tileFeature = getTileFeature(object);
    return tileFeature ? extractTileFeatureProperties(tileFeature) : undefined;
  }

  remove(): void {
    if (this.map && this.tileset) {
      this.map.viewer.scene.primitives.remove(this.tileset);
    }
    this.tileset = undefined;
    this.map = undefined;
  }

  protected setVisible(value: boolean): void {
    if (this.tileset) {
      this.tileset.show = value;
    }
  }

  protected override applyOrder(order: number): void {
    if (this.map && this.tileset) {
      movePrimitiveToIndex(this.map, this.tileset, order);
    }
  }
}

export class GeoJsonConfigLayer extends BaseLayerAdapter<GeoJsonLayerConfig> {
  private dataSource?: GeoJsonDataSource;

  async addTo(map: KairosMap): Promise<void> {
    this.map = map;
    this.dataSource = await GeoJsonDataSource.load(
      this.config.data,
      createGeoJsonLoadOptions(this.config)
    );
    tagDataSourceEntities(this.dataSource, this.id);
    this.dataSource.show = this.show;
    await map.viewer.dataSources.add(this.dataSource);

    if (this.config.flyTo) {
      await map.viewer.flyTo(this.dataSource);
    }
  }

  override getRuntimeObjects(): unknown[] {
    return this.dataSource ? [this.dataSource] : [];
  }

  override ownsRuntimeObject(object: unknown): boolean {
    const entity = getPickedEntity(object);
    return (
      object === this.dataSource ||
      Boolean(entity && this.dataSource?.entities.contains(entity)) ||
      Boolean(entity && readLayerEntityTag(entity) === this.id)
    );
  }

  override getFeatureProperties(object: unknown): Record<string, unknown> | undefined {
    const entity = getPickedEntity(object);
    return entity ? extractEntityProperties(entity) : undefined;
  }

  remove(): void {
    if (this.map && this.dataSource) {
      this.map.viewer.dataSources.remove(this.dataSource, true);
    }
    this.dataSource = undefined;
    this.map = undefined;
  }

  protected setVisible(value: boolean): void {
    if (this.dataSource) {
      this.dataSource.show = value;
    }
  }

  protected override applyOrder(order: number): void {
    if (this.map && this.dataSource) {
      moveDataSourceToIndex(this.map, this.dataSource, order);
    }
  }
}

export class GltfConfigLayer extends BaseLayerAdapter<GltfLayerConfig> {
  private entity?: Entity;

  addTo(map: KairosMap): void {
    this.map = map;
    this.entity = map.viewer.entities.add({
      id: this.id,
      name: this.name,
      position: resolveGltfPosition(this.config),
      orientation: this.config.orientation,
      show: this.show,
      model: {
        uri: this.config.url,
        scale: this.config.scale,
        minimumPixelSize: this.config.minimumPixelSize,
        maximumScale: this.config.maximumScale,
        heightReference: resolveGltfHeightReference(this.config),
        color: this.config.color
          ? parseColorLike(this.config.color, "gltf.color")
          : undefined,
        colorBlendMode: this.config.colorBlendMode,
        colorBlendAmount: this.config.colorBlendAmount,
        silhouetteColor: this.config.silhouetteColor
          ? parseColorLike(this.config.silhouetteColor, "gltf.silhouetteColor")
          : undefined,
        silhouetteSize: this.config.silhouetteSize
      }
    });

    if (this.config.flyTo) {
      void map.viewer.flyTo(this.entity);
    }
  }

  override getRuntimeObjects(): unknown[] {
    return this.entity ? [this.entity] : [];
  }

  override toConfig(): LayerConfig | undefined {
    return {
      ...this.config,
      id: this.id,
      show: this.show,
      order: this.order,
      height: serializeHeightOptions(this.config.height)
    };
  }

  override ownsRuntimeObject(object: unknown): boolean {
    const entity = getPickedEntity(object);
    return object === this.entity || entity === this.entity;
  }

  override getFeatureProperties(object: unknown): Record<string, unknown> | undefined {
    const entity = getPickedEntity(object);
    return entity && entity === this.entity ? extractEntityProperties(entity) : undefined;
  }

  remove(): void {
    if (this.map && this.entity) {
      this.map.viewer.entities.remove(this.entity);
    }
    this.entity = undefined;
    this.map = undefined;
  }

  protected setVisible(value: boolean): void {
    if (this.entity) {
      this.entity.show = value;
    }
  }
}

export function createImageryProviderFromConfig(
  config: XyzLayerConfig | WmsLayerConfig | WmtsLayerConfig
) {
  if (config.type === "xyz") {
    return new UrlTemplateImageryProvider({
      url: config.url,
      pickFeaturesUrl: config.pickFeaturesUrl,
      subdomains: config.subdomains,
      minimumLevel: config.minimumLevel,
      maximumLevel: config.maximumLevel,
      credit: config.credit,
      tileWidth: config.tileWidth,
      tileHeight: config.tileHeight,
      hasAlphaChannel: config.hasAlphaChannel,
      enablePickFeatures: config.enablePickFeatures
    });
  }

  if (config.type === "wms") {
    return new WebMapServiceImageryProvider({
      url: config.url,
      layers: config.layers,
      parameters: config.parameters,
      enablePickFeatures: config.enablePickFeatures,
      getFeatureInfoParameters: config.getFeatureInfoParameters,
      getFeatureInfoUrl: config.getFeatureInfoUrl,
      getFeatureInfoFormats: config.getFeatureInfoFormats,
      minimumLevel: config.minimumLevel,
      maximumLevel: config.maximumLevel,
      tileWidth: config.tileWidth,
      tileHeight: config.tileHeight,
      crs: config.crs,
      srs: config.srs,
      credit: config.credit,
      subdomains: config.subdomains
    });
  }

  return new WebMapTileServiceImageryProvider({
    url: config.url,
    layer: config.layer,
    style: config.style,
    format: config.format ?? "image/png",
    tileMatrixSetID: config.tileMatrixSetID,
    enablePickFeatures: config.enablePickFeatures,
    getFeatureInfoParameters: config.getFeatureInfoParameters,
    getFeatureInfoUrl: config.getFeatureInfoUrl,
    getFeatureInfoFormats: config.getFeatureInfoFormats,
    minimumLevel: config.minimumLevel,
    maximumLevel: config.maximumLevel,
    tileWidth: config.tileWidth,
    tileHeight: config.tileHeight,
    tileMatrixLabels: config.tileMatrixLabels,
    credit: config.credit,
    subdomains: config.subdomains,
    dimensions: config.dimensions
  });
}

function createTilesetOptionsFromConfig(
  config: TilesetLayerConfig
): Cesium3DTileset.ConstructorOptions {
  return {
    modelMatrix: config.modelMatrix,
    maximumScreenSpaceError: config.maximumScreenSpaceError,
    dynamicScreenSpaceError: config.dynamicScreenSpaceError,
    dynamicScreenSpaceErrorDensity: config.dynamicScreenSpaceErrorDensity,
    dynamicScreenSpaceErrorFactor: config.dynamicScreenSpaceErrorFactor,
    dynamicScreenSpaceErrorHeightFalloff: config.dynamicScreenSpaceErrorHeightFalloff,
    skipLevelOfDetail: config.skipLevelOfDetail,
    baseScreenSpaceError: config.baseScreenSpaceError,
    skipScreenSpaceErrorFactor: config.skipScreenSpaceErrorFactor,
    skipLevels: config.skipLevels,
    immediatelyLoadDesiredLevelOfDetail: config.immediatelyLoadDesiredLevelOfDetail,
    loadSiblings: config.loadSiblings,
    enableCollision: config.enableCollision,
    enablePick: config.enablePick
  };
}

function createGeoJsonLoadOptions(
  config: GeoJsonLayerConfig
): GeoJsonDataSource.LoadOptions {
  const style = config.style;
  return {
    clampToGround: config.clampToGround,
    credit: config.credit,
    markerSize: style?.markerSize,
    markerSymbol: style?.markerSymbol,
    markerColor: parseGeoJsonStyleColor(style, "markerColor"),
    stroke: parseGeoJsonStyleColor(style, "stroke"),
    strokeWidth: style?.strokeWidth,
    fill: parseGeoJsonStyleColor(style, "fill")
  };
}

function parseGeoJsonStyleColor(
  style: GeoJsonLayerStyle | undefined,
  key: "markerColor" | "stroke" | "fill"
) {
  const value = style?.[key];
  return value ? parseColorLike(value, `geojson.style.${key}`) : undefined;
}

function resolveGltfPosition(config: GltfLayerConfig): Cartesian3 {
  if (!config.height) {
    return config.position;
  }

  const height = resolveHeightOptions(config.height);
  if (height.mode !== "relativeToGround") {
    return config.position;
  }

  return cartesianWithHeight(config.position, height.offset);
}

function resolveGltfHeightReference(
  config: GltfLayerConfig
): GltfLayerConfig["heightReference"] | undefined {
  if (config.heightReference !== undefined) {
    return config.heightReference;
  }

  return config.height
    ? heightReferenceFromMode(resolveHeightOptions(config.height).mode)
    : undefined;
}

const layerEntityTag = "__kairosLayerId";

function tagDataSourceEntities(dataSource: GeoJsonDataSource, layerId: string): void {
  for (const entity of dataSource.entities.values) {
    Object.defineProperty(entity, layerEntityTag, {
      value: layerId,
      configurable: true
    });
  }
}

function readLayerEntityTag(entity: Entity): string | undefined {
  return (entity as unknown as Record<string, unknown>)[layerEntityTag] as string | undefined;
}

export async function createTerrainProviderFromConfig(
  config: TerrainLayerConfig
): Promise<CesiumTerrainProvider | EllipsoidTerrainProvider> {
  const options = {
    requestVertexNormals: config.requestVertexNormals,
    requestWaterMask: config.requestWaterMask
  };

  if (typeof config.assetId === "number") {
    return CesiumTerrainProvider.fromIonAssetId(config.assetId, options);
  }

  if (config.url) {
    return CesiumTerrainProvider.fromUrl(config.url, options);
  }

  return new EllipsoidTerrainProvider();
}

function cryptoRandomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function moveImageryLayerToIndex(map: KairosMap, layer: ImageryLayer, order: number): void {
  const collection = map.viewer.imageryLayers;
  const target = clampCollectionIndex(order, collection.length);
  let current = collection.indexOf(layer);

  while (current >= 0 && current < target) {
    collection.raise(layer);
    current += 1;
  }

  while (current > target) {
    collection.lower(layer);
    current -= 1;
  }
}

function moveDataSourceToIndex(
  map: KairosMap,
  dataSource: GeoJsonDataSource,
  order: number
): void {
  const collection = map.viewer.dataSources;
  const target = clampCollectionIndex(order, collection.length);
  let current = collection.indexOf(dataSource);

  while (current >= 0 && current < target) {
    collection.raise(dataSource);
    current += 1;
  }

  while (current > target) {
    collection.lower(dataSource);
    current -= 1;
  }
}

function movePrimitiveToIndex(map: KairosMap, primitive: Cesium3DTileset, order: number): void {
  const collection = map.viewer.scene.primitives;
  const target = clampCollectionIndex(order, collection.length);
  let current = findPrimitiveIndex(collection, primitive);

  while (current >= 0 && current < target) {
    collection.raise(primitive);
    current += 1;
  }

  while (current > target) {
    collection.lower(primitive);
    current -= 1;
  }
}

function findPrimitiveIndex(
  collection: KairosMap["viewer"]["scene"]["primitives"],
  primitive: Cesium3DTileset
): number {
  for (let index = 0; index < collection.length; index += 1) {
    if (collection.get(index) === primitive) {
      return index;
    }
  }

  return -1;
}

function clampCollectionIndex(order: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(Math.floor(order), length - 1));
}
