import { Cartesian3 } from "cesium";
import { describe, expect, it } from "vitest";
import {
  computePlotGeometry,
  minPlotPositionCount,
  plotGeometryKind,
  plotTypes
} from "./index";
import type { PlotType } from "./types";

function position(longitude: number, latitude: number, height = 0): Cartesian3 {
  return Cartesian3.fromDegrees(longitude, latitude, height);
}

const controls: Record<PlotType, Cartesian3[]> = {
  "fine-arrow": [position(114, 22), position(114.02, 22.02)],
  "straight-arrow": [position(114, 22), position(114.02, 22.02)],
  "attack-arrow": [
    position(114, 22),
    position(114.01, 22.01),
    position(114.03, 22.015)
  ],
  "double-arrow": [
    position(114, 22),
    position(114.01, 22.012),
    position(114.025, 22.002)
  ],
  curve: [position(114, 22), position(114.01, 22.012), position(114.03, 22.01)],
  "closed-curve": [
    position(114, 22),
    position(114.015, 22.012),
    position(114.03, 22)
  ],
  sector: [position(114, 22), position(114.015, 22), position(114.01, 22.015)],
  lune: [position(114, 22), position(114.015, 22), position(114.01, 22.015)],
  "gathering-place": [
    position(114, 22),
    position(114.015, 22.012),
    position(114.03, 22)
  ]
};

describe("plotting geometry", () => {
  it("computes finite render geometry for every plot type", () => {
    for (const type of plotTypes) {
      const geometry = computePlotGeometry(type, controls[type], { steps: 16 });

      expect(geometry.type).toBe(type);
      expect(geometry.kind).toBe(plotGeometryKind(type));
      expect(geometry.controlPositions).not.toBe(controls[type]);
      expect(geometry.positions.length).toBeGreaterThanOrEqual(
        minPlotPositionCount(type)
      );
      for (const output of geometry.positions) {
        expect(output).toBeInstanceOf(Cartesian3);
        expect(Number.isFinite(output.x)).toBe(true);
        expect(Number.isFinite(output.y)).toBe(true);
        expect(Number.isFinite(output.z)).toBe(true);
      }
    }
  });

  it("uses polyline geometry for curve and polygon geometry for other plot types", () => {
    expect(computePlotGeometry("curve", controls.curve).kind).toBe("polyline");
    expect(computePlotGeometry("fine-arrow", controls["fine-arrow"]).kind).toBe(
      "polygon"
    );
    expect(computePlotGeometry("sector", controls.sector).kind).toBe("polygon");
  });

  it("rejects insufficient or degenerate control points", () => {
    expect(() =>
      computePlotGeometry("attack-arrow", [position(114, 22), position(114.01, 22)])
    ).toThrow('Plot "attack-arrow" requires at least 3 positions.');

    expect(() =>
      computePlotGeometry("fine-arrow", [position(114, 22), position(114, 22)])
    ).toThrow(/degenerate/);

    expect(() =>
      computePlotGeometry("curve", [position(114, 22), new Cartesian3(Number.NaN, 0, 0)])
    ).toThrow('Plot "curve" position 1 must be a finite Cartesian3.');
  });
});
