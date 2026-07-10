import {
  Cartesian2,
  CheckerboardMaterialProperty,
  Color,
  ColorMaterialProperty,
  GridMaterialProperty,
  ImageMaterialProperty,
  Material,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
  StripeMaterialProperty,
  StripeOrientation
} from "cesium";
import {
  flowMaterialSource,
  radarScanMaterialSource,
  radialWaveMaterialSource
} from "./shaders";
import type {
  CheckerboardMaterialDescriptor,
  ColorMaterialDescriptor,
  FlowMaterialDescriptor,
  GridMaterialDescriptor,
  ImageMaterialDescriptor,
  MaterialDefinition,
  MaterialColor,
  PolylineDashMaterialDescriptor,
  PolylineGlowMaterialDescriptor,
  RadarScanMaterialDescriptor,
  RadialWaveMaterialDescriptor,
  StripeMaterialDescriptor,
  WaterMaterialDescriptor
} from "./types";

export const builtInMaterialDefinitions: readonly MaterialDefinition[] = [
  {
    type: "color",
    targets: ["entity", "primitive"],
    createProperty: (value) => {
      const descriptor = value as ColorMaterialDescriptor;
      return new ColorMaterialProperty(color(descriptor.color, Color.WHITE, "color.color"));
    },
    createMaterial: (value) => {
      const descriptor = value as ColorMaterialDescriptor;
      return Material.fromType(Material.ColorType, {
        color: color(descriptor.color, Color.WHITE, "color.color")
      });
    }
  },
  {
    type: "image",
    targets: ["entity", "primitive"],
    validate: (value) => {
      const descriptor = value as ImageMaterialDescriptor;
      assertNonEmptyString(descriptor.image, "image.image");
      assertRepeat(descriptor.repeat, "image.repeat");
    },
    createProperty: (value) => {
      const descriptor = value as ImageMaterialDescriptor;
      return new ImageMaterialProperty({
        image: descriptor.image,
        repeat: pair(descriptor.repeat, [1, 1]),
        color: color(descriptor.color, Color.WHITE, "image.color"),
        transparent: descriptor.transparent ?? false
      });
    },
    createMaterial: (value) => {
      const descriptor = value as ImageMaterialDescriptor;
      return Material.fromTypeAsync(Material.ImageType, {
        image: descriptor.image,
        repeat: pair(descriptor.repeat, [1, 1]),
        color: color(descriptor.color, Color.WHITE, "image.color")
      }).then((material) => {
        if (descriptor.transparent !== undefined) {
          material.translucent = descriptor.transparent;
        }
        return material;
      });
    }
  },
  {
    type: "grid",
    targets: ["entity"],
    validate: (value) => validateGrid(value as GridMaterialDescriptor),
    createProperty: (value) => {
      const descriptor = value as GridMaterialDescriptor;
      return new GridMaterialProperty({
        color: color(descriptor.color, Color.WHITE, "grid.color"),
        cellAlpha: descriptor.cellAlpha ?? 0.1,
        lineCount: pair(descriptor.lineCount, [8, 8]),
        lineThickness: pair(descriptor.lineThickness, [1, 1]),
        lineOffset: pair(descriptor.lineOffset, [0, 0])
      });
    }
  },
  {
    type: "stripe",
    targets: ["entity"],
    validate: (value) => validateStripe(value as StripeMaterialDescriptor),
    createProperty: (value) => {
      const descriptor = value as StripeMaterialDescriptor;
      return new StripeMaterialProperty({
        orientation:
          descriptor.orientation === "vertical"
            ? StripeOrientation.VERTICAL
            : StripeOrientation.HORIZONTAL,
        evenColor: color(descriptor.evenColor, Color.WHITE, "stripe.evenColor"),
        oddColor: color(descriptor.oddColor, Color.BLACK, "stripe.oddColor"),
        offset: descriptor.offset ?? 0,
        repeat: descriptor.repeat ?? 1
      });
    }
  },
  {
    type: "checkerboard",
    targets: ["entity"],
    validate: (value) => {
      assertRepeat((value as CheckerboardMaterialDescriptor).repeat, "checkerboard.repeat");
    },
    createProperty: (value) => {
      const descriptor = value as CheckerboardMaterialDescriptor;
      return new CheckerboardMaterialProperty({
        evenColor: color(
          descriptor.evenColor,
          Color.WHITE,
          "checkerboard.evenColor"
        ),
        oddColor: color(descriptor.oddColor, Color.BLACK, "checkerboard.oddColor"),
        repeat: pair(descriptor.repeat, [2, 2])
      });
    }
  },
  {
    type: "polyline-dash",
    targets: ["entity"],
    validate: (value) => validatePolylineDash(value as PolylineDashMaterialDescriptor),
    createProperty: (value) => {
      const descriptor = value as PolylineDashMaterialDescriptor;
      return new PolylineDashMaterialProperty({
        color: color(descriptor.color, Color.WHITE, "polyline-dash.color"),
        gapColor: color(
          descriptor.gapColor,
          Color.TRANSPARENT,
          "polyline-dash.gapColor"
        ),
        dashLength: descriptor.dashLength ?? 16,
        dashPattern: descriptor.dashPattern ?? 255
      });
    }
  },
  {
    type: "polyline-glow",
    targets: ["entity"],
    validate: (value) => validatePolylineGlow(value as PolylineGlowMaterialDescriptor),
    createProperty: (value) => {
      const descriptor = value as PolylineGlowMaterialDescriptor;
      return new PolylineGlowMaterialProperty({
        color: color(descriptor.color, Color.WHITE, "polyline-glow.color"),
        glowPower: descriptor.glowPower ?? 0.25,
        taperPower: descriptor.taperPower ?? 1
      });
    }
  },
  {
    type: "water",
    targets: ["primitive"],
    validate: (value) => validateWater(value as WaterMaterialDescriptor),
    createMaterial: (value) => {
      const descriptor = value as WaterMaterialDescriptor;
      return Material.fromTypeAsync(Material.WaterType, {
        normalMap: descriptor.normalMap,
        baseWaterColor: color(
          descriptor.baseWaterColor,
          new Color(0.2, 0.3, 0.6, 1),
          "water.baseWaterColor"
        ),
        blendColor: color(
          descriptor.blendColor,
          new Color(0, 1, 0.7, 1),
          "water.blendColor"
        ),
        frequency: descriptor.frequency ?? 1_000,
        animationSpeed: descriptor.animationSpeed ?? 0.01,
        amplitude: descriptor.amplitude ?? 10,
        specularIntensity: descriptor.specularIntensity ?? 0.5
      });
    }
  },
  {
    type: "flow",
    targets: ["primitive"],
    validate: (value) => validateFlow(value as FlowMaterialDescriptor),
    createMaterial: (value) => {
      const descriptor = value as FlowMaterialDescriptor;
      return dynamicMaterial(flowMaterialSource, {
        color: color(descriptor.color, Color.CYAN, "flow.color"),
        speed: descriptor.speed ?? 1,
        repeat: descriptor.repeat ?? 1,
        time: descriptor.phase ?? 0
      });
    }
  },
  {
    type: "radial-wave",
    targets: ["primitive"],
    validate: (value) => validateRadialWave(value as RadialWaveMaterialDescriptor),
    createMaterial: (value) => {
      const descriptor = value as RadialWaveMaterialDescriptor;
      return dynamicMaterial(radialWaveMaterialSource, {
        color: color(descriptor.color, Color.CYAN, "radial-wave.color"),
        speed: descriptor.speed ?? 1,
        rings: descriptor.rings ?? 3,
        time: descriptor.phase ?? 0
      });
    }
  },
  {
    type: "radar-scan",
    targets: ["primitive"],
    validate: (value) => validateRadarScan(value as RadarScanMaterialDescriptor),
    createMaterial: (value) => {
      const descriptor = value as RadarScanMaterialDescriptor;
      return dynamicMaterial(radarScanMaterialSource, {
        color: color(descriptor.color, Color.LIME, "radar-scan.color"),
        speed: descriptor.speed ?? 1,
        sectorSize: descriptor.sectorSize ?? 0.2,
        time: descriptor.phase ?? 0
      });
    }
  }
];

function dynamicMaterial(source: string, uniforms: Record<string, unknown>): Material {
  return new Material({
    translucent: true,
    fabric: {
      source,
      uniforms
    }
  });
}

function color(
  value: ColorMaterialDescriptor["color"],
  fallback: Color,
  label: string
): Color {
  if (value === undefined) {
    return Color.clone(fallback);
  }
  if (typeof value === "string") {
    const parsed = Color.fromCssColorString(value);
    if (!parsed) {
      throw new Error(`${label} must be a valid CSS color string.`);
    }
    return parsed;
  }
  assertColorComponents(value, label);
  return new Color(value.red, value.green, value.blue, value.alpha);
}

function pair(value: [number, number] | undefined, fallback: [number, number]): Cartesian2 {
  const resolved = value ?? fallback;
  return new Cartesian2(resolved[0], resolved[1]);
}

function validateGrid(descriptor: GridMaterialDescriptor): void {
  assertRange(descriptor.cellAlpha, 0, 1, "grid.cellAlpha");
  assertRepeat(descriptor.lineCount, "grid.lineCount");
  assertPair(descriptor.lineThickness, "grid.lineThickness", 0, false);
  assertPair(descriptor.lineOffset, "grid.lineOffset", 0, true);
}

function validateStripe(descriptor: StripeMaterialDescriptor): void {
  if (
    descriptor.orientation !== undefined &&
    descriptor.orientation !== "horizontal" &&
    descriptor.orientation !== "vertical"
  ) {
    throw new Error("stripe.orientation must be horizontal or vertical.");
  }
  assertFinite(descriptor.offset, "stripe.offset");
  assertPositive(descriptor.repeat, "stripe.repeat");
}

function validatePolylineDash(descriptor: PolylineDashMaterialDescriptor): void {
  assertPositive(descriptor.dashLength, "polyline-dash.dashLength");
  assertIntegerRange(descriptor.dashPattern, 0, 65_535, "polyline-dash.dashPattern");
}

function validatePolylineGlow(descriptor: PolylineGlowMaterialDescriptor): void {
  assertRange(descriptor.glowPower, 0, 1, "polyline-glow.glowPower");
  assertPositiveOrZero(descriptor.taperPower, "polyline-glow.taperPower");
}

function validateWater(descriptor: WaterMaterialDescriptor): void {
  assertNonEmptyString(descriptor.normalMap, "water.normalMap");
  assertPositive(descriptor.frequency, "water.frequency");
  assertPositiveOrZero(descriptor.animationSpeed, "water.animationSpeed");
  assertPositiveOrZero(descriptor.amplitude, "water.amplitude");
  assertPositiveOrZero(descriptor.specularIntensity, "water.specularIntensity");
}

function validateFlow(descriptor: FlowMaterialDescriptor): void {
  assertPositiveOrZero(descriptor.speed, "flow.speed");
  assertPositive(descriptor.repeat, "flow.repeat");
  assertFinite(descriptor.phase, "flow.phase");
}

function validateRadialWave(descriptor: RadialWaveMaterialDescriptor): void {
  assertPositiveOrZero(descriptor.speed, "radial-wave.speed");
  assertPositive(descriptor.rings, "radial-wave.rings");
  assertFinite(descriptor.phase, "radial-wave.phase");
}

function validateRadarScan(descriptor: RadarScanMaterialDescriptor): void {
  assertPositiveOrZero(descriptor.speed, "radar-scan.speed");
  assertRange(descriptor.sectorSize, Number.EPSILON, 1, "radar-scan.sectorSize");
  assertFinite(descriptor.phase, "radar-scan.phase");
}

function assertRepeat(value: [number, number] | undefined, label: string): void {
  assertPair(value, label, 0, false);
}

function assertPair(
  value: [number, number] | undefined,
  label: string,
  minimum: number,
  inclusive: boolean
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${label} must contain two numbers.`);
  }
  value.forEach((entry, index) => {
    const valid =
      Number.isFinite(entry) && (inclusive ? entry >= minimum : entry > minimum);
    if (!valid) {
      throw new Error(`${label}[${index}] must be a finite number ${inclusive ? ">=" : ">"} ${minimum}.`);
    }
  });
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertFinite(value: number | undefined, label: string): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
}

function assertPositive(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new Error(`${label} must be greater than 0.`);
  }
}

function assertPositiveOrZero(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} must be greater than or equal to 0.`);
  }
}

function assertRange(
  value: number | undefined,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < minimum || value > maximum)
  ) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

function assertIntegerRange(
  value: number | undefined,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || value < minimum || value > maximum)
  ) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function assertColorComponents(value: MaterialColor, label: string): void {
  if (typeof value === "string") {
    return;
  }
  for (const key of ["red", "green", "blue", "alpha"] as const) {
    const channel = value[key];
    if (!Number.isFinite(channel) || channel < 0 || channel > 1) {
      throw new Error(`${label}.${key} must be a finite number between 0 and 1.`);
    }
  }
}
