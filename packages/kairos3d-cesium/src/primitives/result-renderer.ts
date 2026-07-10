import {
  Color,
  ColorGeometryInstanceAttribute,
  Cartesian3,
  GeometryInstance,
  Material,
  PerInstanceColorAppearance,
  PolygonGeometry,
  Primitive,
  PolylineCollection,
  type Polyline
} from "cesium";
import type { KairosMap } from "../core";
import {
  parseColorLike,
  type LineSymbolStyle,
  type PolygonSymbolStyle
} from "../style";
import type { ResultPrimitiveRuntime, ResultRenderMode } from "./types";

export function resolveResultRenderMode(mode?: ResultRenderMode): ResultRenderMode {
  return mode === "primitive" ? "primitive" : "entity";
}

export function createResultPolylinePrimitive(
  map: KairosMap,
  options: {
    id: string;
    positions: Cartesian3[];
    style?: LineSymbolStyle;
    loop?: boolean;
  }
): ResultPrimitiveRuntime {
  const runtime = createDetachedResultPolylinePrimitive(options);
  attachResultPrimitiveRuntimes(map, [runtime]);
  return runtime;
}

export function createDetachedResultPolylinePrimitive(options: {
  id: string;
  positions: Cartesian3[];
  style?: LineSymbolStyle;
  loop?: boolean;
}): ResultPrimitiveRuntime {
  const collection = new PolylineCollection();
  const color = parseColorLike(options.style?.color ?? Color.WHITE, "primitive.line.color");
  const polyline = collection.add({
    id: options.id,
    positions: clonePositions(options.positions),
    material: Material.fromType("Color", { color }),
    width: options.style?.width ?? 3,
    loop: options.loop ?? false
  });

  return {
    id: options.id,
    type: "polyline",
    positions: clonePositions(options.positions),
    polyline,
    collection
  };
}

export function createResultPolygonPrimitives(
  map: KairosMap,
  options: {
    id: string;
    positions: Cartesian3[];
    style?: PolygonSymbolStyle;
  }
): ResultPrimitiveRuntime[] {
  const runtimes = createDetachedResultPolygonPrimitives(options);
  attachResultPrimitiveRuntimes(map, runtimes);
  return runtimes;
}

export function createDetachedResultPolygonPrimitives(options: {
  id: string;
  positions: Cartesian3[];
  style?: PolygonSymbolStyle;
}): ResultPrimitiveRuntime[] {
  const fillColor = parseColorLike(
    options.style?.fillColor ?? Color.WHITE.withAlpha(0.25),
    "primitive.polygon.fillColor"
  );
  const primitive = new Primitive({
    geometryInstances: new GeometryInstance({
      id: `${options.id}-fill`,
      geometry: PolygonGeometry.fromPositions({
        positions: clonePositions(options.positions),
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(fillColor)
      }
    }),
    appearance: new PerInstanceColorAppearance({
      flat: true,
      translucent: fillColor.alpha < 1
    }),
    asynchronous: false
  });

  const outline = createDetachedResultPolylinePrimitive({
    id: `${options.id}-outline`,
    positions: options.positions,
    style: {
      color: options.style?.outlineColor ?? Color.WHITE,
      width: options.style?.outlineWidth ?? 2
    },
    loop: true
  });

  return [
    {
      id: `${options.id}-fill`,
      type: "polygon",
      positions: clonePositions(options.positions),
      primitive
    },
    outline
  ];
}

export function removeResultPrimitiveRuntimes(
  map: KairosMap,
  runtimes: ResultPrimitiveRuntime[] | undefined
): void {
  detachResultPrimitiveRuntimes(map, runtimes);
  destroyResultPrimitiveRuntimes(runtimes);
}

export function attachResultPrimitiveRuntimes(
  map: KairosMap,
  runtimes: ResultPrimitiveRuntime[] | undefined
): void {
  for (const runtime of runtimes ?? []) {
    map.viewer.scene.primitives.add(
      runtime.type === "polyline" ? runtime.collection : runtime.primitive
    );
  }
}

export function detachResultPrimitiveRuntimes(
  map: KairosMap,
  runtimes: ResultPrimitiveRuntime[] | undefined
): void {
  const collection = map.viewer.scene.primitives;
  const destroyPrimitives = collection.destroyPrimitives;
  collection.destroyPrimitives = false;
  try {
    for (const runtime of [...(runtimes ?? [])].reverse()) {
      collection.remove(
        runtime.type === "polyline" ? runtime.collection : runtime.primitive
      );
    }
  } finally {
    collection.destroyPrimitives = destroyPrimitives;
  }
}

export function destroyResultPrimitiveRuntimes(
  runtimes: ResultPrimitiveRuntime[] | undefined
): void {
  const destroyed = new Set<Primitive | PolylineCollection>();
  for (const runtime of runtimes ?? []) {
    const primitive = runtime.type === "polyline" ? runtime.collection : runtime.primitive;
    if (destroyed.has(primitive)) {
      continue;
    }
    destroyed.add(primitive);
    if (!primitive.isDestroyed()) {
      primitive.destroy();
    }
  }
}

export function countResultPrimitiveRuntimes(result: unknown): number {
  if (!isRecord(result) || !Array.isArray(result.primitives)) {
    return 0;
  }
  return result.primitives.length;
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
