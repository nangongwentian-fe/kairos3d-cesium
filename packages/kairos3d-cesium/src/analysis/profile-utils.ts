import {
  Cartesian3,
  Cartographic,
  sampleTerrainMostDetailed,
  type TerrainProvider
} from "cesium";
import type { ProfileSample } from "./types";

export interface InterpolatedProfilePoint {
  cartographic: Cartographic;
  distance: number;
}

export function interpolateProfilePoints(
  positions: Cartesian3[],
  sampleCount = 128
): InterpolatedProfilePoint[] {
  if (positions.length < 2) {
    throw new Error("Profile analysis requires at least two positions.");
  }

  const count = normalizeSampleCount(sampleCount, 128);
  const segments = createSegments(positions);
  const totalDistance = segments.reduce((sum, segment) => sum + segment.length, 0);

  if (totalDistance <= 0) {
    throw new Error("Profile positions must span a non-zero distance.");
  }

  const samples: InterpolatedProfilePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const distance = index === count - 1
      ? totalDistance
      : (totalDistance * index) / (count - 1);
    const segment = findSegment(segments, distance);
    const localDistance = distance - segment.startDistance;
    const ratio = segment.length === 0 ? 0 : localDistance / segment.length;
    const cartographic = interpolateCartographic(
      Cartographic.fromCartesian(segment.start),
      Cartographic.fromCartesian(segment.end),
      ratio
    );

    samples.push({ cartographic, distance });
  }

  return samples;
}

export async function sampleGroundCartographics(
  terrainProvider: TerrainProvider,
  cartographics: Cartographic[]
): Promise<Cartographic[]> {
  const ground = cartographics.map(
    (cartographic) => new Cartographic(cartographic.longitude, cartographic.latitude, 0)
  );

  if (!terrainProvider.availability) {
    return ground;
  }

  try {
    const sampled = await sampleTerrainMostDetailed(terrainProvider, ground, false);
    return sampled.map(normalizeCartographicHeight);
  } catch {
    return ground;
  }
}

export function createProfileSamples(
  interpolated: InterpolatedProfilePoint[],
  sampledCartographics: Cartographic[]
): ProfileSample[] {
  return interpolated.map((sample, index) => {
    const cartographic = normalizeCartographicHeight(
      sampledCartographics[index] ?? sample.cartographic
    );
    return {
      position: Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        cartographic.height
      ),
      distance: sample.distance,
      height: cartographic.height
    };
  });
}

export function getProfileHeightRange(samples: ProfileSample[]): {
  minHeight: number;
  maxHeight: number;
} {
  if (samples.length === 0) {
    return { minHeight: 0, maxHeight: 0 };
  }

  let minHeight = samples[0].height;
  let maxHeight = samples[0].height;
  for (const sample of samples) {
    minHeight = Math.min(minHeight, sample.height);
    maxHeight = Math.max(maxHeight, sample.height);
  }

  return { minHeight, maxHeight };
}

export function normalizeSampleCount(sampleCount: number | undefined, fallback: number): number {
  if (!Number.isFinite(sampleCount)) {
    return fallback;
  }

  return Math.max(2, Math.floor(sampleCount as number));
}

function normalizeCartographicHeight(cartographic: Cartographic): Cartographic {
  const height = Number.isFinite(cartographic.height) ? cartographic.height : 0;
  return new Cartographic(cartographic.longitude, cartographic.latitude, height);
}

function createSegments(positions: Cartesian3[]) {
  let startDistance = 0;
  return positions.slice(1).map((end, index) => {
    const start = positions[index];
    const length = Cartesian3.distance(start, end);
    const segment = {
      start,
      end,
      length,
      startDistance,
      endDistance: startDistance + length
    };
    startDistance += length;
    return segment;
  });
}

function findSegment(
  segments: ReturnType<typeof createSegments>,
  distance: number
): ReturnType<typeof createSegments>[number] {
  return segments.find((segment) => distance <= segment.endDistance) ?? segments[segments.length - 1];
}

function interpolateCartographic(
  start: Cartographic,
  end: Cartographic,
  ratio: number
): Cartographic {
  return new Cartographic(
    lerp(start.longitude, end.longitude, ratio),
    lerp(start.latitude, end.latitude, ratio),
    lerp(start.height, end.height, ratio)
  );
}

function lerp(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}
