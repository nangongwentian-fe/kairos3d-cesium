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
  computePlotGeometry,
  isPlotType,
  minPlotPositionCount
} from "../plotting";
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

  if (isPlotType(type)) {
    validatePlotShape(id, type, positions, data);
    return;
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
  if (type === "ellipse") {
    assertPositiveFinite(data?.semiMajorAxis, `Overlay "${id}" semiMajorAxis`);
    assertPositiveFinite(data?.semiMinorAxis, `Overlay "${id}" semiMinorAxis`);
  }
  if (type === "corridor") {
    assertPositiveFinite(data?.width, `Overlay "${id}" width`);
  }
  if (type === "wall") {
    assertHeightArray(data?.minimumHeights, positions.length, `Overlay "${id}" minimumHeights`);
    assertHeightArray(data?.maximumHeights, positions.length, `Overlay "${id}" maximumHeights`);
  }
  if (type === "box") {
    assertPositiveDimensions(data?.dimensions, `Overlay "${id}" dimensions`);
  }
  if (type === "cylinder") {
    assertPositiveFinite(data?.length, `Overlay "${id}" length`);
    assertNonNegativeFinite(data?.topRadius, `Overlay "${id}" topRadius`);
    assertNonNegativeFinite(data?.bottomRadius, `Overlay "${id}" bottomRadius`);
    if ((data?.topRadius ?? 0) === 0 && (data?.bottomRadius ?? 0) === 0) {
      throw new Error(`Overlay "${id}" cylinder requires at least one positive radius.`);
    }
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
  if (isPlotType(type)) {
    return minPlotPositionCount(type);
  }

  if (type === "polygon") {
    return 3;
  }

  if (
    type === "polyline" ||
    type === "rectangle" ||
    type === "wall" ||
    type === "corridor"
  ) {
    return 2;
  }

  return 1;
}

export function cloneOverlayData(data?: OverlayData): OverlayData | undefined {
  if (!data) {
    return undefined;
  }

  const cloned = { ...data };
  if (data.plot) {
    cloned.plot = { ...data.plot };
  }
  return cloned;
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

  if (isPlotType(type)) {
    const geometry = computePlotGeometry(type, positions, data?.plot);
    if (geometry.kind === "polyline") {
      return {
        id,
        show,
        polyline: createLineGraphics(
          new ConstantProperty(geometry.positions),
          lineStyleWithHeight(style.line, height)
        )
      };
    }

    return {
      id,
      show,
      polygon: createPolygonGraphics(new ConstantProperty(geometry.positions), style.polygon)
    };
  }

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

  if (type === "ellipse") {
    return {
      id,
      show,
      position: new ConstantPositionProperty(positions[0]),
      ellipse: createAreaGraphics(style, {
        semiMajorAxis: data?.semiMajorAxis ?? 0,
        semiMinorAxis: data?.semiMinorAxis ?? 0
      })
    };
  }

  if (type === "wall") {
    return {
      id,
      show,
      wall: {
        positions: new ConstantProperty(positions),
        minimumHeights: data?.minimumHeights,
        maximumHeights: data?.maximumHeights,
        ...createAreaGraphics(style)
      }
    };
  }

  if (type === "corridor") {
    return {
      id,
      show,
      corridor: {
        positions: new ConstantProperty(positions),
        width: data?.width ?? 0,
        ...createAreaGraphics(style)
      }
    };
  }

  if (type === "box") {
    return {
      id,
      show,
      position: new ConstantPositionProperty(positions[0]),
      box: {
        dimensions: new Cartesian3(
          data?.dimensions?.[0] ?? 0,
          data?.dimensions?.[1] ?? 0,
          data?.dimensions?.[2] ?? 0
        ),
        ...createAreaGraphics(style)
      }
    };
  }

  if (type === "cylinder") {
    return {
      id,
      show,
      position: new ConstantPositionProperty(positions[0]),
      cylinder: {
        length: data?.length ?? 0,
        topRadius: data?.topRadius ?? 0,
        bottomRadius: data?.bottomRadius ?? 0,
        ...createAreaGraphics(style)
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

function assertNonNegativeFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
}

function assertPositiveDimensions(
  value: unknown,
  label: string
): asserts value is [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must be a [x, y, z] number tuple.`);
  }

  for (const dimension of value) {
    assertPositiveFinite(dimension, label);
  }
}

function assertHeightArray(value: unknown, length: number, label: string): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} must contain ${length} numbers.`);
  }

  for (const height of value) {
    if (typeof height !== "number" || !Number.isFinite(height)) {
      throw new Error(`${label} must contain finite numbers.`);
    }
  }
}

function validatePlotShape(
  id: string,
  type: OverlayType,
  positions: Cartesian3[],
  data?: OverlayData
): void {
  if (!isPlotType(type)) {
    return;
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

  computePlotGeometry(type, positions, data?.plot);
}
