import {
  Cartesian3,
  Cartographic,
  WebMercatorProjection
} from "cesium";
import type {
  PlotAlgorithmOptions,
  PlotGeometry,
  PlotType
} from "./types";
import {
  minPlotPositionCount,
  plotGeometryKind
} from "./types";

interface PlanePoint {
  x: number;
  y: number;
  height: number;
}

const projection = new WebMercatorProjection();
const epsilon = 1e-6;

export function computePlotGeometry(
  type: PlotType,
  positions: Cartesian3[],
  options: PlotAlgorithmOptions = {}
): PlotGeometry {
  validateControlPositions(type, positions);
  const points = positions.map(toPlanePoint);
  const steps = normalizeSteps(options.steps);
  const computed = computePlaneGeometry(type, points, options, steps);
  if (computed.length < minPlotPositionCount(type)) {
    throw new Error(`Plot "${type}" produced invalid geometry.`);
  }

  return {
    type,
    kind: plotGeometryKind(type),
    controlPositions: cloneCartesianPositions(positions),
    positions: computed.map(toCartesian)
  };
}

export function validatePlotPositions(type: PlotType, positions: Cartesian3[]): void {
  validateControlPositions(type, positions);
}

function computePlaneGeometry(
  type: PlotType,
  points: PlanePoint[],
  options: PlotAlgorithmOptions,
  steps: number
): PlanePoint[] {
  if (type === "fine-arrow") {
    return simpleArrow(points[0], points[1], {
      tailWidthFactor: options.tailWidthFactor ?? 0.1,
      neckWidthFactor: options.neckWidthFactor ?? 0.2,
      headWidthFactor: options.headWidthFactor ?? 0.25,
      headHeightFactor: options.headHeightFactor ?? 0.18
    });
  }

  if (type === "straight-arrow") {
    return simpleArrow(points[0], points[1], {
      tailWidthFactor: options.tailWidthFactor ?? 0.05,
      neckWidthFactor: options.neckWidthFactor ?? 0.12,
      headWidthFactor: options.headWidthFactor ?? 0.2,
      headHeightFactor: options.headHeightFactor ?? 0.16
    });
  }

  if (type === "attack-arrow") {
    return attackArrow(points, options);
  }

  if (type === "double-arrow") {
    return doubleArrow(points, options);
  }

  if (type === "curve") {
    return smoothOpen(points, steps);
  }

  if (type === "closed-curve" || type === "gathering-place") {
    return smoothClosed(points, steps);
  }

  if (type === "sector") {
    return sector(points, steps);
  }

  return lune(points, steps);
}

function simpleArrow(
  start: PlanePoint,
  end: PlanePoint,
  options: Required<
    Pick<
      PlotAlgorithmOptions,
      "tailWidthFactor" | "neckWidthFactor" | "headWidthFactor" | "headHeightFactor"
    >
  >
): PlanePoint[] {
  const length = distance(start, end);
  assertDistance(length, "arrow");
  const direction = normalize(subtract(end, start));
  const normal = perpendicular(direction);
  const tailWidth = length * options.tailWidthFactor;
  const neckWidth = length * options.neckWidthFactor;
  const headWidth = length * options.headWidthFactor;
  const neck = add(start, scale(direction, length * (1 - options.headHeightFactor)));

  return [
    offset(start, normal, tailWidth / 2),
    offset(neck, normal, neckWidth / 2),
    offset(neck, normal, headWidth / 2),
    clonePlanePoint(end),
    offset(neck, normal, -headWidth / 2),
    offset(neck, normal, -neckWidth / 2),
    offset(start, normal, -tailWidth / 2)
  ];
}

function attackArrow(points: PlanePoint[], options: PlotAlgorithmOptions): PlanePoint[] {
  const tailLeft = points[0];
  const tailRight = points[1];
  const spine = [midpoint(tailLeft, tailRight), ...points.slice(2)];
  return taperedArrow(spine, distance(tailLeft, tailRight), options, {
    tailLeft,
    tailRight
  });
}

function doubleArrow(points: PlanePoint[], options: PlotAlgorithmOptions): PlanePoint[] {
  const baseLeft = points[0];
  const baseRight = points[1];
  const firstHead = points[2];
  const center = midpoint(baseLeft, baseRight);
  const secondHead = points[3] ?? mirrorPoint(firstHead, center);
  const width = Math.max(distance(baseLeft, baseRight) * 0.45, epsilon);
  const first = simpleArrow(center, firstHead, {
    tailWidthFactor: options.tailWidthFactor ?? 0.08,
    neckWidthFactor: options.neckWidthFactor ?? 0.18,
    headWidthFactor: options.headWidthFactor ?? 0.28,
    headHeightFactor: options.headHeightFactor ?? 0.18
  });
  const second = simpleArrow(center, secondHead, {
    tailWidthFactor: options.tailWidthFactor ?? 0.08,
    neckWidthFactor: options.neckWidthFactor ?? 0.18,
    headWidthFactor: options.headWidthFactor ?? 0.28,
    headHeightFactor: options.headHeightFactor ?? 0.18
  });

  return [
    offset(baseLeft, normalize(subtract(firstHead, center)), width / 4),
    ...first.slice(1, 5),
    offset(baseRight, normalize(subtract(secondHead, center)), width / 4),
    ...second.slice(1, 5)
  ];
}

function taperedArrow(
  spine: PlanePoint[],
  tailWidth: number,
  options: PlotAlgorithmOptions,
  tail?: { tailLeft: PlanePoint; tailRight: PlanePoint }
): PlanePoint[] {
  const total = totalDistance(spine);
  assertDistance(total, "attack arrow");
  const head = spine[spine.length - 1];
  const beforeHead = spine[spine.length - 2];
  const headDirection = normalize(subtract(head, beforeHead));
  const headHeight = Math.min(
    total * (options.headHeightFactor ?? 0.18),
    distance(beforeHead, head) * 0.9
  );
  const neck = add(head, scale(headDirection, -headHeight));
  const headNormal = perpendicular(headDirection);
  const headWidth = Math.max(total * (options.headWidthFactor ?? 0.3), tailWidth * 0.5);
  const neckWidth = Math.max(total * (options.neckWidthFactor ?? 0.15), tailWidth * 0.25);
  const left: PlanePoint[] = tail ? [clonePlanePoint(tail.tailLeft)] : [];
  const right: PlanePoint[] = tail ? [clonePlanePoint(tail.tailRight)] : [];
  let traveled = 0;

  for (let index = 0; index < spine.length - 1; index += 1) {
    const current = spine[index];
    const next = spine[index + 1];
    const segmentLength = distance(current, next);
    if (segmentLength <= epsilon) {
      continue;
    }

    const segmentDirection = normalize(subtract(next, current));
    const normal = perpendicular(segmentDirection);
    const ratio = total <= epsilon ? 0 : traveled / total;
    const width = interpolate(tailWidth, neckWidth, ratio);
    if (!tail || index > 0) {
      left.push(offset(current, normal, width / 2));
      right.push(offset(current, normal, -width / 2));
    }
    traveled += segmentLength;
  }

  const neckLeft = offset(neck, headNormal, neckWidth / 2);
  const neckRight = offset(neck, headNormal, -neckWidth / 2);
  return [
    ...left,
    neckLeft,
    offset(neck, headNormal, headWidth / 2),
    clonePlanePoint(head),
    offset(neck, headNormal, -headWidth / 2),
    neckRight,
    ...right.reverse()
  ];
}

function sector(points: PlanePoint[], steps: number): PlanePoint[] {
  const center = points[0];
  const start = points[1];
  const end = points[2];
  const radius = Math.max((distance(center, start) + distance(center, end)) / 2, epsilon);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const sweep = normalizeSweep(endAngle - startAngle);
  const result = [clonePlanePoint(center)];

  for (let index = 0; index <= steps; index += 1) {
    const angle = startAngle + (sweep * index) / steps;
    result.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
      height: interpolate(start.height, end.height, index / steps)
    });
  }
  return result;
}

function lune(points: PlanePoint[], steps: number): PlanePoint[] {
  const first = points[0];
  const second = points[1];
  const third = points[2];
  const center = midpoint(first, second);
  const mirrored = mirrorPoint(third, center);
  return smoothClosed([first, third, second, mirrored], steps);
}

function smoothOpen(points: PlanePoint[], steps: number): PlanePoint[] {
  if (points.length <= 2) {
    return interpolateLine(points[0], points[1], steps);
  }
  return catmullRom(points, steps, false);
}

function smoothClosed(points: PlanePoint[], steps: number): PlanePoint[] {
  return catmullRom(points, steps, true);
}

function catmullRom(points: PlanePoint[], steps: number, closed: boolean): PlanePoint[] {
  const result: PlanePoint[] = [];
  const count = points.length;
  const segmentCount = closed ? count : count - 1;
  const segmentSteps = Math.max(4, Math.floor(steps / segmentCount));

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const p0 = points[closedIndex(segment - 1, count, closed)];
    const p1 = points[closedIndex(segment, count, closed)];
    const p2 = points[closedIndex(segment + 1, count, closed)];
    const p3 = points[closedIndex(segment + 2, count, closed)];

    for (let step = 0; step < segmentSteps; step += 1) {
      result.push(catmullPoint(p0, p1, p2, p3, step / segmentSteps));
    }
  }

  if (!closed) {
    result.push(clonePlanePoint(points[count - 1]));
  }
  return result;
}

function interpolateLine(start: PlanePoint, end: PlanePoint, steps: number): PlanePoint[] {
  const result: PlanePoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    result.push(lerpPoint(start, end, index / steps));
  }
  return result;
}

function catmullPoint(
  p0: PlanePoint,
  p1: PlanePoint,
  p2: PlanePoint,
  p3: PlanePoint,
  t: number
): PlanePoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    height: 0.5 * ((2 * p1.height) + (-p0.height + p2.height) * t + (2 * p0.height - 5 * p1.height + 4 * p2.height - p3.height) * t2 + (-p0.height + 3 * p1.height - 3 * p2.height + p3.height) * t3)
  };
}

function closedIndex(index: number, count: number, closed: boolean): number {
  if (closed) {
    return (index + count) % count;
  }
  return Math.max(0, Math.min(count - 1, index));
}

function validateControlPositions(type: PlotType, positions: Cartesian3[]): void {
  if (!Array.isArray(positions)) {
    throw new Error(`Plot "${type}" positions must be an array.`);
  }

  const min = minPlotPositionCount(type);
  if (positions.length < min) {
    throw new Error(`Plot "${type}" requires at least ${min} positions.`);
  }

  for (const [index, position] of positions.entries()) {
    if (
      !(position instanceof Cartesian3) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new Error(`Plot "${type}" position ${index} must be a finite Cartesian3.`);
    }
  }

  if (totalDistance(positions.map(toPlanePoint)) <= epsilon) {
    throw new Error(`Plot "${type}" positions must not be degenerate.`);
  }
}

function normalizeSteps(value: number | undefined): number {
  if (value === undefined) {
    return 64;
  }
  if (!Number.isFinite(value) || value < 2) {
    throw new Error("Plot steps must be a finite number greater than or equal to 2.");
  }
  return Math.max(2, Math.min(256, Math.round(value)));
}

function toPlanePoint(position: Cartesian3): PlanePoint {
  const cartographic = Cartographic.fromCartesian(position);
  if (!cartographic) {
    throw new Error("Plot position cannot be converted to cartographic coordinates.");
  }
  const projected = projection.project(cartographic);
  return {
    x: projected.x,
    y: projected.y,
    height: cartographic.height
  };
}

function toCartesian(point: PlanePoint): Cartesian3 {
  const cartographic = projection.unproject(new Cartesian3(point.x, point.y, 0));
  return Cartesian3.fromRadians(
    cartographic.longitude,
    cartographic.latitude,
    point.height
  );
}

function cloneCartesianPositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function clonePlanePoint(point: PlanePoint): PlanePoint {
  return { x: point.x, y: point.y, height: point.height };
}

function midpoint(start: PlanePoint, end: PlanePoint): PlanePoint {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
    height: (start.height + end.height) / 2
  };
}

function mirrorPoint(point: PlanePoint, center: PlanePoint): PlanePoint {
  return {
    x: center.x * 2 - point.x,
    y: center.y * 2 - point.y,
    height: point.height
  };
}

function subtract(end: PlanePoint, start: PlanePoint): PlanePoint {
  return { x: end.x - start.x, y: end.y - start.y, height: end.height - start.height };
}

function add(start: PlanePoint, delta: PlanePoint): PlanePoint {
  return { x: start.x + delta.x, y: start.y + delta.y, height: start.height + delta.height };
}

function scale(point: PlanePoint, factor: number): PlanePoint {
  return { x: point.x * factor, y: point.y * factor, height: point.height * factor };
}

function normalize(point: PlanePoint): PlanePoint {
  const length = Math.hypot(point.x, point.y);
  assertDistance(length, "vector");
  return { x: point.x / length, y: point.y / length, height: 0 };
}

function perpendicular(point: PlanePoint): PlanePoint {
  return { x: -point.y, y: point.x, height: 0 };
}

function offset(point: PlanePoint, normal: PlanePoint, amount: number): PlanePoint {
  return {
    x: point.x + normal.x * amount,
    y: point.y + normal.y * amount,
    height: point.height
  };
}

function distance(start: PlanePoint, end: PlanePoint): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function totalDistance(points: PlanePoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }
  return total;
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function lerpPoint(start: PlanePoint, end: PlanePoint, ratio: number): PlanePoint {
  return {
    x: interpolate(start.x, end.x, ratio),
    y: interpolate(start.y, end.y, ratio),
    height: interpolate(start.height, end.height, ratio)
  };
}

function normalizeSweep(value: number): number {
  let sweep = value;
  while (sweep <= 0) {
    sweep += Math.PI * 2;
  }
  return sweep;
}

function assertDistance(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= epsilon) {
    throw new Error(`Plot ${label} geometry is degenerate.`);
  }
}
