import { Cartographic, Math as CesiumMath } from "cesium";
import { describe, expect, it } from "vitest";
import { cameraViewFromCartographic, cameraViewToCartesian, cloneCameraView } from "./camera";

describe("scene camera helpers", () => {
  it("converts cartographic camera data into a serializable camera view", () => {
    const view = cameraViewFromCartographic(
      Cartographic.fromDegrees(114.2, 22.3, 1500),
      0.1,
      -0.8,
      0
    );

    expect(view).toEqual({
      longitude: 114.2,
      latitude: 22.3,
      height: 1500,
      heading: 0.1,
      pitch: -0.8,
      roll: 0
    });
  });

  it("converts camera view back to Cartesian position", () => {
    const cartesian = cameraViewToCartesian({
      longitude: 114.2,
      latitude: 22.3,
      height: 1500,
      heading: 0.1,
      pitch: -0.8,
      roll: 0
    });
    const cartographic = Cartographic.fromCartesian(cartesian);

    expect(CesiumMath.toDegrees(cartographic.longitude)).toBeCloseTo(114.2);
    expect(CesiumMath.toDegrees(cartographic.latitude)).toBeCloseTo(22.3);
    expect(cartographic.height).toBeCloseTo(1500);
  });

  it("clones camera views", () => {
    const view = {
      longitude: 1,
      latitude: 2,
      height: 3,
      heading: 4,
      pitch: 5,
      roll: 6
    };

    expect(cloneCameraView(view)).toEqual(view);
    expect(cloneCameraView(view)).not.toBe(view);
  });
});
