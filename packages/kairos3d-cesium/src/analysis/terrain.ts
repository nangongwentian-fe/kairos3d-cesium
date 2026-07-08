import {
  Cartesian3,
  ConstantProperty,
  type Entity
} from "cesium";
import type { KairosMap } from "../core";
import { Evented } from "../core/events";
import {
  deserializePosition,
  deserializePositions,
  parseSnapshotDate,
  serializePosition,
  serializePositions,
  type RuntimeResultLoadOptions
} from "../core/serialization";
import { lineStyleWithHeight, serializeHeightOptions } from "../height";
import type { ResultSymbolStyle } from "../style";
import {
  createLineGraphics,
  createPolygonGraphics,
  serializeSymbolStyle
} from "../style";
import type { Tool } from "../tools";
import {
  calculateCutFillVolume,
  calculateExcavationVolume,
  calculateFloodVolume,
  computeSlopeAspectGrid,
  createContourLines,
  createTerrainSampleGrid,
  getHeightRange,
  getSlopeRange,
  resolveExcavationBottomHeight
} from "./terrain-utils";
import type {
  ContourDrawOptions,
  ContourLine,
  ContourLineSnapshot,
  ContourOptions,
  ContourResult,
  ContourResultSnapshot,
  ExcavationOptions,
  ExcavationResult,
  ExcavationResultSnapshot,
  FloodOptions,
  FloodResult,
  FloodResultSnapshot,
  SlopeAspectOptions,
  SlopeAspectResult,
  SlopeAspectResultSnapshot,
  TerrainGridSample,
  TerrainGridSampleSnapshot,
  TerrainResult,
  TerrainResultSnapshot,
  TerrainSampleGrid,
  TerrainSampleGridSnapshot,
  VolumeOptions,
  VolumeResult,
  VolumeResultSnapshot
} from "./types";

export interface TerrainAnalysisManagerEvents {
  add: TerrainResult;
  remove: TerrainResult;
  clear: TerrainResult[];
}

export class TerrainAnalysisManager extends Evented<TerrainAnalysisManagerEvents> {
  private readonly results = new Map<string, TerrainResult>();

  constructor(private readonly map: KairosMap) {
    super();
  }

  async slopeAspect(options: SlopeAspectOptions): Promise<SlopeAspectResult> {
    const grid = computeSlopeAspectGrid(
      await createTerrainSampleGrid(this.map.viewer.terrainProvider, options.area, options)
    );
    const range = getSlopeRange(grid);
    const style = this.map.styles.resolveTerrainStyle("slope-aspect", options.style);
    const result: SlopeAspectResult = {
      id: createTerrainAnalysisId("slope-aspect"),
      type: "slope-aspect",
      area: clonePositions(options.area),
      grid,
      minSlope: range.minSlope,
      maxSlope: range.maxSlope,
      averageSlope: range.averageSlope,
      entities: renderAreaEntities(this.map, options.area, style, options.height),
      createdAt: new Date(),
      style,
      height: serializeHeightOptions(options.height)
    };

    this.addResult(result);
    return result;
  }

  async volume(options: VolumeOptions): Promise<VolumeResult> {
    const grid = await createTerrainSampleGrid(
      this.map.viewer.terrainProvider,
      options.area,
      options
    );
    const range = getHeightRange(grid);
    const volume = calculateCutFillVolume(grid, options.baseHeight);
    const style = this.map.styles.resolveTerrainStyle("volume", options.style);
    const result: VolumeResult = {
      id: createTerrainAnalysisId("volume"),
      type: "volume",
      area: clonePositions(options.area),
      grid,
      baseHeight: options.baseHeight,
      cutVolume: volume.cutVolume,
      fillVolume: volume.fillVolume,
      netVolume: volume.netVolume,
      sampleArea: volume.sampleArea,
      minHeight: range.minHeight,
      maxHeight: range.maxHeight,
      entities: renderAreaEntities(this.map, options.area, style, options.height),
      createdAt: new Date(),
      style,
      height: serializeHeightOptions(options.height)
    };

    this.addResult(result);
    return result;
  }

  async flood(options: FloodOptions): Promise<FloodResult> {
    const grid = await createTerrainSampleGrid(
      this.map.viewer.terrainProvider,
      options.area,
      options
    );
    const range = getHeightRange(grid);
    const flood = calculateFloodVolume(grid, options.waterHeight);
    const style = this.map.styles.resolveTerrainStyle("flood", options.style);
    const result: FloodResult = {
      id: createTerrainAnalysisId("flood"),
      type: "flood",
      area: clonePositions(options.area),
      grid,
      waterHeight: options.waterHeight,
      floodedArea: flood.floodedArea,
      waterVolume: flood.waterVolume,
      sampleArea: flood.sampleArea,
      minHeight: range.minHeight,
      maxHeight: range.maxHeight,
      entities: renderAreaEntities(this.map, options.area, style, options.height),
      createdAt: new Date(),
      style,
      height: serializeHeightOptions(options.height)
    };

    this.addResult(result);
    return result;
  }

  async excavation(options: ExcavationOptions): Promise<ExcavationResult> {
    const grid = await createTerrainSampleGrid(
      this.map.viewer.terrainProvider,
      options.area,
      options
    );
    const range = getHeightRange(grid);
    const plane = resolveExcavationBottomHeight(grid, options);
    const excavation = calculateExcavationVolume(grid, plane.bottomHeight);
    const style = this.map.styles.resolveTerrainStyle("excavation", options.style);
    const result: ExcavationResult = {
      id: createTerrainAnalysisId("excavation"),
      type: "excavation",
      area: clonePositions(options.area),
      grid,
      bottomHeight: plane.bottomHeight,
      depth: plane.depth,
      cutVolume: excavation.cutVolume,
      sampleArea: excavation.sampleArea,
      minHeight: range.minHeight,
      maxHeight: range.maxHeight,
      entities: renderAreaEntities(this.map, options.area, style, options.height),
      createdAt: new Date(),
      style,
      height: serializeHeightOptions(options.height)
    };

    this.addResult(result);
    return result;
  }

  async contour(options: ContourOptions): Promise<ContourResult> {
    const grid = await createTerrainSampleGrid(
      this.map.viewer.terrainProvider,
      options.area,
      options
    );
    const contour = createContourLines(grid, options.interval);
    const style = this.map.styles.resolveTerrainStyle("contour", options.style);
    const result: ContourResult = {
      id: createTerrainAnalysisId("contour"),
      type: "contour",
      area: clonePositions(options.area),
      interval: options.interval,
      sampleStep: grid.sampleStep,
      lines: contour.lines,
      minHeight: contour.minHeight,
      maxHeight: contour.maxHeight,
      entities: renderContourEntities(this.map, contour.lines, style, options.height),
      createdAt: new Date(),
      style,
      height: serializeHeightOptions(options.height)
    };

    this.addResult(result);
    return result;
  }

  drawContour(options?: ContourDrawOptions): Promise<Tool<ContourDrawOptions>> {
    return this.map.tools.start("analysis.terrain.drawContour", options);
  }

  addResult(result: TerrainResult): TerrainResult {
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): TerrainResult | undefined {
    return this.results.get(id);
  }

  list(): TerrainResult[] {
    return [...this.results.values()];
  }

  toJSON(): TerrainResultSnapshot[] {
    return this.list().map(terrainResultToSnapshot);
  }

  async load(
    snapshots: TerrainResultSnapshot[],
    options: RuntimeResultLoadOptions = {}
  ): Promise<TerrainResult[]> {
    if (options.clear) {
      this.clear();
    }

    return snapshots.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  setStyle(id: string, style: ResultSymbolStyle): TerrainResult {
    const result = this.requireResult(id);
    removeEntities(this.map, result.entities);
    result.style = this.map.styles.resolveTerrainStyle(result.type, style);
    result.entities = renderTerrainResultEntities(this.map, result);
    return result;
  }

  remove(id: string): boolean {
    const result = this.results.get(id);
    if (!result) {
      return false;
    }

    removeEntities(this.map, result.entities);
    this.results.delete(id);
    this.emit("remove", result);
    this.map.tools.emitClear({ source: "terrain", ids: [id] });
    return true;
  }

  clear(): void {
    const removed = [...this.results.values()];
    for (const result of removed) {
      removeEntities(this.map, result.entities);
      this.emit("remove", result);
    }

    this.results.clear();
    this.emit("clear", removed);
    this.map.tools.emitClear({
      source: "terrain",
      ids: removed.map((result) => result.id)
    });
  }

  destroy(): void {
    this.clear();
    this.off();
  }

  private restoreSnapshot(snapshot: TerrainResultSnapshot): TerrainResult {
    if (this.results.has(snapshot.id)) {
      this.remove(snapshot.id);
    }

    const result = restoreTerrainSnapshot(this.map, snapshot);
    return this.addResult(result);
  }

  private requireResult(id: string): TerrainResult {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Terrain analysis result "${id}" does not exist.`);
    }
    return result;
  }
}

function renderAreaEntities(
  map: KairosMap,
  area: Cartesian3[],
  style: ResultSymbolStyle,
  height?: TerrainResult["height"]
): Entity[] {
  const entities = [
    map.viewer.entities.add({
      polygon: createPolygonGraphics(new ConstantProperty(area), style.polygon)
    })
  ];

  if (style.line && area.length >= 2) {
    entities.push(
      map.viewer.entities.add({
        polyline: createLineGraphics([...area, area[0]], lineStyleWithHeight(style.line, height))
      })
    );
  }

  return entities;
}

function renderTerrainResultEntities(map: KairosMap, result: TerrainResult): Entity[] {
  if (result.type === "contour") {
    return renderContourEntities(map, result.lines, result.style ?? {}, result.height);
  }

  return renderAreaEntities(map, result.area, result.style ?? {}, result.height);
}

function renderContourEntities(
  map: KairosMap,
  lines: ContourLine[],
  style: ResultSymbolStyle,
  height?: ContourResult["height"]
): Entity[] {
  return lines.map((line) =>
    map.viewer.entities.add({
      polyline: createLineGraphics(line.positions, lineStyleWithHeight(style.line, height))
    })
  );
}

function slopeAspectToSnapshot(result: SlopeAspectResult): SlopeAspectResultSnapshot {
  return {
    id: result.id,
    type: "slope-aspect",
    area: serializePositions(result.area),
    grid: serializeGrid(result.grid),
    minSlope: result.minSlope,
    maxSlope: result.maxSlope,
    averageSlope: result.averageSlope,
    createdAt: result.createdAt.toISOString(),
    style: serializeSymbolStyle(result.style),
    height: serializeHeightOptions(result.height)
  };
}

function contourToSnapshot(result: ContourResult): ContourResultSnapshot {
  return {
    id: result.id,
    type: "contour",
    area: serializePositions(result.area),
    interval: result.interval,
    sampleStep: result.sampleStep,
    lines: result.lines.map(serializeContourLine),
    minHeight: result.minHeight,
    maxHeight: result.maxHeight,
    createdAt: result.createdAt.toISOString(),
    style: serializeSymbolStyle(result.style),
    height: serializeHeightOptions(result.height)
  };
}

function volumeToSnapshot(result: VolumeResult): VolumeResultSnapshot {
  return {
    id: result.id,
    type: "volume",
    area: serializePositions(result.area),
    grid: serializeGrid(result.grid),
    baseHeight: result.baseHeight,
    cutVolume: result.cutVolume,
    fillVolume: result.fillVolume,
    netVolume: result.netVolume,
    sampleArea: result.sampleArea,
    minHeight: result.minHeight,
    maxHeight: result.maxHeight,
    createdAt: result.createdAt.toISOString(),
    style: serializeSymbolStyle(result.style),
    height: serializeHeightOptions(result.height)
  };
}

function floodToSnapshot(result: FloodResult): FloodResultSnapshot {
  return {
    id: result.id,
    type: "flood",
    area: serializePositions(result.area),
    grid: serializeGrid(result.grid),
    waterHeight: result.waterHeight,
    floodedArea: result.floodedArea,
    waterVolume: result.waterVolume,
    sampleArea: result.sampleArea,
    minHeight: result.minHeight,
    maxHeight: result.maxHeight,
    createdAt: result.createdAt.toISOString(),
    style: serializeSymbolStyle(result.style),
    height: serializeHeightOptions(result.height)
  };
}

function excavationToSnapshot(result: ExcavationResult): ExcavationResultSnapshot {
  return {
    id: result.id,
    type: "excavation",
    area: serializePositions(result.area),
    grid: serializeGrid(result.grid),
    bottomHeight: result.bottomHeight,
    depth: result.depth,
    cutVolume: result.cutVolume,
    sampleArea: result.sampleArea,
    minHeight: result.minHeight,
    maxHeight: result.maxHeight,
    createdAt: result.createdAt.toISOString(),
    style: serializeSymbolStyle(result.style),
    height: serializeHeightOptions(result.height)
  };
}

function terrainResultToSnapshot(result: TerrainResult): TerrainResultSnapshot {
  switch (result.type) {
    case "slope-aspect":
      return slopeAspectToSnapshot(result);
    case "contour":
      return contourToSnapshot(result);
    case "volume":
      return volumeToSnapshot(result);
    case "flood":
      return floodToSnapshot(result);
    case "excavation":
      return excavationToSnapshot(result);
  }
}

function restoreSlopeAspect(
  map: KairosMap,
  snapshot: SlopeAspectResultSnapshot
): SlopeAspectResult {
  const area = deserializePositions(snapshot.area);
  const grid = deserializeGrid(snapshot.grid);
  const style = map.styles.resolveTerrainStyle("slope-aspect", snapshot.style);
  const height = serializeHeightOptions(snapshot.height);
  return {
    id: snapshot.id,
    type: "slope-aspect",
    area,
    grid,
    minSlope: snapshot.minSlope,
    maxSlope: snapshot.maxSlope,
    averageSlope: snapshot.averageSlope,
    entities: renderAreaEntities(map, area, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreContour(map: KairosMap, snapshot: ContourResultSnapshot): ContourResult {
  const area = deserializePositions(snapshot.area);
  const lines = snapshot.lines.map(deserializeContourLine);
  const style = map.styles.resolveTerrainStyle("contour", snapshot.style);
  const height = serializeHeightOptions(snapshot.height);
  return {
    id: snapshot.id,
    type: "contour",
    area,
    interval: snapshot.interval,
    sampleStep: snapshot.sampleStep,
    lines,
    minHeight: snapshot.minHeight,
    maxHeight: snapshot.maxHeight,
    entities: renderContourEntities(map, lines, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreVolume(map: KairosMap, snapshot: VolumeResultSnapshot): VolumeResult {
  const area = deserializePositions(snapshot.area);
  const grid = deserializeGrid(snapshot.grid);
  const style = map.styles.resolveTerrainStyle("volume", snapshot.style);
  const height = serializeHeightOptions(snapshot.height);
  return {
    id: snapshot.id,
    type: "volume",
    area,
    grid,
    baseHeight: snapshot.baseHeight,
    cutVolume: snapshot.cutVolume,
    fillVolume: snapshot.fillVolume,
    netVolume: snapshot.netVolume,
    sampleArea: snapshot.sampleArea,
    minHeight: snapshot.minHeight,
    maxHeight: snapshot.maxHeight,
    entities: renderAreaEntities(map, area, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreFlood(map: KairosMap, snapshot: FloodResultSnapshot): FloodResult {
  const area = deserializePositions(snapshot.area);
  const grid = deserializeGrid(snapshot.grid);
  const style = map.styles.resolveTerrainStyle("flood", snapshot.style);
  const height = serializeHeightOptions(snapshot.height);
  return {
    id: snapshot.id,
    type: "flood",
    area,
    grid,
    waterHeight: snapshot.waterHeight,
    floodedArea: snapshot.floodedArea,
    waterVolume: snapshot.waterVolume,
    sampleArea: snapshot.sampleArea,
    minHeight: snapshot.minHeight,
    maxHeight: snapshot.maxHeight,
    entities: renderAreaEntities(map, area, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreExcavation(
  map: KairosMap,
  snapshot: ExcavationResultSnapshot
): ExcavationResult {
  const area = deserializePositions(snapshot.area);
  const grid = deserializeGrid(snapshot.grid);
  const style = map.styles.resolveTerrainStyle("excavation", snapshot.style);
  const height = serializeHeightOptions(snapshot.height);
  return {
    id: snapshot.id,
    type: "excavation",
    area,
    grid,
    bottomHeight: snapshot.bottomHeight,
    depth: snapshot.depth,
    cutVolume: snapshot.cutVolume,
    sampleArea: snapshot.sampleArea,
    minHeight: snapshot.minHeight,
    maxHeight: snapshot.maxHeight,
    entities: renderAreaEntities(map, area, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreTerrainSnapshot(
  map: KairosMap,
  snapshot: TerrainResultSnapshot
): TerrainResult {
  switch (snapshot.type) {
    case "slope-aspect":
      return restoreSlopeAspect(map, snapshot);
    case "contour":
      return restoreContour(map, snapshot);
    case "volume":
      return restoreVolume(map, snapshot);
    case "flood":
      return restoreFlood(map, snapshot);
    case "excavation":
      return restoreExcavation(map, snapshot);
  }
}

function serializeGrid(grid: TerrainSampleGrid): TerrainSampleGridSnapshot {
  return {
    area: serializePositions(grid.area),
    rows: grid.rows,
    columns: grid.columns,
    sampleStep: grid.sampleStep,
    samples: grid.samples.map(serializeGridSample),
    sampled: grid.sampled
  };
}

function deserializeGrid(snapshot: TerrainSampleGridSnapshot): TerrainSampleGrid {
  return {
    area: deserializePositions(snapshot.area),
    rows: snapshot.rows,
    columns: snapshot.columns,
    sampleStep: snapshot.sampleStep,
    samples: snapshot.samples.map(deserializeGridSample),
    sampled: snapshot.sampled
  };
}

function serializeGridSample(sample: TerrainGridSample): TerrainGridSampleSnapshot {
  return {
    row: sample.row,
    column: sample.column,
    position: serializePosition(sample.position),
    height: sample.height,
    sampled: sample.sampled,
    slope: sample.slope,
    aspect: sample.aspect
  };
}

function deserializeGridSample(snapshot: TerrainGridSampleSnapshot): TerrainGridSample {
  return {
    row: snapshot.row,
    column: snapshot.column,
    position: deserializePosition(snapshot.position),
    height: snapshot.height,
    sampled: snapshot.sampled,
    slope: snapshot.slope,
    aspect: snapshot.aspect
  };
}

function serializeContourLine(line: ContourLine): ContourLineSnapshot {
  return {
    height: line.height,
    positions: serializePositions(line.positions)
  };
}

function deserializeContourLine(snapshot: ContourLineSnapshot): ContourLine {
  return {
    height: snapshot.height,
    positions: deserializePositions(snapshot.positions)
  };
}

function removeEntities(map: KairosMap, entities: Entity[]): void {
  for (const entity of entities) {
    map.viewer.entities.remove(entity);
  }
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function createTerrainAnalysisId(type: TerrainResult["type"]): string {
  return `analysis-terrain-${type}-${Math.random().toString(36).slice(2, 10)}`;
}
