import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileFeature,
  defined,
  Entity,
  ImageryLayerFeatureInfo
} from "cesium";
import type { LayerAdapter } from "../layers";
import type { Overlay } from "../overlays";
import {
  extractEntityProperties,
  extractImageryFeatureProperties,
  extractTileFeatureProperties,
  isRecord
} from "./properties";
import type { PickResult, PickResultType } from "./types";

export interface NormalizePickOptions {
  picked: unknown;
  windowPosition: Cartesian2;
  position?: Cartesian3;
  cartographic?: Cartographic;
  layer?: LayerAdapter;
  overlay?: Overlay;
}

let pickResultCounter = 0;

export function normalizePickedObject(options: NormalizePickOptions): PickResult | undefined {
  const { picked, windowPosition, position, cartographic, layer, overlay } = options;
  if (!defined(picked)) {
    return undefined;
  }

  const entity = getPickedEntity(picked);
  const tileFeature = getTileFeature(picked);
  const imageryFeature = getImageryFeature(picked);
  const type = getPickResultType({ entity, tileFeature, imageryFeature });
  const object = imageryFeature ?? tileFeature ?? entity ?? picked;
  const primitive = getPrimitive(picked);
  const layerProperties = layer?.getFeatureProperties?.(object);
  const properties =
    getOverlayProperties(overlay) ??
    layerProperties ??
    getDefaultProperties({
      entity,
      tileFeature,
      imageryFeature
    });

  return {
    id: createPickResultId(type, object),
    type,
    source: overlay ? "overlay" : layer ? "layer" : undefined,
    layerId: layer?.id,
    overlayId: overlay?.id,
    overlayType: overlay?.type,
    name: getPickResultName({ entity, tileFeature, imageryFeature, properties }),
    object,
    entity,
    feature: imageryFeature ?? tileFeature,
    primitive,
    position,
    cartographic,
    windowPosition: Cartesian2.clone(windowPosition),
    properties
  };
}

function getOverlayProperties(overlay?: Overlay): Record<string, unknown> | undefined {
  if (!overlay) {
    return undefined;
  }

  return {
    overlayId: overlay.id,
    overlayType: overlay.type,
    data: overlay.data ? { ...overlay.data } : undefined,
    metadata: overlay.metadata ? { ...overlay.metadata } : undefined
  };
}

export function getPickedEntity(picked: unknown): Entity | undefined {
  if (picked instanceof Entity) {
    return picked;
  }

  if (!isRecord(picked)) {
    return undefined;
  }

  const id = picked.id;
  if (id instanceof Entity) {
    return id;
  }

  const entity = picked.entity;
  return entity instanceof Entity ? entity : undefined;
}

export function getTileFeature(picked: unknown): Cesium3DTileFeature | undefined {
  if (picked instanceof Cesium3DTileFeature) {
    return picked;
  }

  if (
    isRecord(picked) &&
    typeof picked.getPropertyIds === "function" &&
    typeof picked.getProperty === "function"
  ) {
    return picked as unknown as Cesium3DTileFeature;
  }

  return undefined;
}

export function getImageryFeature(picked: unknown): ImageryLayerFeatureInfo | undefined {
  if (picked instanceof ImageryLayerFeatureInfo) {
    return picked;
  }

  if (
    isRecord(picked) &&
    "imageryLayer" in picked &&
    ("data" in picked || "description" in picked || "name" in picked)
  ) {
    return picked as unknown as ImageryLayerFeatureInfo;
  }

  return undefined;
}

export function getPrimitive(picked: unknown): unknown {
  return isRecord(picked) && "primitive" in picked ? picked.primitive : picked;
}

function getPickResultType(options: {
  entity?: Entity;
  tileFeature?: Cesium3DTileFeature;
  imageryFeature?: ImageryLayerFeatureInfo;
}): PickResultType {
  if (options.entity) {
    return "entity";
  }
  if (options.tileFeature) {
    return "3dtiles";
  }
  if (options.imageryFeature) {
    return "imagery";
  }
  return "primitive";
}

function getDefaultProperties(options: {
  entity?: Entity;
  tileFeature?: Cesium3DTileFeature;
  imageryFeature?: ImageryLayerFeatureInfo;
}): Record<string, unknown> {
  if (options.entity) {
    return extractEntityProperties(options.entity);
  }
  if (options.tileFeature) {
    return extractTileFeatureProperties(options.tileFeature);
  }
  if (options.imageryFeature) {
    return extractImageryFeatureProperties(options.imageryFeature);
  }
  return {};
}

function getPickResultName(options: {
  entity?: Entity;
  tileFeature?: Cesium3DTileFeature;
  imageryFeature?: ImageryLayerFeatureInfo;
  properties: Record<string, unknown>;
}): string | undefined {
  if (options.entity?.name) {
    return options.entity.name;
  }
  if (options.imageryFeature?.name) {
    return options.imageryFeature.name;
  }

  const name = options.properties.name ?? options.properties.title;
  return typeof name === "string" ? name : undefined;
}

function createPickResultId(type: PickResultType, object: unknown): string {
  if (object instanceof Entity) {
    return object.id;
  }
  if (object instanceof Cesium3DTileFeature) {
    return `${type}-${object.featureId}`;
  }
  if (object instanceof ImageryLayerFeatureInfo && object.name) {
    return `${type}-${object.name}`;
  }

  pickResultCounter += 1;
  return `${type}-${pickResultCounter}`;
}
