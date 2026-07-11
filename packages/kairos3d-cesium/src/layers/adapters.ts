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
import type { Cartesian3, TerrainProvider } from "cesium";
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
  LayerTransactionHooks,
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
  readonly transaction: LayerTransactionHooks = {
    preflight: (map) => this.preflight(map),
    prepare: (map) => this.prepare(map),
    attach: (map) => this.attach(map),
    detach: (map) => this.detach(map)
  };

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

  async addTo(map: KairosMap): Promise<void> {
    await this.transaction.prepare(map);
    try {
      await this.transaction.attach(map);
      await this.afterAdd(map);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  remove(): void {
    if (this.map) {
      this.detach(this.map);
    }
    this.destroyRuntime();
    this.map = undefined;
  }

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
    if (!this.map || !this.isRuntimeAttached(this.map)) {
      return false;
    }

    const target = this.getRuntimeObjects()[0] as Parameters<KairosMap["viewer"]["flyTo"]>[0]
      | undefined;
    return target ? this.map.viewer.flyTo(target) : false;
  }

  destroy(): void {
    this.remove();
  }

  protected get isAttached(): boolean {
    return this.map ? this.isRuntimeAttached(this.map) : false;
  }

  protected abstract prepareRuntime(map: KairosMap): void | Promise<void>;
  protected abstract attachRuntime(map: KairosMap): void | Promise<void>;
  protected abstract detachRuntime(map: KairosMap): void;
  protected abstract isRuntimeAttached(map: KairosMap): boolean;
  protected abstract destroyRuntime(): void;

  protected preflightRuntime(_map: KairosMap): void | Promise<void> {
    // Built-in adapters validate configuration without creating Cesium runtime.
  }

  protected afterAdd(_map: KairosMap): void | Promise<void> {
    // Subclasses with flyTo config preserve their existing addTo behavior here.
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

  private async prepare(map: KairosMap): Promise<void> {
    if (this.map) {
      throw new Error(`Layer "${this.id}" is already prepared.`);
    }

    this.map = map;
    try {
      await this.prepareRuntime(map);
    } catch (error) {
      this.destroyRuntime();
      this.map = undefined;
      throw error;
    }
  }

  private async preflight(map: KairosMap): Promise<void> {
    if (this.map) {
      throw new Error(`Layer "${this.id}" is already prepared.`);
    }
    validateBaseLayerConfig(this.config);
    await this.preflightRuntime(map);
  }

  private async attach(map: KairosMap): Promise<void> {
    this.requirePreparedMap(map);
    if (this.isRuntimeAttached(map)) {
      return;
    }

    try {
      await this.attachRuntime(map);
    } catch (error) {
      try {
        await this.detachRuntime(map);
      } catch {
        // Preserve the original attach error. The manager's rollback will retry cleanup.
      }
      throw error;
    }
  }

  private detach(map: KairosMap): void {
    this.requirePreparedMap(map);
    if (!this.isRuntimeAttached(map)) {
      return;
    }

    this.detachRuntime(map);
  }

  private requirePreparedMap(map: KairosMap): void {
    if (!this.map) {
      throw new Error(`Layer "${this.id}" has not been prepared.`);
    }
    if (this.map !== map) {
      throw new Error(`Layer "${this.id}" was prepared for a different map.`);
    }
  }
}

export class ImageryConfigLayer extends BaseLayerAdapter<
  XyzLayerConfig | WmsLayerConfig | WmtsLayerConfig
> {
  private layer?: ImageryLayer;
  private detachedIndex?: number;

  constructor(config: XyzLayerConfig | WmsLayerConfig | WmtsLayerConfig) {
    super(config);
    this.order = config.order ?? config.index ?? 0;
    this.opacity = config.alpha ?? 1;
  }

  protected override preflightRuntime(): void {
    assertNonEmptyString(this.config.url, `${this.config.type}.url`);
    assertOptionalUnitInterval(this.config.alpha, `${this.config.type}.alpha`);
    assertOptionalFinite(this.config.index, `${this.config.type}.index`);
    assertOptionalNonNegativeInteger(this.config.minimumLevel, `${this.config.type}.minimumLevel`);
    assertOptionalNonNegativeInteger(this.config.maximumLevel, `${this.config.type}.maximumLevel`);
    assertOptionalPositiveInteger(this.config.tileWidth, `${this.config.type}.tileWidth`);
    assertOptionalPositiveInteger(this.config.tileHeight, `${this.config.type}.tileHeight`);
    if (
      this.config.minimumLevel !== undefined &&
      this.config.maximumLevel !== undefined &&
      this.config.minimumLevel > this.config.maximumLevel
    ) {
      throw new Error(`${this.config.type}.minimumLevel cannot exceed maximumLevel.`);
    }
    if (this.config.type === "wms") {
      assertNonEmptyString(this.config.layers, "wms.layers");
    }
    if (this.config.type === "wmts") {
      assertNonEmptyString(this.config.layer, "wmts.layer");
      assertNonEmptyString(this.config.style, "wmts.style");
      assertNonEmptyString(this.config.tileMatrixSetID, "wmts.tileMatrixSetID");
    }
  }

  protected prepareRuntime(_map: KairosMap): void {
    const provider = createImageryProviderFromConfig(this.config);
    this.layer = new ImageryLayer(provider, {
      alpha: this.opacity,
      show: this.show
    });
  }

  protected attachRuntime(map: KairosMap): void {
    if (!this.layer) {
      throw new Error(`Layer "${this.id}" has no prepared imagery runtime.`);
    }

    const collection = map.viewer.imageryLayers;
    const index = clampInsertionIndex(this.detachedIndex ?? this.order, collection.length);
    collection.add(this.layer, index);
    this.detachedIndex = undefined;
  }

  protected detachRuntime(map: KairosMap): void {
    if (!this.layer) {
      return;
    }

    const collection = map.viewer.imageryLayers;
    if (collection.contains(this.layer)) {
      this.detachedIndex = collection.indexOf(this.layer);
      collection.remove(this.layer, false);
    }
  }

  protected isRuntimeAttached(map: KairosMap): boolean {
    return Boolean(this.layer && map.viewer.imageryLayers.contains(this.layer));
  }

  protected destroyRuntime(): void {
    if (this.layer && !this.layer.isDestroyed()) {
      this.layer.destroy();
    }
    this.layer = undefined;
    this.detachedIndex = undefined;
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
  private previousTerrainProvider?: TerrainProvider;
  private terrainProvider?: EllipsoidTerrainProvider | CesiumTerrainProvider;
  private hiddenTerrainProvider?: EllipsoidTerrainProvider;

  protected override preflightRuntime(): void {
    if (this.config.url !== undefined) {
      assertNonEmptyString(this.config.url, "terrain.url");
    }
    if (
      this.config.assetId !== undefined &&
      (!Number.isInteger(this.config.assetId) || this.config.assetId < 0)
    ) {
      throw new Error("terrain.assetId must be a non-negative integer.");
    }
  }

  protected async prepareRuntime(_map: KairosMap): Promise<void> {
    this.terrainProvider = await createTerrainProviderFromConfig(this.config);
    this.hiddenTerrainProvider = new EllipsoidTerrainProvider();
  }

  protected attachRuntime(map: KairosMap): void {
    if (!this.terrainProvider || !this.hiddenTerrainProvider) {
      throw new Error(`Layer "${this.id}" has no prepared terrain runtime.`);
    }

    this.previousTerrainProvider = map.viewer.terrainProvider;
    map.viewer.terrainProvider = this.show
      ? this.terrainProvider
      : this.hiddenTerrainProvider;
  }

  protected detachRuntime(map: KairosMap): void {
    if (this.previousTerrainProvider) {
      map.viewer.terrainProvider = this.previousTerrainProvider;
    }
    this.previousTerrainProvider = undefined;
  }

  protected isRuntimeAttached(map: KairosMap): boolean {
    return Boolean(
      (this.terrainProvider && map.viewer.terrainProvider === this.terrainProvider) ||
      (this.hiddenTerrainProvider && map.viewer.terrainProvider === this.hiddenTerrainProvider)
    );
  }

  protected destroyRuntime(): void {
    this.terrainProvider = undefined;
    this.hiddenTerrainProvider = undefined;
    this.previousTerrainProvider = undefined;
  }

  protected setVisible(value: boolean): void {
    if (!this.map || !this.isAttached || !this.terrainProvider || !this.hiddenTerrainProvider) {
      return;
    }
    this.map.viewer.terrainProvider = value
      ? this.terrainProvider
      : this.hiddenTerrainProvider;
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
  private detachedIndex?: number;

  protected override preflightRuntime(): void {
    assertNonEmptyString(this.config.url, "3dtiles.url");
    assertOptionalNonNegative(
      this.config.maximumScreenSpaceError,
      "3dtiles.maximumScreenSpaceError"
    );
    assertOptionalNonNegativeInteger(this.config.skipLevels, "3dtiles.skipLevels");
    assertOptionalFinite(this.config.dynamicScreenSpaceErrorDensity, "3dtiles.dynamicScreenSpaceErrorDensity");
    assertOptionalFinite(this.config.dynamicScreenSpaceErrorFactor, "3dtiles.dynamicScreenSpaceErrorFactor");
    assertOptionalFinite(
      this.config.dynamicScreenSpaceErrorHeightFalloff,
      "3dtiles.dynamicScreenSpaceErrorHeightFalloff"
    );
  }

  protected async prepareRuntime(_map: KairosMap): Promise<void> {
    this.tileset = await Cesium3DTileset.fromUrl(
      this.config.url,
      createTilesetOptionsFromConfig(this.config)
    );
    this.tileset.show = this.show;
    if (this.config.style) {
      this.tileset.style = new Cesium3DTileStyle(this.config.style);
    }
  }

  protected attachRuntime(map: KairosMap): void {
    if (!this.tileset) {
      throw new Error(`Layer "${this.id}" has no prepared 3D Tiles runtime.`);
    }

    const collection = map.viewer.scene.primitives;
    const index = clampInsertionIndex(this.detachedIndex ?? this.order, collection.length);
    collection.add(this.tileset, index);
    this.detachedIndex = undefined;
  }

  protected detachRuntime(map: KairosMap): void {
    if (!this.tileset) {
      return;
    }

    const collection = map.viewer.scene.primitives;
    if (collection.contains(this.tileset)) {
      this.detachedIndex = findPrimitiveIndex(collection, this.tileset);
      removePrimitiveWithoutDestroy(collection, this.tileset);
    }
  }

  protected isRuntimeAttached(map: KairosMap): boolean {
    return Boolean(this.tileset && map.viewer.scene.primitives.contains(this.tileset));
  }

  protected destroyRuntime(): void {
    if (this.tileset && !this.tileset.isDestroyed()) {
      this.tileset.destroy();
    }
    this.tileset = undefined;
    this.detachedIndex = undefined;
  }

  protected override async afterAdd(map: KairosMap): Promise<void> {
    if (this.config.flyTo && this.tileset) {
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
  private detachedIndex?: number;

  protected override preflightRuntime(): void {
    if (typeof this.config.data === "string") {
      assertNonEmptyString(this.config.data, "geojson.data");
    } else if (!this.config.data || typeof this.config.data !== "object") {
      throw new Error("geojson.data must be a URL string or object.");
    }
    createGeoJsonLoadOptions(this.config);
    assertOptionalNonNegative(this.config.style?.markerSize, "geojson.style.markerSize");
    assertOptionalNonNegative(this.config.style?.strokeWidth, "geojson.style.strokeWidth");
  }

  protected async prepareRuntime(_map: KairosMap): Promise<void> {
    this.dataSource = await GeoJsonDataSource.load(
      this.config.data,
      createGeoJsonLoadOptions(this.config)
    );
    tagDataSourceEntities(this.dataSource, this.id);
    this.dataSource.show = this.show;
  }

  protected async attachRuntime(map: KairosMap): Promise<void> {
    if (!this.dataSource) {
      throw new Error(`Layer "${this.id}" has no prepared GeoJSON runtime.`);
    }

    await map.viewer.dataSources.add(this.dataSource);
    moveDataSourceToIndex(map, this.dataSource, this.detachedIndex ?? this.order);
    this.detachedIndex = undefined;
  }

  protected detachRuntime(map: KairosMap): void {
    if (!this.dataSource) {
      return;
    }

    const collection = map.viewer.dataSources;
    if (collection.contains(this.dataSource)) {
      this.detachedIndex = collection.indexOf(this.dataSource);
      collection.remove(this.dataSource, false);
    }
  }

  protected isRuntimeAttached(map: KairosMap): boolean {
    return Boolean(this.dataSource && map.viewer.dataSources.contains(this.dataSource));
  }

  protected destroyRuntime(): void {
    this.dataSource = undefined;
    this.detachedIndex = undefined;
  }

  protected override async afterAdd(map: KairosMap): Promise<void> {
    if (this.config.flyTo && this.dataSource) {
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

  protected override preflightRuntime(): void {
    assertNonEmptyString(this.config.url, "gltf.url");
    if (
      !this.config.position ||
      !Number.isFinite(this.config.position.x) ||
      !Number.isFinite(this.config.position.y) ||
      !Number.isFinite(this.config.position.z)
    ) {
      throw new Error("gltf.position must contain finite Cartesian coordinates.");
    }
    assertOptionalNonNegative(this.config.scale, "gltf.scale");
    assertOptionalNonNegative(this.config.minimumPixelSize, "gltf.minimumPixelSize");
    assertOptionalNonNegative(this.config.maximumScale, "gltf.maximumScale");
    assertOptionalUnitInterval(this.config.colorBlendAmount, "gltf.colorBlendAmount");
    assertOptionalNonNegative(this.config.silhouetteSize, "gltf.silhouetteSize");
    resolveGltfPosition(this.config);
    resolveGltfHeightReference(this.config);
    if (this.config.color) parseColorLike(this.config.color, "gltf.color");
    if (this.config.silhouetteColor) {
      parseColorLike(this.config.silhouetteColor, "gltf.silhouetteColor");
    }
  }

  protected prepareRuntime(_map: KairosMap): void {
    this.entity = new Entity({
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
  }

  protected attachRuntime(map: KairosMap): void {
    if (!this.entity) {
      throw new Error(`Layer "${this.id}" has no prepared glTF runtime.`);
    }
    map.viewer.entities.add(this.entity);
  }

  protected detachRuntime(map: KairosMap): void {
    if (this.entity && map.viewer.entities.contains(this.entity)) {
      map.viewer.entities.remove(this.entity);
    }
  }

  protected isRuntimeAttached(map: KairosMap): boolean {
    return Boolean(this.entity && map.viewer.entities.contains(this.entity));
  }

  protected destroyRuntime(): void {
    this.entity = undefined;
  }

  protected override afterAdd(map: KairosMap): void {
    if (this.config.flyTo && this.entity) {
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

function validateBaseLayerConfig(config: BaseLayerConfig): void {
  assertNonEmptyString(config.type, "layer.type");
  if (config.id !== undefined) assertNonEmptyString(config.id, "layer.id");
  assertOptionalFinite(config.order, "layer.order");
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertOptionalFinite(value: number | undefined, label: string): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function assertOptionalNonNegative(value: number | undefined, label: string): void {
  assertOptionalFinite(value, label);
  if (value !== undefined && value < 0) {
    throw new Error(`${label} must be greater than or equal to 0.`);
  }
}

function assertOptionalNonNegativeInteger(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertOptionalPositiveInteger(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function assertOptionalUnitInterval(value: number | undefined, label: string): void {
  assertOptionalFinite(value, label);
  if (value !== undefined && (value < 0 || value > 1)) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
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

function removePrimitiveWithoutDestroy(
  collection: KairosMap["viewer"]["scene"]["primitives"],
  primitive: Cesium3DTileset
): void {
  const destroyPrimitives = collection.destroyPrimitives;
  collection.destroyPrimitives = false;
  try {
    collection.remove(primitive);
  } finally {
    collection.destroyPrimitives = destroyPrimitives;
  }
}

function clampInsertionIndex(order: number, length: number): number {
  return Math.max(0, Math.min(Math.floor(order), length));
}

function clampCollectionIndex(order: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(Math.floor(order), length - 1));
}
