import {
  Cartesian3,
  Cartographic,
  sampleTerrainMostDetailed,
  type TerrainProvider
} from "cesium";
import type { KairosMap } from "../core/map";
import type { HeightOptions, HeightSample } from "./types";
import {
  cartographicFromCartesian,
  cartesianWithHeight,
  cloneCartesianPositions,
  resolveHeightOptions
} from "./utils";

export class HeightManager {
  constructor(private readonly map: KairosMap) {}

  async sampleTerrain(positions: Cartesian3[]): Promise<HeightSample[]> {
    return sampleTerrainPositions(this.map.viewer.terrainProvider, positions);
  }

  async clampPositions(
    positions: Cartesian3[],
    options: HeightOptions = { mode: "clampToGround", sampleTerrain: true }
  ): Promise<Cartesian3[]> {
    return this.resolvePositions(positions, {
      mode: "clampToGround",
      sampleTerrain: true,
      ...options
    });
  }

  async resolvePositions(
    positions: Cartesian3[],
    options?: HeightOptions
  ): Promise<Cartesian3[]> {
    const resolved = resolveHeightOptions(options);
    if (resolved.mode === "absolute") {
      return cloneCartesianPositions(positions);
    }

    if (resolved.sampleTerrain) {
      const samples = await this.sampleTerrain(positions);
      if (resolved.mode === "clampToGround") {
        return samples.map((sample) => Cartesian3.clone(sample.position));
      }

      return samples.map((sample) =>
        sample.sampled
          ? cartesianWithHeight(sample.position, sample.height + resolved.offset)
          : Cartesian3.clone(sample.original)
      );
    }

    if (resolved.mode === "clampToGround") {
      return cloneCartesianPositions(positions);
    }

    return positions.map((position) => cartesianWithHeight(position, resolved.offset));
  }

  async measureSurfaceDistance(
    positions: Cartesian3[],
    options: HeightOptions = { mode: "clampToGround", sampleTerrain: true }
  ): Promise<number> {
    const sampled = await this.resolvePositions(positions, {
      mode: "clampToGround",
      sampleTerrain: true,
      ...options
    });
    return sampled.slice(1).reduce((sum, position, index) => {
      return sum + Cartesian3.distance(sampled[index], position);
    }, 0);
  }
}

export async function sampleTerrainPositions(
  terrainProvider: TerrainProvider,
  positions: Cartesian3[]
): Promise<HeightSample[]> {
  const cartographics = positions.map(cartographicFromCartesian);

  if (!terrainProvider.availability) {
    return positions.map((position, index) => {
      const cartographic = cartographics[index];
      return {
        original: Cartesian3.clone(position),
        position: Cartesian3.clone(position),
        height: normalizedHeight(cartographic.height),
        sampled: false
      };
    });
  }

  const requested = cartographics.map(
    (cartographic) =>
      new Cartographic(cartographic.longitude, cartographic.latitude, cartographic.height)
  );
  const sampled = await sampleTerrainMostDetailed(terrainProvider, requested, false);
  return sampled.map((cartographic, index) => {
    const height = normalizedHeight(cartographic.height);
    return {
      original: Cartesian3.clone(positions[index]),
      position: Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, height),
      height,
      sampled: true
    };
  });
}

function normalizedHeight(height: number): number {
  return Number.isFinite(height) ? height : 0;
}
