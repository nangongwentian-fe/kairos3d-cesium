import {
  Cartesian2,
  Cartesian3,
  ConstantPositionProperty,
  ConstantProperty
} from "cesium";
import { applyHeightOptionsToEntity } from "../height";
import {
  isPlotType,
  minPlotPositionCount
} from "../plotting";
import type { DrawResult, DrawType } from "./types";

export function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

export function minPositionCount(type: DrawType): number {
  if (isPlotType(type)) {
    return minPlotPositionCount(type);
  }

  if (type === "polygon") {
    return 3;
  }

  if (type === "polyline" || type === "rectangle" || type === "wall" || type === "corridor") {
    return 2;
  }

  return 1;
}

export function canDeletePosition(type: DrawType, count: number): boolean {
  return count > minPositionCount(type);
}

export function midpoint(start: Cartesian3, end: Cartesian3): Cartesian3 {
  return Cartesian3.midpoint(start, end, new Cartesian3());
}

export function isWithinHandleScreenDistance(
  windowPosition: Cartesian2,
  handleWindowPosition: Cartesian2 | undefined,
  pixelSize: number
): handleWindowPosition is Cartesian2 {
  if (!handleWindowPosition) {
    return false;
  }

  const threshold = Math.max(10, pixelSize / 2 + 4);
  return Cartesian2.distance(windowPosition, handleWindowPosition) <= threshold;
}

export function updateDrawResultGeometry(
  result: DrawResult,
  positions: Cartesian3[]
): DrawResult {
  if (positions.length < minPositionCount(result.type)) {
    throw new Error(`Draw result "${result.id}" requires at least ${minPositionCount(result.type)} positions.`);
  }

  const nextPositions = clonePositions(positions);
  result.positions = nextPositions;
  result.updatedAt = new Date();

  if (result.type === "point") {
    result.entity.position = new ConstantPositionProperty(nextPositions[0]);
  } else if (result.type === "polyline" && result.entity.polyline) {
    result.entity.polyline.positions = new ConstantProperty(nextPositions);
  } else if (result.type === "polygon" && result.entity.polygon) {
    result.entity.polygon.hierarchy = new ConstantProperty(nextPositions);
  }
  applyHeightOptionsToEntity(result.entity, result.height);

  return result;
}
