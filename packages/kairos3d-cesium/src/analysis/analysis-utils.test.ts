import { Cartesian3, Cartographic } from "cesium";
import { describe, expect, it } from "vitest";
import {
  createProfileSamples,
  getProfileHeightRange,
  interpolateProfilePoints
} from "./profile-utils";
import {
  classifyVisibility,
  interpolateVisibilitySamples,
  type VisibilitySample
} from "./visibility-utils";

describe("profile utilities", () => {
  it("interpolates profile points with cumulative distance", () => {
    const samples = interpolateProfilePoints(
      [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      3
    );

    expect(samples).toHaveLength(3);
    expect(samples[0].distance).toBe(0);
    expect(samples[1].distance).toBeGreaterThan(0);
    expect(samples[2].distance).toBeGreaterThan(samples[1].distance);
  });

  it("builds profile samples and height range", () => {
    const interpolated = [
      { cartographic: new Cartographic(0, 0, 0), distance: 0 },
      { cartographic: new Cartographic(0.1, 0.1, 0), distance: 10 }
    ];
    const samples = createProfileSamples(interpolated, [
      new Cartographic(0, 0, 5),
      new Cartographic(0.1, 0.1, 12)
    ]);

    expect(samples.map((sample) => sample.height)).toEqual([5, 12]);
    expect(getProfileHeightRange(samples)).toEqual({ minHeight: 5, maxHeight: 12 });
  });
});

describe("visibility utilities", () => {
  it("interpolates visibility samples from two positions", () => {
    const samples = interpolateVisibilitySamples(
      Cartesian3.fromDegrees(114, 22, 100),
      Cartesian3.fromDegrees(114.01, 22, 100),
      4
    );

    expect(samples).toHaveLength(4);
    expect(samples[0].distance).toBe(0);
    expect(samples[3].distance).toBeGreaterThan(samples[1].distance);
  });

  it("detects the first ground sample above the sight line", () => {
    const samples: VisibilitySample[] = [
      { cartographic: new Cartographic(0, 0, 0), distance: 0, lineHeight: 10 },
      { cartographic: new Cartographic(0.1, 0.1, 0), distance: 10, lineHeight: 5 },
      { cartographic: new Cartographic(0.2, 0.2, 0), distance: 20, lineHeight: 10 }
    ];
    const result = classifyVisibility(samples, [
      new Cartographic(0, 0, 0),
      new Cartographic(0.1, 0.1, 8),
      new Cartographic(0.2, 0.2, 0)
    ]);

    expect(result.visible).toBe(false);
    expect(result.blockedPosition).toBeInstanceOf(Cartesian3);
  });
});
