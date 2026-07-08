import { Cartesian3, Cartographic, Ellipsoid, Math as CesiumMath } from "cesium";

export interface SerializablePosition {
  longitude: number;
  latitude: number;
  height: number;
}

export interface SerializableVector3 {
  x: number;
  y: number;
  z: number;
}

export interface RuntimeResultLoadOptions {
  clear?: boolean;
}

export function serializePosition(
  position: Cartesian3,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
): SerializablePosition {
  const cartographic = ellipsoid.cartesianToCartographic(position);
  if (!cartographic) {
    throw new Error("Position cannot be converted to cartographic coordinates.");
  }

  return {
    longitude: CesiumMath.toDegrees(cartographic.longitude),
    latitude: CesiumMath.toDegrees(cartographic.latitude),
    height: cartographic.height
  };
}

export function deserializePosition(
  position: SerializablePosition,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
): Cartesian3 {
  assertFinite(position.longitude, "Position longitude");
  assertFinite(position.latitude, "Position latitude");
  assertFinite(position.height, "Position height");

  return Cartographic.toCartesian(
    new Cartographic(
      CesiumMath.toRadians(position.longitude),
      CesiumMath.toRadians(position.latitude),
      position.height
    ),
    ellipsoid
  );
}

export function serializePositions(positions: Cartesian3[]): SerializablePosition[] {
  return positions.map((position) => serializePosition(position));
}

export function deserializePositions(positions: SerializablePosition[]): Cartesian3[] {
  return positions.map((position) => deserializePosition(position));
}

export function serializeVector3(vector: Cartesian3): SerializableVector3 {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}

export function deserializeVector3(vector: SerializableVector3): Cartesian3 {
  assertFinite(vector.x, "Vector x");
  assertFinite(vector.y, "Vector y");
  assertFinite(vector.z, "Vector z");

  return new Cartesian3(vector.x, vector.y, vector.z);
}

export function parseSnapshotDate(value: string | undefined, field: string): Date {
  if (!value) {
    return new Date();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid ISO date string.`);
  }

  return date;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}
