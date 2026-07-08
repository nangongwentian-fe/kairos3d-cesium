import { Cartesian3 } from "cesium";
import { describe, expect, it } from "vitest";
import {
  deserializePosition,
  deserializeVector3,
  parseSnapshotDate,
  serializePosition,
  serializeVector3
} from "./serialization";

describe("serialization helpers", () => {
  it("converts Cartesian3 positions to serializable degrees and back", () => {
    const position = Cartesian3.fromDegrees(114.1694, 22.3193, 120);
    const serialized = serializePosition(position);
    const restored = deserializePosition(serialized);

    expect(serialized.longitude).toBeCloseTo(114.1694, 6);
    expect(serialized.latitude).toBeCloseTo(22.3193, 6);
    expect(serialized.height).toBeCloseTo(120, 2);
    expect(Cartesian3.distance(position, restored)).toBeLessThan(0.001);
  });

  it("converts Cartesian3 vectors without cartographic projection", () => {
    const vector = new Cartesian3(1, 2, 3);

    expect(deserializeVector3(serializeVector3(vector))).toEqual(vector);
  });

  it("rejects invalid serializable numbers and dates", () => {
    expect(() =>
      deserializePosition({
        longitude: Number.NaN,
        latitude: 22,
        height: 0
      })
    ).toThrow("longitude");

    expect(() =>
      deserializeVector3({
        x: 1,
        y: Number.POSITIVE_INFINITY,
        z: 0
      })
    ).toThrow("Vector y");

    expect(() => parseSnapshotDate("not-a-date", "createdAt")).toThrow("createdAt");
  });
});
