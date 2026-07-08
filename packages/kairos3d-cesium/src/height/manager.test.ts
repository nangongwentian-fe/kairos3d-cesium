import {
  Cartesian3,
  Cartographic,
  ConstantProperty,
  Entity,
  HeightReference
} from "cesium";
import { describe, expect, it } from "vitest";
import type { KairosMap } from "../core";
import {
  HeightManager,
  applyHeightOptionsToEntity,
  lineStyleWithHeight,
  resolveHeightOptions,
  sampleTerrainPositions,
  serializeHeightOptions
} from "./index";

function createMapMock() {
  return {
    viewer: {
      terrainProvider: {
        availability: undefined
      }
    }
  } as unknown as KairosMap;
}

describe("height utilities", () => {
  it("resolves defaults and serializes only non-default height options", () => {
    expect(resolveHeightOptions()).toEqual({
      mode: "absolute",
      offset: 0,
      sampleTerrain: false
    });
    expect(serializeHeightOptions({ mode: "absolute" })).toBeUndefined();
    expect(serializeHeightOptions({ mode: "clampToGround" })).toEqual({
      mode: "clampToGround"
    });
    expect(
      serializeHeightOptions({
        mode: "relativeToGround",
        offset: 10,
        sampleTerrain: true
      })
    ).toEqual({
      mode: "relativeToGround",
      offset: 10,
      sampleTerrain: true
    });
  });

  it("rejects invalid offsets", () => {
    expect(() => resolveHeightOptions({ mode: "relativeToGround", offset: Number.NaN })).toThrow(
      "HeightOptions.offset"
    );
  });

  it("applies height mode to entity graphics", () => {
    const entity = new Entity({
      point: {},
      polyline: { positions: [] },
      polygon: { hierarchy: [] }
    });

    applyHeightOptionsToEntity(entity, { mode: "relativeToGround", offset: 12 });

    expect(entity.point?.heightReference).toBeInstanceOf(ConstantProperty);
    expect(entity.point?.heightReference?.getValue()).toBe(HeightReference.RELATIVE_TO_GROUND);
    expect(entity.polyline?.clampToGround?.getValue()).toBe(false);
    expect(entity.polygon?.height?.getValue()).toBe(12);
  });

  it("lets height options override line clamp rendering", () => {
    expect(lineStyleWithHeight({ clampToGround: false }, { mode: "clampToGround" })).toEqual({
      clampToGround: true
    });
    expect(lineStyleWithHeight({ clampToGround: true }, { mode: "absolute" })).toEqual({
      clampToGround: false
    });
  });
});

describe("HeightManager", () => {
  it("returns original positions when terrain availability is missing", async () => {
    const positions = [
      Cartesian3.fromDegrees(114, 22, 10),
      Cartesian3.fromDegrees(114.01, 22.01, 20)
    ];

    const samples = await sampleTerrainPositions(
      createMapMock().viewer.terrainProvider,
      positions
    );

    expect(samples).toHaveLength(2);
    expect(samples[0].sampled).toBe(false);
    expect(samples[0].height).toBeCloseTo(10, 1);
    expect(samples[0].position).toEqual(positions[0]);
  });

  it("clamps positions without inventing terrain heights", async () => {
    const manager = new HeightManager(createMapMock());
    const positions = [Cartesian3.fromDegrees(114, 22, 10)];
    const clamped = await manager.clampPositions(positions);

    expect(clamped).toHaveLength(1);
    expect(clamped[0]).toEqual(positions[0]);
    expect(clamped[0]).not.toBe(positions[0]);
  });

  it("measures surface distance through resolved positions", async () => {
    const manager = new HeightManager(createMapMock());
    const positions = [
      Cartesian3.fromDegrees(114, 22, 10),
      Cartesian3.fromDegrees(114.01, 22, 20)
    ];

    const distance = await manager.measureSurfaceDistance(positions);

    expect(distance).toBeCloseTo(Cartesian3.distance(positions[0], positions[1]), 6);
  });

  it("resolves relative-to-ground positions as offsets when no terrain sample is requested", async () => {
    const manager = new HeightManager(createMapMock());
    const resolved = await manager.resolvePositions(
      [Cartesian3.fromDegrees(114, 22, 100)],
      { mode: "relativeToGround", offset: 15 }
    );

    const cartographic = Cartographic.fromCartesian(resolved[0]);
    expect(cartographic.height).toBeCloseTo(15, 1);
  });

  it("keeps relative-to-ground positions unchanged when terrain sampling is unavailable", async () => {
    const manager = new HeightManager(createMapMock());
    const positions = [Cartesian3.fromDegrees(114, 22, 100)];
    const resolved = await manager.resolvePositions(positions, {
      mode: "relativeToGround",
      offset: 15,
      sampleTerrain: true
    });

    expect(resolved[0]).toEqual(positions[0]);
    expect(resolved[0]).not.toBe(positions[0]);
  });
});
