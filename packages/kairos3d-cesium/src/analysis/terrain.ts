import {
  Cartesian3,
  ConstantProperty,
  Entity
} from "cesium";
import type { KairosMap } from "../core";
import {
  removeEntityIfOwned,
  removeEntityIfOwnedTracked
} from "../core/entity-collection";
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
import type { PreparedSceneStage } from "../scene/transaction";
import {
  runOrReuseOperation,
  type OperationContext
} from "../operations/manager";
import type { AsyncOperationOptions } from "../operations/types";
import {
  calculateCutFillVolume,
  calculateExcavationVolume,
  calculateFloodVolume,
  calculateTerrainArea,
  computeSlopeAspectGrid,
  createContourLines,
  createTerrainSampleGrid,
  getHeightRange,
  getSlopeRange,
  resolveExcavationBottomHeight,
  resolveTerrainAreaMode,
  resolveTerrainVolumeMode
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
  TerrainVolumeMode,
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

  slopeAspect(
    options: SlopeAspectOptions,
    operationOptions?: AsyncOperationOptions
  ): Promise<SlopeAspectResult> {
    return this.runCompute("slope-aspect", operationOptions, async (operation, commit) => {
      reportOperationProgress(operation, 0.05, "terrain-sampling");
      const sampledGrid = await createTerrainSampleGrid(
        this.map.viewer.terrainProvider,
        options.area,
        options
      );
      operation.throwIfAborted();
      reportOperationProgress(operation, 0.55, "calculate");
      const grid = computeSlopeAspectGrid(sampledGrid);
      const range = getSlopeRange(grid);
      const style = this.map.styles.resolveTerrainStyle("slope-aspect", options.style);
      reportOperationProgress(operation, 0.9, "render");
      return commit({
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
      });
    });
  }

  volume(
    options: VolumeOptions,
    operationOptions?: AsyncOperationOptions
  ): Promise<VolumeResult> {
    return this.runCompute("volume", operationOptions, async (operation, commit) => {
      reportOperationProgress(operation, 0.05, "terrain-sampling");
      const grid = await createTerrainSampleGrid(
        this.map.viewer.terrainProvider,
        options.area,
        options
      );
      operation.throwIfAborted();
      reportOperationProgress(operation, 0.55, "calculate");
      const range = getHeightRange(grid);
      const volume = calculateCutFillVolume(
        grid,
        options.baseHeight,
        resolveTerrainVolumeMode(options.precision)
      );
      const style = this.map.styles.resolveTerrainStyle("volume", options.style);
      reportOperationProgress(operation, 0.9, "render");
      return commit({
        id: createTerrainAnalysisId("volume"),
        type: "volume",
        area: clonePositions(options.area),
        grid,
        baseHeight: options.baseHeight,
        cutVolume: volume.cutVolume,
        fillVolume: volume.fillVolume,
        netVolume: volume.netVolume,
        sampleArea: volume.sampleArea,
        surfaceArea: volume.surfaceArea,
        calculationMode: volume.calculationMode,
        minHeight: range.minHeight,
        maxHeight: range.maxHeight,
        entities: renderAreaEntities(this.map, options.area, style, options.height),
        createdAt: new Date(),
        style,
        height: serializeHeightOptions(options.height)
      });
    });
  }

  flood(
    options: FloodOptions,
    operationOptions?: AsyncOperationOptions
  ): Promise<FloodResult> {
    return this.runCompute("flood", operationOptions, async (operation, commit) => {
      reportOperationProgress(operation, 0.05, "terrain-sampling");
      const grid = await createTerrainSampleGrid(
        this.map.viewer.terrainProvider,
        options.area,
        options
      );
      operation.throwIfAborted();
      reportOperationProgress(operation, 0.55, "calculate");
      const range = getHeightRange(grid);
      const flood = calculateFloodVolume(
        grid,
        options.waterHeight,
        resolveTerrainVolumeMode(options.precision)
      );
      const style = this.map.styles.resolveTerrainStyle("flood", options.style);
      reportOperationProgress(operation, 0.9, "render");
      return commit({
        id: createTerrainAnalysisId("flood"),
        type: "flood",
        area: clonePositions(options.area),
        grid,
        waterHeight: options.waterHeight,
        floodedArea: flood.floodedArea,
        waterVolume: flood.waterVolume,
        sampleArea: flood.sampleArea,
        surfaceArea: flood.surfaceArea,
        calculationMode: flood.calculationMode,
        minHeight: range.minHeight,
        maxHeight: range.maxHeight,
        entities: renderAreaEntities(this.map, options.area, style, options.height),
        createdAt: new Date(),
        style,
        height: serializeHeightOptions(options.height)
      });
    });
  }

  excavation(
    options: ExcavationOptions,
    operationOptions?: AsyncOperationOptions
  ): Promise<ExcavationResult> {
    return this.runCompute("excavation", operationOptions, async (operation, commit) => {
      reportOperationProgress(operation, 0.05, "terrain-sampling");
      const grid = await createTerrainSampleGrid(
        this.map.viewer.terrainProvider,
        options.area,
        options
      );
      operation.throwIfAborted();
      reportOperationProgress(operation, 0.55, "calculate");
      const range = getHeightRange(grid);
      const plane = resolveExcavationBottomHeight(grid, options);
      const excavation = calculateExcavationVolume(
        grid,
        plane.bottomHeight,
        resolveTerrainVolumeMode(options.precision)
      );
      const style = this.map.styles.resolveTerrainStyle("excavation", options.style);
      reportOperationProgress(operation, 0.9, "render");
      return commit({
        id: createTerrainAnalysisId("excavation"),
        type: "excavation",
        area: clonePositions(options.area),
        grid,
        bottomHeight: plane.bottomHeight,
        depth: plane.depth,
        cutVolume: excavation.cutVolume,
        sampleArea: excavation.sampleArea,
        surfaceArea: excavation.surfaceArea,
        calculationMode: excavation.calculationMode,
        minHeight: range.minHeight,
        maxHeight: range.maxHeight,
        entities: renderAreaEntities(this.map, options.area, style, options.height),
        createdAt: new Date(),
        style,
        height: serializeHeightOptions(options.height)
      });
    });
  }

  contour(
    options: ContourOptions,
    operationOptions?: AsyncOperationOptions
  ): Promise<ContourResult> {
    return this.runCompute("contour", operationOptions, async (operation, commit) => {
      reportOperationProgress(operation, 0.05, "terrain-sampling");
      const grid = await createTerrainSampleGrid(
        this.map.viewer.terrainProvider,
        options.area,
        options
      );
      operation.throwIfAborted();
      reportOperationProgress(operation, 0.55, "calculate");
      const contour = createContourLines(grid, options.interval);
      const style = this.map.styles.resolveTerrainStyle("contour", options.style);
      reportOperationProgress(operation, 0.9, "render");
      return commit({
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
      });
    });
  }

  drawContour(options?: ContourDrawOptions): Promise<Tool<ContourDrawOptions>> {
    return this.map.tools.start("analysis.terrain.drawContour", options);
  }

  addResult(result: TerrainResult): TerrainResult {
    const existing = this.results.get(result.id);
    if (existing === result) {
      return result;
    }
    if (existing) {
      this.remove(result.id);
    }
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
    validateTerrainSnapshots(this.map, snapshots);
    if (options.clear) {
      this.clear();
    }

    return snapshots.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  /** @internal */
  async prepareSceneLoad(
    snapshots: TerrainResultSnapshot[],
    options: RuntimeResultLoadOptions = {}
  ): Promise<PreparedSceneStage> {
    validateTerrainSnapshots(this.map, snapshots);
    const clear = options.clear ?? false;
    if (!clear) {
      for (const snapshot of snapshots) {
        if (this.results.has(snapshot.id)) {
          throw new Error(
            `Terrain result "${snapshot.id}" already exists during transactional merge.`
          );
        }
      }
    }
    const staged = snapshots.map((snapshot) =>
      restoreTerrainSnapshot(this.map, snapshot, true)
    );
    const previous = clear ? this.list() : [];
    let commitStarted = false;
    let mapsSwapped = false;
    let rolledBack = false;
    let finalized = false;
    let disposed = false;
    let published = false;
    const detachedPreviousEntities: Entity[] = [];

    return {
      phase: "terrain",
      commit: () => {
        assertTerrainBaseUnchanged(this.results, previous, staged, clear);
        commitStarted = true;
        for (const result of previous) {
          removeEntitiesTracked(
            this.map,
            result.entities,
            detachedPreviousEntities
          );
        }
        for (const result of staged) attachEntities(this.map, result.entities);
        if (clear) this.results.clear();
        for (const result of staged) this.results.set(result.id, result);
        mapsSwapped = true;
      },
      rollback: () => {
        if (!commitStarted || rolledBack || finalized || disposed) return;
        const errors: unknown[] = [];
        for (const result of [...staged].reverse()) {
          try { removeEntities(this.map, result.entities); } catch (error) { errors.push(error); }
        }
        if (mapsSwapped) {
          for (const result of staged) this.results.delete(result.id);
        }
        for (const entity of detachedPreviousEntities) {
          try { this.map.viewer.entities.add(entity); } catch (error) { errors.push(error); }
        }
        for (const result of previous) {
          this.results.set(result.id, result);
        }
        detachedPreviousEntities.length = 0;
        mapsSwapped = false;
        rolledBack = true;
        if (errors.length) throw new AggregateError(errors, "Failed to roll back terrain results.");
      },
      finalize: () => { finalized = true; },
      dispose: () => {
        if (disposed || finalized) return;
        for (const result of [...staged].reverse()) removeEntities(this.map, result.entities);
        disposed = true;
      },
      publish: () => {
        if (published) return;
        if (clear) {
          for (const result of previous) this.emit("remove", result);
          this.emit("clear", previous);
          this.map.tools.emitClear({ source: "terrain", ids: previous.map((item) => item.id) });
        }
        for (const result of staged) this.emit("add", result);
        published = true;
      }
    };
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

  private runCompute<T extends TerrainResult>(
    type: TerrainResult["type"],
    operationOptions: AsyncOperationOptions | undefined,
    task: (
      operation: OperationContext,
      commit: (result: T) => T
    ) => Promise<T>
  ): Promise<T> {
    let renderedResult: T | undefined;
    return runOrReuseOperation(
      this.map.operations,
      { kind: `analysis.terrain.${type}` },
      operationOptions,
      (operation) =>
        task(operation, (result) => {
          renderedResult = result;
          operation.throwIfAborted();
          this.addResult(result);
          operation.throwIfAborted();
          return result;
        })
    ).catch((error) => {
      rollbackTerrainResult(this, this.map, renderedResult);
      throw error;
    });
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
  const entities = createAreaEntities(area, style, height);
  attachEntities(map, entities);
  return entities;
}

function createAreaEntities(
  area: Cartesian3[],
  style: ResultSymbolStyle,
  height?: TerrainResult["height"]
): Entity[] {
  const entities = [
    new Entity({
      polygon: createPolygonGraphics(new ConstantProperty(area), style.polygon)
    })
  ];

  if (style.line && area.length >= 2) {
    entities.push(
      new Entity({
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
  const entities = createContourEntities(lines, style, height);
  attachEntities(map, entities);
  return entities;
}

function createContourEntities(
  lines: ContourLine[],
  style: ResultSymbolStyle,
  height?: ContourResult["height"]
): Entity[] {
  return lines.map((line) =>
    new Entity({
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
    surfaceArea: result.surfaceArea,
    calculationMode: result.calculationMode,
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
    surfaceArea: result.surfaceArea,
    calculationMode: result.calculationMode,
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
    surfaceArea: result.surfaceArea,
    calculationMode: result.calculationMode,
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
  snapshot: SlopeAspectResultSnapshot,
  detached = false
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
    entities: detached
      ? createAreaEntities(area, style, height)
      : renderAreaEntities(map, area, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreContour(
  map: KairosMap,
  snapshot: ContourResultSnapshot,
  detached = false
): ContourResult {
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
    entities: detached
      ? createContourEntities(lines, style, height)
      : renderContourEntities(map, lines, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreVolume(
  map: KairosMap,
  snapshot: VolumeResultSnapshot,
  detached = false
): VolumeResult {
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
    surfaceArea: snapshot.surfaceArea ?? calculateRestoredSurfaceArea(grid, snapshot.calculationMode),
    calculationMode: snapshot.calculationMode ?? "sample-cell",
    minHeight: snapshot.minHeight,
    maxHeight: snapshot.maxHeight,
    entities: detached
      ? createAreaEntities(area, style, height)
      : renderAreaEntities(map, area, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreFlood(
  map: KairosMap,
  snapshot: FloodResultSnapshot,
  detached = false
): FloodResult {
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
    surfaceArea: snapshot.surfaceArea ?? calculateRestoredSurfaceArea(grid, snapshot.calculationMode),
    calculationMode: snapshot.calculationMode ?? "sample-cell",
    minHeight: snapshot.minHeight,
    maxHeight: snapshot.maxHeight,
    entities: detached
      ? createAreaEntities(area, style, height)
      : renderAreaEntities(map, area, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreExcavation(
  map: KairosMap,
  snapshot: ExcavationResultSnapshot,
  detached = false
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
    surfaceArea: snapshot.surfaceArea ?? calculateRestoredSurfaceArea(grid, snapshot.calculationMode),
    calculationMode: snapshot.calculationMode ?? "sample-cell",
    minHeight: snapshot.minHeight,
    maxHeight: snapshot.maxHeight,
    entities: detached
      ? createAreaEntities(area, style, height)
      : renderAreaEntities(map, area, style, height),
    createdAt: parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt"),
    style,
    height
  };
}

function restoreTerrainSnapshot(
  map: KairosMap,
  snapshot: TerrainResultSnapshot,
  detached = false
): TerrainResult {
  switch (snapshot.type) {
    case "slope-aspect":
      return restoreSlopeAspect(map, snapshot, detached);
    case "contour":
      return restoreContour(map, snapshot, detached);
    case "volume":
      return restoreVolume(map, snapshot, detached);
    case "flood":
      return restoreFlood(map, snapshot, detached);
    case "excavation":
      return restoreExcavation(map, snapshot, detached);
  }
}

function validateTerrainSnapshots(
  map: KairosMap,
  snapshots: TerrainResultSnapshot[]
): void {
  const ids = new Set<string>();
  for (const snapshot of snapshots) {
    if (ids.has(snapshot.id)) {
      throw new Error(`Terrain result snapshot id "${snapshot.id}" is duplicated.`);
    }
    ids.add(snapshot.id);
    validateTerrainSnapshot(map, snapshot);
  }
}

function validateTerrainSnapshot(map: KairosMap, snapshot: TerrainResultSnapshot): void {
  parseSnapshotDate(snapshot.createdAt, "Terrain result createdAt");
  serializeHeightOptions(snapshot.height);

  switch (snapshot.type) {
    case "slope-aspect":
      deserializePositions(snapshot.area);
      deserializeGrid(snapshot.grid);
      map.styles.resolveTerrainStyle("slope-aspect", snapshot.style);
      assertFiniteTerrainSnapshotNumber(snapshot.minSlope, "Terrain minSlope");
      assertFiniteTerrainSnapshotNumber(snapshot.maxSlope, "Terrain maxSlope");
      assertFiniteTerrainSnapshotNumber(snapshot.averageSlope, "Terrain averageSlope");
      return;
    case "contour":
      deserializePositions(snapshot.area);
      snapshot.lines.map(deserializeContourLine);
      map.styles.resolveTerrainStyle("contour", snapshot.style);
      assertFiniteTerrainSnapshotNumber(snapshot.interval, "Terrain contour interval");
      assertFiniteTerrainSnapshotNumber(snapshot.sampleStep, "Terrain contour sampleStep");
      assertFiniteTerrainSnapshotNumber(snapshot.minHeight, "Terrain minHeight");
      assertFiniteTerrainSnapshotNumber(snapshot.maxHeight, "Terrain maxHeight");
      return;
    case "volume":
      deserializePositions(snapshot.area);
      deserializeGrid(snapshot.grid);
      map.styles.resolveTerrainStyle("volume", snapshot.style);
      assertFiniteTerrainSnapshotNumber(snapshot.baseHeight, "Terrain baseHeight");
      assertFiniteTerrainSnapshotNumber(snapshot.cutVolume, "Terrain cutVolume");
      assertFiniteTerrainSnapshotNumber(snapshot.fillVolume, "Terrain fillVolume");
      assertFiniteTerrainSnapshotNumber(snapshot.netVolume, "Terrain netVolume");
      assertFiniteTerrainSnapshotNumber(snapshot.sampleArea, "Terrain sampleArea");
      assertOptionalFiniteTerrainSnapshotNumber(snapshot.surfaceArea, "Terrain surfaceArea");
      assertFiniteTerrainSnapshotNumber(snapshot.minHeight, "Terrain minHeight");
      assertFiniteTerrainSnapshotNumber(snapshot.maxHeight, "Terrain maxHeight");
      return;
    case "flood":
      deserializePositions(snapshot.area);
      deserializeGrid(snapshot.grid);
      map.styles.resolveTerrainStyle("flood", snapshot.style);
      assertFiniteTerrainSnapshotNumber(snapshot.waterHeight, "Terrain waterHeight");
      assertFiniteTerrainSnapshotNumber(snapshot.floodedArea, "Terrain floodedArea");
      assertFiniteTerrainSnapshotNumber(snapshot.waterVolume, "Terrain waterVolume");
      assertFiniteTerrainSnapshotNumber(snapshot.sampleArea, "Terrain sampleArea");
      assertOptionalFiniteTerrainSnapshotNumber(snapshot.surfaceArea, "Terrain surfaceArea");
      assertFiniteTerrainSnapshotNumber(snapshot.minHeight, "Terrain minHeight");
      assertFiniteTerrainSnapshotNumber(snapshot.maxHeight, "Terrain maxHeight");
      return;
    case "excavation":
      deserializePositions(snapshot.area);
      deserializeGrid(snapshot.grid);
      map.styles.resolveTerrainStyle("excavation", snapshot.style);
      assertFiniteTerrainSnapshotNumber(snapshot.bottomHeight, "Terrain bottomHeight");
      assertOptionalFiniteTerrainSnapshotNumber(snapshot.depth, "Terrain depth");
      assertFiniteTerrainSnapshotNumber(snapshot.cutVolume, "Terrain cutVolume");
      assertFiniteTerrainSnapshotNumber(snapshot.sampleArea, "Terrain sampleArea");
      assertOptionalFiniteTerrainSnapshotNumber(snapshot.surfaceArea, "Terrain surfaceArea");
      assertFiniteTerrainSnapshotNumber(snapshot.minHeight, "Terrain minHeight");
      assertFiniteTerrainSnapshotNumber(snapshot.maxHeight, "Terrain maxHeight");
      return;
  }
}

function calculateRestoredSurfaceArea(
  grid: TerrainSampleGrid,
  calculationMode: TerrainVolumeMode | undefined
): number {
  return calculateTerrainArea(
    grid,
    resolveTerrainAreaMode({
      areaMode: calculationMode === "triangulated" ? "triangulated" : "planar"
    })
  );
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
  assertPositiveInteger(snapshot.rows, "Terrain grid rows");
  assertPositiveInteger(snapshot.columns, "Terrain grid columns");
  assertFiniteTerrainSnapshotNumber(snapshot.sampleStep, "Terrain grid sampleStep");
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
  assertNonNegativeInteger(snapshot.row, "Terrain grid sample row");
  assertNonNegativeInteger(snapshot.column, "Terrain grid sample column");
  assertFiniteTerrainSnapshotNumber(snapshot.height, "Terrain grid sample height");
  assertOptionalFiniteTerrainSnapshotNumber(snapshot.slope, "Terrain grid sample slope");
  assertOptionalFiniteTerrainSnapshotNumber(snapshot.aspect, "Terrain grid sample aspect");

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
  assertFiniteTerrainSnapshotNumber(snapshot.height, "Terrain contour height");

  return {
    height: snapshot.height,
    positions: deserializePositions(snapshot.positions)
  };
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertOptionalFiniteTerrainSnapshotNumber(
  value: number | undefined,
  label: string
): void {
  if (value !== undefined) {
    assertFiniteTerrainSnapshotNumber(value, label);
  }
}

function assertFiniteTerrainSnapshotNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function reportOperationProgress(
  operation: OperationContext,
  progress: number,
  phase: string
): void {
  operation.reportProgress(progress, phase);
  operation.throwIfAborted();
}

function rollbackTerrainResult(
  manager: TerrainAnalysisManager,
  map: KairosMap,
  result: TerrainResult | undefined
): void {
  if (!result) {
    return;
  }
  if (manager.get(result.id) === result) {
    manager.remove(result.id);
  } else {
    removeEntities(map, result.entities);
  }
}

function removeEntities(map: KairosMap, entities: Entity[]): void {
  for (const entity of entities) {
    removeEntityIfOwned(map.viewer.entities, entity);
  }
}

function removeEntitiesTracked(
  map: KairosMap,
  entities: Entity[],
  detached: Entity[]
): void {
  for (const entity of entities) {
    removeEntityIfOwnedTracked(map.viewer.entities, entity, detached);
  }
}

function attachEntities(map: KairosMap, entities: Entity[]): void {
  for (const entity of entities) {
    map.viewer.entities.add(entity);
  }
}

function assertTerrainBaseUnchanged(
  results: Map<string, TerrainResult>,
  previous: TerrainResult[],
  staged: TerrainResult[],
  clear: boolean
): void {
  if (clear && results.size !== previous.length) {
    throw new Error("Terrain results changed after transactional preparation.");
  }
  for (const result of previous) {
    if (results.get(result.id) !== result) {
      throw new Error(
        `Terrain result "${result.id}" changed after transactional preparation.`
      );
    }
  }
  if (!clear) {
    for (const result of staged) {
      if (results.has(result.id)) {
        throw new Error(
          `Terrain result "${result.id}" changed after transactional preparation.`
        );
      }
    }
  }
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function createTerrainAnalysisId(type: TerrainResult["type"]): string {
  return `analysis-terrain-${type}-${Math.random().toString(36).slice(2, 10)}`;
}
