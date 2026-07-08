import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
  Math as CesiumMath,
  sampleTerrainMostDetailed,
  type TerrainProvider
} from "cesium";
import type {
  ContourLine,
  TerrainGridSample,
  TerrainSampleGrid
} from "./types";

const defaultSampleStep = 30;
const defaultMaxSamples = 2500;

interface TerrainGridOptions {
  sampleStep?: number;
  maxSamples?: number;
}

interface GridPoint {
  row: number;
  column: number;
  cartographic: Cartographic;
}

interface Bounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

export async function createTerrainSampleGrid(
  terrainProvider: TerrainProvider,
  area: Cartesian3[],
  options: TerrainGridOptions = {}
): Promise<TerrainSampleGrid> {
  const sampleStep = normalizeSampleStep(options.sampleStep);
  const maxSamples = normalizeMaxSamples(options.maxSamples);
  const polygon = area.map(cartographicFromPosition);
  validateArea(polygon);
  const bounds = getBounds(polygon);
  const dimensions = getGridDimensions(bounds, sampleStep);
  const totalCells = dimensions.rows * dimensions.columns;
  if (totalCells > maxSamples) {
    throw new Error(
      `Terrain sample grid requires ${totalCells} samples, exceeding maxSamples ${maxSamples}.`
    );
  }

  const points = createGridPoints(bounds, dimensions, polygon);
  if (points.length === 0) {
    throw new Error("Terrain analysis area does not contain any sample points.");
  }

  const sampled = await sampleGridPoints(terrainProvider, points);
  return {
    area: clonePositions(area),
    rows: dimensions.rows,
    columns: dimensions.columns,
    sampleStep,
    samples: sampled,
    sampled: sampled.some((sample) => sample.sampled)
  };
}

export function computeSlopeAspectGrid(grid: TerrainSampleGrid): TerrainSampleGrid {
  const samples = grid.samples.map((sample) => ({ ...sample }));
  const byKey = new Map<string, TerrainGridSample>();
  for (const sample of samples) {
    byKey.set(sampleKey(sample.row, sample.column), sample);
  }

  for (const sample of samples) {
    const west = byKey.get(sampleKey(sample.row, sample.column - 1));
    const east = byKey.get(sampleKey(sample.row, sample.column + 1));
    const south = byKey.get(sampleKey(sample.row - 1, sample.column));
    const north = byKey.get(sampleKey(sample.row + 1, sample.column));
    if (!west || !east || !south || !north) {
      continue;
    }

    const dx = Cartesian3.distance(west.position, east.position);
    const dy = Cartesian3.distance(south.position, north.position);
    if (dx <= 0 || dy <= 0) {
      continue;
    }

    const dzDx = (east.height - west.height) / dx;
    const dzDy = (north.height - south.height) / dy;
    const slopeRadians = Math.atan(Math.hypot(dzDx, dzDy));
    sample.slope = CesiumMath.toDegrees(slopeRadians);
    sample.aspect = normalizeDegrees(CesiumMath.toDegrees(Math.atan2(dzDx, dzDy)) + 180);
  }

  return {
    ...grid,
    area: clonePositions(grid.area),
    samples
  };
}

export function getSlopeRange(grid: TerrainSampleGrid): {
  minSlope: number;
  maxSlope: number;
  averageSlope: number;
} {
  const slopes = grid.samples
    .map((sample) => sample.slope)
    .filter((slope): slope is number => Number.isFinite(slope));
  if (slopes.length === 0) {
    return { minSlope: 0, maxSlope: 0, averageSlope: 0 };
  }

  const minSlope = Math.min(...slopes);
  const maxSlope = Math.max(...slopes);
  const averageSlope = slopes.reduce((sum, slope) => sum + slope, 0) / slopes.length;
  return { minSlope, maxSlope, averageSlope };
}

export function createContourLines(
  grid: TerrainSampleGrid,
  interval: number
): { lines: ContourLine[]; minHeight: number; maxHeight: number } {
  const normalizedInterval = normalizeContourInterval(interval);
  const { minHeight, maxHeight } = getHeightRange(grid);
  if (maxHeight < minHeight || normalizedInterval <= 0) {
    return { lines: [], minHeight, maxHeight };
  }

  const byKey = new Map<string, TerrainGridSample>();
  for (const sample of grid.samples) {
    byKey.set(sampleKey(sample.row, sample.column), sample);
  }

  const lines: ContourLine[] = [];
  const firstLevel = Math.ceil(minHeight / normalizedInterval) * normalizedInterval;
  for (let level = firstLevel; level <= maxHeight; level += normalizedInterval) {
    for (let row = 0; row < grid.rows - 1; row += 1) {
      for (let column = 0; column < grid.columns - 1; column += 1) {
        const cell = [
          byKey.get(sampleKey(row, column)),
          byKey.get(sampleKey(row, column + 1)),
          byKey.get(sampleKey(row + 1, column + 1)),
          byKey.get(sampleKey(row + 1, column))
        ];
        if (cell.some((sample) => !sample)) {
          continue;
        }

        for (const segment of contourSegmentsForCell(cell as TerrainGridSample[], level)) {
          lines.push({ height: level, positions: segment });
        }
      }
    }
  }

  return { lines, minHeight, maxHeight };
}

export function getHeightRange(grid: TerrainSampleGrid): {
  minHeight: number;
  maxHeight: number;
} {
  if (grid.samples.length === 0) {
    return { minHeight: 0, maxHeight: 0 };
  }

  let minHeight = grid.samples[0].height;
  let maxHeight = grid.samples[0].height;
  for (const sample of grid.samples) {
    minHeight = Math.min(minHeight, sample.height);
    maxHeight = Math.max(maxHeight, sample.height);
  }
  return { minHeight, maxHeight };
}

export interface CutFillVolumeSummary {
  cutVolume: number;
  fillVolume: number;
  netVolume: number;
  sampleArea: number;
}

export interface FloodVolumeSummary {
  floodedArea: number;
  waterVolume: number;
  sampleArea: number;
}

export interface ExcavationVolumeSummary {
  cutVolume: number;
  sampleArea: number;
}

export function calculateCutFillVolume(
  grid: TerrainSampleGrid,
  baseHeight: number
): CutFillVolumeSummary {
  const normalizedBaseHeight = normalizeAnalysisHeight(baseHeight, "baseHeight");
  const sampleArea = getApproximateSampleArea(grid);
  let cutVolume = 0;
  let fillVolume = 0;

  for (const sample of grid.samples) {
    const delta = sample.height - normalizedBaseHeight;
    if (delta > 0) {
      cutVolume += delta * sampleArea;
    } else if (delta < 0) {
      fillVolume += Math.abs(delta) * sampleArea;
    }
  }

  return {
    cutVolume,
    fillVolume,
    netVolume: cutVolume - fillVolume,
    sampleArea
  };
}

export function calculateFloodVolume(
  grid: TerrainSampleGrid,
  waterHeight: number
): FloodVolumeSummary {
  const normalizedWaterHeight = normalizeAnalysisHeight(waterHeight, "waterHeight");
  const sampleArea = getApproximateSampleArea(grid);
  let floodedArea = 0;
  let waterVolume = 0;

  for (const sample of grid.samples) {
    const depth = normalizedWaterHeight - sample.height;
    if (depth > 0) {
      floodedArea += sampleArea;
      waterVolume += depth * sampleArea;
    }
  }

  return {
    floodedArea,
    waterVolume,
    sampleArea
  };
}

export function calculateExcavationVolume(
  grid: TerrainSampleGrid,
  bottomHeight: number
): ExcavationVolumeSummary {
  const normalizedBottomHeight = normalizeAnalysisHeight(bottomHeight, "bottomHeight");
  const sampleArea = getApproximateSampleArea(grid);
  let cutVolume = 0;

  for (const sample of grid.samples) {
    const depth = sample.height - normalizedBottomHeight;
    if (depth > 0) {
      cutVolume += depth * sampleArea;
    }
  }

  return {
    cutVolume,
    sampleArea
  };
}

export function resolveExcavationBottomHeight(
  grid: TerrainSampleGrid,
  options: { bottomHeight?: number; depth?: number }
): { bottomHeight: number; depth?: number } {
  const depth = normalizeOptionalDepth(options.depth);
  if (options.bottomHeight !== undefined) {
    return {
      bottomHeight: normalizeAnalysisHeight(options.bottomHeight, "bottomHeight"),
      depth
    };
  }

  if (depth === undefined) {
    throw new Error("Excavation requires a finite bottomHeight or a positive depth.");
  }

  return {
    bottomHeight: getHeightRange(grid).minHeight - depth,
    depth
  };
}

function createGridPoints(
  bounds: Bounds,
  dimensions: { rows: number; columns: number },
  polygon: Cartographic[]
): GridPoint[] {
  const points: GridPoint[] = [];
  for (let row = 0; row < dimensions.rows; row += 1) {
    const latitude = interpolate(bounds.south, bounds.north, row, dimensions.rows);
    for (let column = 0; column < dimensions.columns; column += 1) {
      const longitude = interpolate(bounds.west, bounds.east, column, dimensions.columns);
      if (pointInPolygon(longitude, latitude, polygon)) {
        points.push({
          row,
          column,
          cartographic: new Cartographic(longitude, latitude, 0)
        });
      }
    }
  }
  return points;
}

async function sampleGridPoints(
  terrainProvider: TerrainProvider,
  points: GridPoint[]
): Promise<TerrainGridSample[]> {
  if (!terrainProvider.availability) {
    return points.map((point) => createGridSample(point, point.cartographic, false));
  }

  try {
    const sampled = await sampleTerrainMostDetailed(
      terrainProvider,
      points.map((point) => Cartographic.clone(point.cartographic)),
      false
    );
    return points.map((point, index) =>
      createGridSample(point, sampled[index] ?? point.cartographic, true)
    );
  } catch {
    return points.map((point) => createGridSample(point, point.cartographic, false));
  }
}

function createGridSample(
  point: GridPoint,
  cartographic: Cartographic,
  sampled: boolean
): TerrainGridSample {
  const height = Number.isFinite(cartographic.height) ? cartographic.height : 0;
  return {
    row: point.row,
    column: point.column,
    position: Cartesian3.fromRadians(
      point.cartographic.longitude,
      point.cartographic.latitude,
      height
    ),
    height,
    sampled
  };
}

function contourSegmentsForCell(
  cell: TerrainGridSample[],
  level: number
): Cartesian3[][] {
  const edges = [
    [cell[0], cell[1]],
    [cell[1], cell[2]],
    [cell[2], cell[3]],
    [cell[3], cell[0]]
  ] as const;
  const points: Cartesian3[] = [];

  for (const [start, end] of edges) {
    const point = interpolateContourEdge(start, end, level);
    if (point) {
      points.push(point);
    }
  }

  if (points.length < 2) {
    return [];
  }
  if (points.length === 2) {
    return [[points[0], points[1]]];
  }

  return [
    [points[0], points[1]],
    [points[2], points[3]]
  ];
}

function interpolateContourEdge(
  start: TerrainGridSample,
  end: TerrainGridSample,
  level: number
): Cartesian3 | undefined {
  const min = Math.min(start.height, end.height);
  const max = Math.max(start.height, end.height);
  if (level < min || level > max || start.height === end.height) {
    return undefined;
  }

  const ratio = (level - start.height) / (end.height - start.height);
  const startCartographic = cartographicFromPosition(start.position);
  const endCartographic = cartographicFromPosition(end.position);
  return Cartesian3.fromRadians(
    lerp(startCartographic.longitude, endCartographic.longitude, ratio),
    lerp(startCartographic.latitude, endCartographic.latitude, ratio),
    level
  );
}

function getGridDimensions(
  bounds: Bounds,
  sampleStep: number
): { rows: number; columns: number } {
  const centerLatitude = (bounds.south + bounds.north) / 2;
  const radius = Ellipsoid.WGS84.maximumRadius;
  const latStep = sampleStep / radius;
  const lonStep = sampleStep / (radius * Math.max(0.01, Math.cos(centerLatitude)));
  return {
    rows: Math.max(2, Math.floor((bounds.north - bounds.south) / latStep) + 1),
    columns: Math.max(2, Math.floor((bounds.east - bounds.west) / lonStep) + 1)
  };
}

function getBounds(polygon: Cartographic[]): Bounds {
  return polygon.reduce(
    (bounds, point) => ({
      west: Math.min(bounds.west, point.longitude),
      east: Math.max(bounds.east, point.longitude),
      south: Math.min(bounds.south, point.latitude),
      north: Math.max(bounds.north, point.latitude)
    }),
    {
      west: Number.POSITIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY,
      south: Number.POSITIVE_INFINITY,
      north: Number.NEGATIVE_INFINITY
    }
  );
}

function pointInPolygon(longitude: number, latitude: number, polygon: Cartographic[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (isPointOnSegment(longitude, latitude, previousPoint, currentPoint)) {
      return true;
    }

    const intersects =
      currentPoint.latitude > latitude !== previousPoint.latitude > latitude &&
      longitude <
        ((previousPoint.longitude - currentPoint.longitude) *
          (latitude - currentPoint.latitude)) /
          (previousPoint.latitude - currentPoint.latitude) +
          currentPoint.longitude;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointOnSegment(
  longitude: number,
  latitude: number,
  start: Cartographic,
  end: Cartographic
): boolean {
  const cross =
    (latitude - start.latitude) * (end.longitude - start.longitude) -
    (longitude - start.longitude) * (end.latitude - start.latitude);
  if (Math.abs(cross) > 1e-12) {
    return false;
  }

  return (
    longitude >= Math.min(start.longitude, end.longitude) - 1e-12 &&
    longitude <= Math.max(start.longitude, end.longitude) + 1e-12 &&
    latitude >= Math.min(start.latitude, end.latitude) - 1e-12 &&
    latitude <= Math.max(start.latitude, end.latitude) + 1e-12
  );
}

function validateArea(polygon: Cartographic[]): void {
  if (polygon.length < 3) {
    throw new Error("Terrain analysis requires an area with at least three positions.");
  }
}

function normalizeSampleStep(sampleStep: number | undefined): number {
  const step = sampleStep ?? defaultSampleStep;
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error("Terrain sampleStep must be a positive finite number.");
  }
  return step;
}

function normalizeMaxSamples(maxSamples: number | undefined): number {
  const value = maxSamples ?? defaultMaxSamples;
  if (!Number.isFinite(value) || value < 4) {
    throw new Error("Terrain maxSamples must be at least 4.");
  }
  return Math.floor(value);
}

function normalizeContourInterval(interval: number): number {
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("Contour interval must be a positive finite number.");
  }
  return interval;
}

export function getApproximateSampleArea(grid: TerrainSampleGrid): number {
  return grid.sampleStep * grid.sampleStep;
}

function normalizeAnalysisHeight(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Terrain ${label} must be a finite number.`);
  }
  return value;
}

function normalizeOptionalDepth(depth: number | undefined): number | undefined {
  if (depth === undefined) {
    return undefined;
  }
  if (!Number.isFinite(depth) || depth <= 0) {
    throw new Error("Excavation depth must be a positive finite number.");
  }
  return depth;
}

function cartographicFromPosition(position: Cartesian3): Cartographic {
  const cartographic = Cartographic.fromCartesian(position);
  if (!cartographic) {
    throw new Error("Terrain position cannot be converted to cartographic coordinates.");
  }
  return cartographic;
}

function sampleKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function interpolate(start: number, end: number, index: number, count: number): number {
  if (count <= 1) {
    return start;
  }
  return start + ((end - start) * index) / (count - 1);
}

function lerp(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}
