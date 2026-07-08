import { Cartesian3, Cartographic, Math as CesiumMath } from "cesium";
import type { CameraView } from "./types";

export function cameraViewFromCartographic(
  cartographic: Cartographic,
  heading: number,
  pitch: number,
  roll: number
): CameraView {
  return {
    longitude: CesiumMath.toDegrees(cartographic.longitude),
    latitude: CesiumMath.toDegrees(cartographic.latitude),
    height: cartographic.height,
    heading,
    pitch,
    roll
  };
}

export function cameraViewToCartesian(view: CameraView): Cartesian3 {
  return Cartesian3.fromDegrees(view.longitude, view.latitude, view.height);
}

export function cloneCameraView(view: CameraView): CameraView {
  return { ...view };
}
