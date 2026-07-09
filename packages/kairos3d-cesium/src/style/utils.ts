import {
  Cartesian2,
  type Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  HorizontalOrigin,
  LabelStyle,
  type PolygonHierarchy,
  type Property,
  VerticalOrigin,
  type Entity
} from "cesium";
import type {
  BillboardSymbolStyle,
  ColorLike,
  LabelSymbolStyle,
  LineSymbolStyle,
  ModelSymbolStyle,
  PointSymbolStyle,
  PolygonSymbolStyle,
  SerializableBillboardSymbolStyle,
  ResultSymbolStyle,
  SerializableColor,
  SerializableLabelSymbolStyle,
  SerializableLineSymbolStyle,
  SerializableModelSymbolStyle,
  SerializablePointSymbolStyle,
  SerializablePolygonSymbolStyle,
  SerializableResultSymbolStyle
} from "./types";

const styleKeys = [
  "point",
  "line",
  "polygon",
  "label",
  "billboard",
  "model",
  "visibleLine",
  "blockedLine",
  "blockedPoint"
] as const;

export function parseColorLike(value: ColorLike, label = "ColorLike"): Color {
  if (value instanceof Color) {
    return Color.clone(value);
  }

  if (typeof value === "string") {
    const parsed = Color.fromCssColorString(value);
    if (!parsed) {
      throw new Error(`${label} must be a valid CSS color string.`);
    }
    return parsed;
  }

  assertSerializableColor(value, label);
  return new Color(value.red, value.green, value.blue, value.alpha);
}

export function serializeColor(value: ColorLike): SerializableColor {
  const color = parseColorLike(value);
  return {
    red: color.red,
    green: color.green,
    blue: color.blue,
    alpha: color.alpha
  };
}

export function mergeSymbolStyles(
  ...styles: Array<ResultSymbolStyle | undefined>
): ResultSymbolStyle {
  const merged: ResultSymbolStyle = {};

  for (const style of styles) {
    if (!style) {
      continue;
    }

    for (const key of styleKeys) {
      const value = style[key];
      if (value) {
        merged[key] = { ...merged[key], ...value };
      }
    }
  }

  return merged;
}

export function cloneSymbolStyle(style?: ResultSymbolStyle): ResultSymbolStyle | undefined {
  if (!style) {
    return undefined;
  }

  return mergeSymbolStyles(style);
}

export function serializeSymbolStyle(
  style?: ResultSymbolStyle
): SerializableResultSymbolStyle | undefined {
  if (!style) {
    return undefined;
  }

  const serialized: SerializableResultSymbolStyle = {};
  if (style.point) {
    serialized.point = serializePointStyle(style.point);
  }
  if (style.line) {
    serialized.line = serializeLineStyle(style.line);
  }
  if (style.polygon) {
    serialized.polygon = serializePolygonStyle(style.polygon);
  }
  if (style.label) {
    serialized.label = serializeLabelStyle(style.label);
  }
  if (style.billboard) {
    serialized.billboard = serializeBillboardStyle(style.billboard);
  }
  if (style.model) {
    serialized.model = serializeModelStyle(style.model);
  }
  if (style.visibleLine) {
    serialized.visibleLine = serializeLineStyle(style.visibleLine);
  }
  if (style.blockedLine) {
    serialized.blockedLine = serializeLineStyle(style.blockedLine);
  }
  if (style.blockedPoint) {
    serialized.blockedPoint = serializePointStyle(style.blockedPoint);
  }

  return Object.keys(serialized).length ? serialized : undefined;
}

export function applyPointStyle(entity: Entity, style: PointSymbolStyle): void {
  if (!entity.point) {
    return;
  }

  if (style.color) {
    entity.point.color = new ConstantProperty(parseColorLike(style.color, "point.color"));
  }
  if (style.pixelSize !== undefined) {
    entity.point.pixelSize = new ConstantProperty(style.pixelSize);
  }
  if (style.outlineColor) {
    entity.point.outlineColor = new ConstantProperty(
      parseColorLike(style.outlineColor, "point.outlineColor")
    );
  }
  if (style.outlineWidth !== undefined) {
    entity.point.outlineWidth = new ConstantProperty(style.outlineWidth);
  }
}

export function applyLineStyle(entity: Entity, style: LineSymbolStyle): void {
  if (!entity.polyline) {
    return;
  }

  if (style.color) {
    entity.polyline.material = new ColorMaterialProperty(
      parseColorLike(style.color, "line.color")
    );
  }
  if (style.width !== undefined) {
    entity.polyline.width = new ConstantProperty(style.width);
  }
  if (style.clampToGround !== undefined) {
    entity.polyline.clampToGround = new ConstantProperty(style.clampToGround);
  }
}

export function applyPolygonStyle(entity: Entity, style: PolygonSymbolStyle): void {
  if (!entity.polygon) {
    return;
  }

  if (style.fillColor) {
    entity.polygon.material = new ColorMaterialProperty(
      parseColorLike(style.fillColor, "polygon.fillColor")
    );
  }
  if (style.outlineColor) {
    entity.polygon.outlineColor = new ConstantProperty(
      parseColorLike(style.outlineColor, "polygon.outlineColor")
    );
  }
  if (style.outlineWidth !== undefined) {
    entity.polygon.outlineWidth = new ConstantProperty(style.outlineWidth);
  }
}

export function applyLabelStyle(entity: Entity, style: LabelSymbolStyle): void {
  if (!entity.label) {
    return;
  }

  if (style.color) {
    entity.label.fillColor = new ConstantProperty(parseColorLike(style.color, "label.color"));
  }
  if (style.outlineColor) {
    entity.label.outlineColor = new ConstantProperty(
      parseColorLike(style.outlineColor, "label.outlineColor")
    );
  }
  if (style.font) {
    entity.label.font = new ConstantProperty(style.font);
  }
  if (style.pixelOffset) {
    entity.label.pixelOffset = new ConstantProperty(
      new Cartesian2(style.pixelOffset[0], style.pixelOffset[1])
    );
  }
}

export function applyBillboardStyle(entity: Entity, style: BillboardSymbolStyle): void {
  if (!entity.billboard) {
    return;
  }

  if (style.color) {
    entity.billboard.color = new ConstantProperty(
      parseColorLike(style.color, "billboard.color")
    );
  }
  if (style.scale !== undefined) {
    entity.billboard.scale = new ConstantProperty(style.scale);
  }
  if (style.pixelOffset) {
    entity.billboard.pixelOffset = new ConstantProperty(
      new Cartesian2(style.pixelOffset[0], style.pixelOffset[1])
    );
  }
  if (style.width !== undefined) {
    entity.billboard.width = new ConstantProperty(style.width);
  }
  if (style.height !== undefined) {
    entity.billboard.height = new ConstantProperty(style.height);
  }
  if (style.rotation !== undefined) {
    entity.billboard.rotation = new ConstantProperty(style.rotation);
  }
  if (style.sizeInMeters !== undefined) {
    entity.billboard.sizeInMeters = new ConstantProperty(style.sizeInMeters);
  }
  if (style.disableDepthTestDistance !== undefined) {
    entity.billboard.disableDepthTestDistance = new ConstantProperty(
      style.disableDepthTestDistance
    );
  }
}

export function applyModelStyle(entity: Entity, style: ModelSymbolStyle): void {
  if (!entity.model) {
    return;
  }

  if (style.color) {
    entity.model.color = new ConstantProperty(parseColorLike(style.color, "model.color"));
  }
  if (style.scale !== undefined) {
    entity.model.scale = new ConstantProperty(style.scale);
  }
  if (style.minimumPixelSize !== undefined) {
    entity.model.minimumPixelSize = new ConstantProperty(style.minimumPixelSize);
  }
  if (style.maximumScale !== undefined) {
    entity.model.maximumScale = new ConstantProperty(style.maximumScale);
  }
  if (style.silhouetteColor) {
    entity.model.silhouetteColor = new ConstantProperty(
      parseColorLike(style.silhouetteColor, "model.silhouetteColor")
    );
  }
  if (style.silhouetteSize !== undefined) {
    entity.model.silhouetteSize = new ConstantProperty(style.silhouetteSize);
  }
  if (style.colorBlendAmount !== undefined) {
    entity.model.colorBlendAmount = new ConstantProperty(style.colorBlendAmount);
  }
}

export function applySymbolStyleToEntities(
  entities: Entity[],
  style: ResultSymbolStyle
): void {
  for (const entity of entities) {
    if (style.point) {
      applyPointStyle(entity, style.point);
    }
    if (style.line) {
      applyLineStyle(entity, style.line);
    }
    if (style.polygon) {
      applyPolygonStyle(entity, style.polygon);
    }
    if (style.label) {
      applyLabelStyle(entity, style.label);
    }
    if (style.billboard) {
      applyBillboardStyle(entity, style.billboard);
    }
    if (style.model) {
      applyModelStyle(entity, style.model);
    }
  }
}

export function createPointGraphics(style: PointSymbolStyle = {}) {
  return {
    color: parseColorLike(style.color ?? Color.WHITE, "point.color"),
    pixelSize: style.pixelSize ?? 8,
    outlineColor: style.outlineColor
      ? parseColorLike(style.outlineColor, "point.outlineColor")
      : undefined,
    outlineWidth: style.outlineWidth,
    disableDepthTestDistance: Number.POSITIVE_INFINITY
  };
}

export function createLineGraphics(
  positions: Property | Cartesian3[],
  style: LineSymbolStyle = {}
) {
  return {
    positions,
    material: parseColorLike(style.color ?? Color.WHITE, "line.color"),
    width: style.width ?? 3,
    clampToGround: style.clampToGround ?? false
  };
}

export function createPolygonGraphics(
  hierarchy: Property | Cartesian3[] | PolygonHierarchy,
  style: PolygonSymbolStyle = {}
) {
  return {
    hierarchy,
    material: parseColorLike(style.fillColor ?? Color.WHITE.withAlpha(0.25), "polygon.fillColor"),
    outline: true,
    outlineColor: parseColorLike(style.outlineColor ?? Color.WHITE, "polygon.outlineColor"),
    outlineWidth: style.outlineWidth
  };
}

export function createLabelGraphics(text: string, style: LabelSymbolStyle = {}) {
  return {
    text,
    fillColor: parseColorLike(style.color ?? Color.WHITE, "label.color"),
    outlineColor: parseColorLike(style.outlineColor ?? Color.BLACK, "label.outlineColor"),
    outlineWidth: 2,
    font: style.font,
    pixelOffset: style.pixelOffset
      ? new Cartesian2(style.pixelOffset[0], style.pixelOffset[1])
      : undefined,
    style: LabelStyle.FILL_AND_OUTLINE,
    horizontalOrigin: HorizontalOrigin.CENTER,
    verticalOrigin: VerticalOrigin.BOTTOM,
    disableDepthTestDistance: Number.POSITIVE_INFINITY
  };
}

export function createBillboardGraphics(image: string, style: BillboardSymbolStyle = {}) {
  return {
    image,
    color: parseColorLike(style.color ?? Color.WHITE, "billboard.color"),
    scale: style.scale ?? 1,
    pixelOffset: style.pixelOffset
      ? new Cartesian2(style.pixelOffset[0], style.pixelOffset[1])
      : undefined,
    width: style.width,
    height: style.height,
    rotation: style.rotation,
    sizeInMeters: style.sizeInMeters,
    horizontalOrigin: HorizontalOrigin.CENTER,
    verticalOrigin: VerticalOrigin.BOTTOM,
    disableDepthTestDistance:
      style.disableDepthTestDistance ?? Number.POSITIVE_INFINITY
  };
}

export function createModelGraphics(uri: string, style: ModelSymbolStyle = {}) {
  return {
    uri,
    color: style.color ? parseColorLike(style.color, "model.color") : undefined,
    scale: style.scale ?? 1,
    minimumPixelSize: style.minimumPixelSize,
    maximumScale: style.maximumScale,
    silhouetteColor: style.silhouetteColor
      ? parseColorLike(style.silhouetteColor, "model.silhouetteColor")
      : undefined,
    silhouetteSize: style.silhouetteSize,
    colorBlendAmount: style.colorBlendAmount
  };
}

function serializePointStyle(style: PointSymbolStyle): SerializablePointSymbolStyle {
  return {
    ...style,
    color: style.color ? serializeColor(style.color) : undefined,
    outlineColor: style.outlineColor ? serializeColor(style.outlineColor) : undefined
  };
}

function serializeLineStyle(style: LineSymbolStyle): SerializableLineSymbolStyle {
  return {
    ...style,
    color: style.color ? serializeColor(style.color) : undefined
  };
}

function serializePolygonStyle(style: PolygonSymbolStyle): SerializablePolygonSymbolStyle {
  return {
    ...style,
    fillColor: style.fillColor ? serializeColor(style.fillColor) : undefined,
    outlineColor: style.outlineColor ? serializeColor(style.outlineColor) : undefined
  };
}

function serializeLabelStyle(style: LabelSymbolStyle): SerializableLabelSymbolStyle {
  return {
    ...style,
    color: style.color ? serializeColor(style.color) : undefined,
    outlineColor: style.outlineColor ? serializeColor(style.outlineColor) : undefined
  };
}

function serializeBillboardStyle(
  style: BillboardSymbolStyle
): SerializableBillboardSymbolStyle {
  return {
    ...style,
    color: style.color ? serializeColor(style.color) : undefined
  };
}

function serializeModelStyle(style: ModelSymbolStyle): SerializableModelSymbolStyle {
  return {
    ...style,
    color: style.color ? serializeColor(style.color) : undefined,
    silhouetteColor: style.silhouetteColor
      ? serializeColor(style.silhouetteColor)
      : undefined
  };
}

function assertSerializableColor(value: SerializableColor, label: string): void {
  for (const key of ["red", "green", "blue", "alpha"] as const) {
    const channel = value[key];
    if (!Number.isFinite(channel) || channel < 0 || channel > 1) {
      throw new Error(`${label}.${key} must be a finite number between 0 and 1.`);
    }
  }
}
