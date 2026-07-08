import {
  Cesium3DTileFeature,
  Entity,
  ImageryLayerFeatureInfo,
  JulianDate
} from "cesium";

export function extractEntityProperties(entity: Entity): Record<string, unknown> {
  const properties = entity.properties?.getValue(JulianDate.now());
  const result = isRecord(properties) ? { ...properties } : {};

  if (entity.id) {
    result.id = entity.id;
  }
  if (entity.name) {
    result.name = entity.name;
  }

  return result;
}

export function extractTileFeatureProperties(
  feature: Cesium3DTileFeature
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const propertyId of feature.getPropertyIds()) {
    result[propertyId] = feature.getProperty(propertyId);
  }
  result.featureId = feature.featureId;
  return result;
}

export function extractImageryFeatureProperties(
  feature: ImageryLayerFeatureInfo
): Record<string, unknown> {
  const result = isRecord(feature.data) ? { ...feature.data } : {};

  if (feature.name) {
    result.name = feature.name;
  }
  if (feature.description) {
    result.description = feature.description;
  }

  return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
