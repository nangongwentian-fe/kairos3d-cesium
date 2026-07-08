import {
  Cartesian3,
  Cartographic,
  ConstantProperty,
  HeightReference,
  type Entity
} from "cesium";
import type { LineSymbolStyle } from "../style";
import type { HeightMode, HeightOptions, ResolvedHeightOptions } from "./types";

const heightModes = new Set<HeightMode>([
  "absolute",
  "clampToGround",
  "relativeToGround"
]);

export function resolveHeightOptions(
  options?: HeightOptions,
  defaults: Partial<ResolvedHeightOptions> = {}
): ResolvedHeightOptions {
  const mode = options?.mode ?? defaults.mode ?? "absolute";
  if (!heightModes.has(mode)) {
    throw new Error(`Unsupported height mode "${String(mode)}".`);
  }

  const offset = options?.offset ?? defaults.offset ?? 0;
  if (!Number.isFinite(offset)) {
    throw new Error("HeightOptions.offset must be a finite number.");
  }

  return {
    mode,
    offset,
    sampleTerrain: options?.sampleTerrain ?? defaults.sampleTerrain ?? false
  };
}

export function serializeHeightOptions(options?: HeightOptions): HeightOptions | undefined {
  if (!options) {
    return undefined;
  }

  const resolved = resolveHeightOptions(options);
  const serialized: HeightOptions = {};
  if (resolved.mode !== "absolute") {
    serialized.mode = resolved.mode;
  }
  if (resolved.mode === "relativeToGround" || resolved.offset !== 0) {
    serialized.offset = resolved.offset;
  }
  if (resolved.sampleTerrain) {
    serialized.sampleTerrain = true;
  }

  return Object.keys(serialized).length ? serialized : undefined;
}

export function heightReferenceFromMode(mode: HeightMode): HeightReference {
  if (mode === "clampToGround") {
    return HeightReference.CLAMP_TO_GROUND;
  }

  if (mode === "relativeToGround") {
    return HeightReference.RELATIVE_TO_GROUND;
  }

  return HeightReference.NONE;
}

export function cloneCartesianPositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

export function cartographicFromCartesian(position: Cartesian3): Cartographic {
  const cartographic = Cartographic.fromCartesian(position);
  if (!cartographic) {
    throw new Error("Position cannot be converted to cartographic coordinates.");
  }
  return cartographic;
}

export function cartesianWithHeight(position: Cartesian3, height: number): Cartesian3 {
  const cartographic = cartographicFromCartesian(position);
  return Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, height);
}

export function lineStyleWithHeight(
  style?: LineSymbolStyle,
  height?: HeightOptions
): LineSymbolStyle | undefined {
  if (!height) {
    return style;
  }

  return {
    ...style,
    clampToGround: resolveHeightOptions(height).mode === "clampToGround"
  };
}

export function applyHeightOptionsToEntity(entity: Entity, height?: HeightOptions): void {
  if (!height) {
    return;
  }

  const resolved = resolveHeightOptions(height);
  const reference = heightReferenceFromMode(resolved.mode);
  if (entity.point) {
    entity.point.heightReference = new ConstantProperty(reference);
  }
  if (entity.polyline) {
    entity.polyline.clampToGround = new ConstantProperty(resolved.mode === "clampToGround");
  }
  if (entity.polygon) {
    entity.polygon.heightReference = new ConstantProperty(reference);
    if (resolved.mode === "clampToGround") {
      entity.polygon.height = new ConstantProperty(0);
    } else if (resolved.mode === "relativeToGround") {
      entity.polygon.height = new ConstantProperty(resolved.offset);
    }
  }
}
