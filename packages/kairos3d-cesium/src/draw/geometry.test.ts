import { Cartesian2, Cartesian3, Entity } from "cesium";
import { describe, expect, it } from "vitest";
import {
  canDeletePosition,
  isWithinHandleScreenDistance,
  midpoint,
  updateDrawResultGeometry
} from "./geometry";
import type { DrawResult } from "./types";

describe("draw geometry helpers", () => {
  it("keeps minimum point counts by draw type", () => {
    expect(canDeletePosition("point", 1)).toBe(false);
    expect(canDeletePosition("polyline", 2)).toBe(false);
    expect(canDeletePosition("polyline", 3)).toBe(true);
    expect(canDeletePosition("polygon", 3)).toBe(false);
    expect(canDeletePosition("polygon", 4)).toBe(true);
    expect(canDeletePosition("rectangle", 2)).toBe(false);
    expect(canDeletePosition("rectangle", 3)).toBe(true);
  });

  it("computes segment midpoints", () => {
    const position = midpoint(new Cartesian3(0, 0, 0), new Cartesian3(2, 4, 6));

    expect(position).toEqual(new Cartesian3(1, 2, 3));
  });

  it("matches edit handles by screen distance as a picking fallback", () => {
    expect(
      isWithinHandleScreenDistance(new Cartesian2(100, 100), new Cartesian2(108, 100), 8)
    ).toBe(true);
    expect(
      isWithinHandleScreenDistance(new Cartesian2(100, 100), new Cartesian2(130, 100), 8)
    ).toBe(false);
    expect(isWithinHandleScreenDistance(new Cartesian2(100, 100), undefined, 8)).toBe(false);
  });

  it("updates a draw result without replacing the result object", () => {
    const positions = [new Cartesian3(0, 0, 0), new Cartesian3(1, 1, 1)];
    const result: DrawResult = {
      id: "draw-1",
      type: "polyline",
      entity: new Entity({ id: "entity-1", polyline: { positions } }),
      positions,
      show: true,
      locked: false,
      editable: true,
      createdAt: new Date()
    };
    const nextPositions = [new Cartesian3(2, 2, 2), new Cartesian3(3, 3, 3)];

    const updated = updateDrawResultGeometry(result, nextPositions);

    expect(updated).toBe(result);
    expect(updated.positions).not.toBe(nextPositions);
    expect(updated.positions).toEqual(nextPositions);
    expect(updated.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid position counts", () => {
    const result: DrawResult = {
      id: "draw-1",
      type: "polygon",
      entity: new Entity({ id: "entity-1" }),
      positions: [],
      show: true,
      locked: false,
      editable: true,
      createdAt: new Date()
    };

    expect(() => updateDrawResultGeometry(result, [new Cartesian3()])).toThrow(
      'Draw result "draw-1" requires at least 3 positions.'
    );
  });
});
