import {
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  HeadingPitchRoll,
  Rectangle,
  Transforms
} from "cesium";
import type { KairosMap } from "../core/map";
import {
  applyHeightOptionsToEntity,
  lineStyleWithHeight,
  serializeHeightOptions
} from "../height";
import type { HeightOptions } from "../height";
import {
  createBillboardGraphics,
  createLabelGraphics,
  createLineGraphics,
  createModelGraphics,
  createPointGraphics,
  createPolygonGraphics,
  parseColorLike
} from "../style";
import type { ResultSymbolStyle } from "../style";
import type { OverlayData, OverlayType } from "./types";

export interface OverlayRenderOptions {
  id: string;
  type: OverlayType;
  positions: Cartesian3[];
  data?: OverlayData;
  style?: ResultSymbolStyle;
  height?: HeightOptions;
  show?: boolean;
}

export function renderOverlayEntity(
  map: KairosMap,
  options: OverlayRenderOptions
): Entity {
  validateOverlayShape(options.id, options.type, options.positions, options.data);

  const entity = map.viewer.entities.add(createEntityOptions(options));
  applyHeightOptionsToEntity(entity, options.height);
  return entity;
}

export function validateOverlayShape(
  id: string,
  type: OverlayType,
  positions: Cartesian3[],
  data?: OverlayData
): void {
  if (!Array.isArray(positions)) {
    throw new Error(`Overlay "${id}" positions must be an array.`);
  }

  const min = minOverlayPositionCount(type);
  if (positions.length < min) {
    throw new Error(`Overlay "${id}" requires at least ${min} positions.`);
  }

  for (const [index, position] of positions.entries()) {
    if (
      !(position instanceof Cartesian3) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new Error(`Overlay "${id}" position ${index} must be a finite Cartesian3.`);
    }
  }

  if (type === "circle") {
    assertPositiveFinite(data?.radius, `Overlay "${id}" radius`);
  }
  if (type === "billboard" && !data?.image) {
    throw new Error(`Overlay "${id}" billboard image is required.`);
  }
  if (type === "label" && data?.text === undefined) {
    throw new Error(`Overlay "${id}" label text is required.`);
  }
  if (type === "model" && !data?.uri) {
    throw new Error(`Overlay "${id}" model uri is required.`);
  }
}

export function minOverlayPositionCount(type: OverlayType): number {
  if (type === "polygon") {
    return 3;
  }

  if (type === "polyline" || type === "rectangle") {
    return 2;
  }

  return 1;
}

export function cloneOverlayData(data?: OverlayData): OverlayData | undefined {
  if (!data) {
    return undefined;
  }

  return { ...data };
}

export function serializeOverlayData(data?: OverlayData): OverlayData | undefined {
  const cloned = cloneOverlayData(data);
  if (!cloned) {
    return undefined;
  }

  return Object.keys(cloned).length ? cloned : undefined;
}

export function normalizeOverlayHeight(
  height?: HeightOptions
): HeightOptions | undefined {
  return serializeHeightOptions(height);
}

function createEntityOptions(options: OverlayRenderOptions) {
  const { id, type, positions, data, style = {}, height, show = true } = options;

  if (type === "point") {
    return {
      id,
      show,
      position: new ConstantPositionProperty(positions[0]),
      point: createPointGraphics(style.point)
    };
  }

  if (type === "polyline") {
    return {
      id,
      show,
      polyline: createLineGraphics(
        new ConstantProperty(positions),
        lineStyleWithHeight(style.line, height)
      )
    };
  }

  if (type === "polygon") {
    return {
      id,
      show,
      polygon: createPolygonGraphics(new ConstantProperty(positions), style.polygon)
    };
  }

  if (type === "circle") {
    const radius = data?.radius ?? 0;
    return {
      id,
      show,
      position: new ConstantPositionProperty(positions[0]),
      ellipse: createAreaGraphics(style, {
        semiMajorAxis: radius,
        semiMinorAxis: radius
      })
    };
  }

  if (type === "rectangle") {
    return {
      id,
      show,
      rectangle: {
        ...createAreaGraphics(style),
        coordinates: Rectangle.fromCartesianArray(positions)
      }
    };
  }

  if (type === "billboard") {
    return {
      id,
      show,
      position: new ConstantPositionProperty(positions[0]),
      billboard: createBillboardGraphics(data?.image ?? "", {
        ...style.billboard,
        scale: data?.scale ?? style.billboard?.scale
      })
    };
  }

  if (type === "label") {
    return {
      id,
      show,
      position: new ConstantPositionProperty(positions[0]),
      label: createLabelGraphics(data?.text ?? "", style.label)
    };
  }

  return {
    id,
    show,
    position: new ConstantPositionProperty(positions[0]),
    orientation: createModelOrientation(positions[0], data),
    model: createModelGraphics(data?.uri ?? "", {
      ...style.model,
      scale: data?.scale ?? style.model?.scale,
      minimumPixelSize: data?.minimumPixelSize ?? style.model?.minimumPixelSize,
      maximumScale: data?.maximumScale ?? style.model?.maximumScale
    })
  };
}

function createModelOrientation(position: Cartesian3, data?: OverlayData) {
  if (
    data?.heading === undefined &&
    data?.pitch === undefined &&
    data?.roll === undefined
  ) {
    return undefined;
  }

  return Transforms.headingPitchRollQuaternion(
    position,
    new HeadingPitchRoll(data.heading ?? 0, data.pitch ?? 0, data.roll ?? 0)
  );
}

function createAreaGraphics(
  style: ResultSymbolStyle,
  dimensions: Partial<{ semiMajorAxis: number; semiMinorAxis: number }> = {}
) {
  const polygon = style.polygon ?? {};
  const line = style.line ?? {};
  return {
    ...dimensions,
    material: parseColorLike(
      polygon.fillColor ?? Color.CYAN.withAlpha(0.22),
      "polygon.fillColor"
    ),
    outline: true,
    outlineColor: parseColorLike(
      polygon.outlineColor ?? line.color ?? Color.CYAN,
      "polygon.outlineColor"
    ),
    outlineWidth: polygon.outlineWidth ?? line.width
  };
}

function assertPositiveFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}
