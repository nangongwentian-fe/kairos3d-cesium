import { Cartesian3, Cartographic, Ray, type Scene } from "cesium";
import { normalizeSampleCount } from "./profile-utils";

export interface VisibilitySample {
  cartographic: Cartographic;
  distance: number;
  lineHeight: number;
}

export interface VisibilityClassification {
  visible: boolean;
  blockedPosition?: Cartesian3;
  blockedBy?: "terrain" | "scene";
  blockedObject?: unknown;
}

interface SceneRayPickResult {
  object?: unknown;
  primitive?: unknown;
  position?: Cartesian3;
}

type PickFromRay = (
  ray: Ray,
  objectsToExclude?: unknown[],
  width?: number
) => SceneRayPickResult | undefined;

export function interpolateVisibilitySamples(
  start: Cartesian3,
  end: Cartesian3,
  sampleCount = 64
): VisibilitySample[] {
  const totalDistance = Cartesian3.distance(start, end);
  if (totalDistance <= 0) {
    throw new Error("Visibility analysis requires two distinct positions.");
  }

  const count = normalizeSampleCount(sampleCount, 64);
  const samples: VisibilitySample[] = [];
  for (let index = 0; index < count; index += 1) {
    const ratio = index === count - 1 ? 1 : index / (count - 1);
    const position = Cartesian3.lerp(start, end, ratio, new Cartesian3());
    const cartographic = Cartographic.fromCartesian(position);
    samples.push({
      cartographic,
      distance: totalDistance * ratio,
      lineHeight: cartographic.height
    });
  }

  return samples;
}

export function classifyVisibility(
  samples: VisibilitySample[],
  groundCartographics: Cartographic[],
  heightTolerance = 0.5
): VisibilityClassification {
  for (let index = 1; index < samples.length - 1; index += 1) {
    const sample = samples[index];
    const ground = groundCartographics[index];
    const groundHeight = Number.isFinite(ground?.height) ? ground.height : 0;

    if (groundHeight - sample.lineHeight > heightTolerance) {
      return {
        visible: false,
        blockedBy: "terrain",
        blockedPosition: Cartesian3.fromRadians(
          sample.cartographic.longitude,
          sample.cartographic.latitude,
          groundHeight
        )
      };
    }
  }

  return { visible: true };
}

export function classifySceneVisibility(
  scene: Scene,
  start: Cartesian3,
  end: Cartesian3,
  objectsToExclude: unknown[] = [],
  width = 0.1
): VisibilityClassification {
  const totalDistance = Cartesian3.distance(start, end);
  if (totalDistance <= 0) {
    throw new Error("Visibility analysis requires two distinct positions.");
  }

  const direction = Cartesian3.normalize(
    Cartesian3.subtract(end, start, new Cartesian3()),
    new Cartesian3()
  );
  const ray = new Ray(start, direction);
  const pickFromRay = (scene as Scene & { pickFromRay?: PickFromRay }).pickFromRay;
  const picked = pickFromRay?.call(scene, ray, objectsToExclude, width);
  if (!picked) {
    return { visible: true };
  }

  const blockedPosition = picked.position
    ? Cartesian3.clone(picked.position)
    : Ray.getPoint(ray, totalDistance / 2, new Cartesian3());
  const blockedDistance = Cartesian3.distance(start, blockedPosition);
  if (blockedDistance >= totalDistance - 0.5) {
    return { visible: true };
  }

  return {
    visible: false,
    blockedBy: "scene",
    blockedPosition,
    blockedObject: picked.object ?? picked.primitive
  };
}

export function chooseNearestVisibilityBlock(
  start: Cartesian3,
  terrain: VisibilityClassification,
  scene: VisibilityClassification
): VisibilityClassification {
  if (terrain.visible) {
    return scene;
  }
  if (scene.visible) {
    return terrain;
  }
  if (!terrain.blockedPosition || !scene.blockedPosition) {
    return terrain;
  }

  return Cartesian3.distance(start, scene.blockedPosition) <
    Cartesian3.distance(start, terrain.blockedPosition)
    ? scene
    : terrain;
}
