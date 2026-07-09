import {
  Cartesian3,
  ConstantPositionProperty,
  ConstantProperty
} from "cesium";
import { applyHeightOptionsToEntity } from "../height";
import type { DrawResult, DrawType } from "./types";

export function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

export function minPositionCount(type: DrawType): number {
  if (type === "polygon") {
    return 3;
  }

  if (type === "polyline" || type === "rectangle") {
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
