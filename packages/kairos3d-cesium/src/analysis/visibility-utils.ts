import { Cartesian3, Cartographic } from "cesium";
import { normalizeSampleCount } from "./profile-utils";

export interface VisibilitySample {
  cartographic: Cartographic;
  distance: number;
  lineHeight: number;
}

export interface VisibilityClassification {
  visible: boolean;
  blockedPosition?: Cartesian3;
}

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
