import { Cartesian3 } from "cesium";
import { describe, expect, it } from "vitest";
import type { TerrainSampleGrid } from "./types";
import {
  calculateCutFillVolume,
  calculateExcavationVolume,
  calculateFloodVolume,
  computeSlopeAspectGrid,
  createContourLines,
  createTerrainSampleGrid,
  getSlopeRange,
  resolveExcavationBottomHeight
} from "./terrain-utils";

function createTerrainProviderMock() {
  return {
    availability: undefined
  } as never;
}

function createArea(): Cartesian3[] {
  return [
    Cartesian3.fromDegrees(114, 22, 0),
    Cartesian3.fromDegrees(114.001, 22, 0),
    Cartesian3.fromDegrees(114.001, 22.001, 0),
    Cartesian3.fromDegrees(114, 22.001, 0)
  ];
}

function createManualGrid(): TerrainSampleGrid {
  const samples = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const height = column * 10;
      samples.push({
        row,
        column,
        position: Cartesian3.fromDegrees(114 + column * 0.001, 22 + row * 0.001, height),
        height,
        sampled: true
      });
    }
  }

  return {
    area: createArea(),
    rows: 3,
    columns: 3,
    sampleStep: 100,
    samples,
    sampled: true
  };
}

describe("terrain utilities", () => {
  it("creates a bounded terrain sample grid without terrain availability", async () => {
    const grid = await createTerrainSampleGrid(createTerrainProviderMock(), createArea(), {
      sampleStep: 80,
      maxSamples: 16
    });

    expect(grid.rows).toBeGreaterThanOrEqual(2);
    expect(grid.columns).toBeGreaterThanOrEqual(2);
    expect(grid.samples.length).toBeGreaterThan(0);
    expect(grid.sampled).toBe(false);
    expect(grid.samples.every((sample) => sample.sampled === false)).toBe(true);
  });

  it("rejects overly dense grids", async () => {
    await expect(
      createTerrainSampleGrid(createTerrainProviderMock(), createArea(), {
        sampleStep: 1,
        maxSamples: 4
      })
    ).rejects.toThrow("exceeding maxSamples");
  });

  it("computes slope and aspect from neighboring samples", () => {
    const grid = computeSlopeAspectGrid(createManualGrid());
    const center = grid.samples.find((sample) => sample.row === 1 && sample.column === 1);
    const range = getSlopeRange(grid);

    expect(center?.slope).toBeGreaterThan(0);
    expect(center?.aspect).toBeGreaterThanOrEqual(0);
    expect(range.maxSlope).toBeGreaterThan(0);
    expect(range.averageSlope).toBeGreaterThan(0);
  });

  it("creates contour line segments from grid heights", () => {
    const grid = createManualGrid();
    const contour = createContourLines(grid, 5);

    expect(contour.minHeight).toBe(0);
    expect(contour.maxHeight).toBe(20);
    expect(contour.lines.length).toBeGreaterThan(0);
    expect(contour.lines[0].positions).toHaveLength(2);
  });

  it("rejects invalid contour intervals", () => {
    expect(() => createContourLines(createManualGrid(), 0)).toThrow(
      "Contour interval must be a positive finite number."
    );
  });

  it("calculates cut and fill volumes from sampled cell estimates", () => {
    const volume = calculateCutFillVolume(createManualGrid(), 10);

    expect(volume.sampleArea).toBe(10000);
    expect(volume.cutVolume).toBe(300000);
    expect(volume.fillVolume).toBe(300000);
    expect(volume.netVolume).toBe(0);
  });

  it("calculates flood area and water volume below a water height", () => {
    const flood = calculateFloodVolume(createManualGrid(), 15);

    expect(flood.sampleArea).toBe(10000);
    expect(flood.floodedArea).toBe(60000);
    expect(flood.waterVolume).toBe(600000);
  });

  it("calculates excavation cut volume against a bottom plane", () => {
    const excavation = calculateExcavationVolume(createManualGrid(), 5);

    expect(excavation.sampleArea).toBe(10000);
    expect(excavation.cutVolume).toBe(600000);
  });

  it("resolves excavation depth into a bottom height", () => {
    const plane = resolveExcavationBottomHeight(createManualGrid(), { depth: 10 });

    expect(plane.bottomHeight).toBe(-10);
    expect(plane.depth).toBe(10);
  });

  it("rejects invalid terrain analysis heights", () => {
    expect(() => calculateCutFillVolume(createManualGrid(), Number.NaN)).toThrow(
      "Terrain baseHeight must be a finite number."
    );
    expect(() => resolveExcavationBottomHeight(createManualGrid(), {})).toThrow(
      "Excavation requires a finite bottomHeight or a positive depth."
    );
  });
});
