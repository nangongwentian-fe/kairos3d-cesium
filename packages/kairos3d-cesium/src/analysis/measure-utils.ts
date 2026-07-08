import { Cartesian3, Cartographic, Math as CesiumMath } from "cesium";

const earthRadius = 6378137;

export function measureDistance(positions: Cartesian3[]): number {
  let total = 0;
  for (let index = 1; index < positions.length; index += 1) {
    total += Cartesian3.distance(positions[index - 1], positions[index]);
  }
  return total;
}

export function measureHeight(start: Cartesian3, end: Cartesian3): number {
  const startCartographic = Cartographic.fromCartesian(start);
  const endCartographic = Cartographic.fromCartesian(end);
  return endCartographic.height - startCartographic.height;
}

export function measureArea(positions: Cartesian3[]): number {
  if (positions.length < 3) {
    return 0;
  }

  const projected = positions.map((position) => {
    const cartographic = Cartographic.fromCartesian(position);
    const longitude = cartographic.longitude;
    const latitude = cartographic.latitude;
    return {
      x: earthRadius * longitude,
      y: earthRadius * Math.log(Math.tan(Math.PI / 4 + latitude / 2))
    };
  });

  let area = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[(index + 1) % projected.length];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area / 2);
}

export function formatDistance(meters: number): string {
  return Math.abs(meters) >= 1000
    ? `${(meters / 1000).toFixed(2)} km`
    : `${meters.toFixed(2)} m`;
}

export function formatArea(squareMeters: number): string {
  return squareMeters >= 1_000_000
    ? `${(squareMeters / 1_000_000).toFixed(2)} km2`
    : `${squareMeters.toFixed(2)} m2`;
}

export function toDegrees(position: Cartesian3): [number, number, number] {
  const cartographic = Cartographic.fromCartesian(position);
  return [
    CesiumMath.toDegrees(cartographic.longitude),
    CesiumMath.toDegrees(cartographic.latitude),
    cartographic.height
  ];
}
