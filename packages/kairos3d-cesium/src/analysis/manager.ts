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
  serializePositions
} from "../core/serialization";
import type { Tool } from "../tools";
import type { ResultSymbolStyle } from "../style";
import {
  applyHeightOptionsToEntity,
  lineStyleWithHeight,
  serializeHeightOptions
} from "../height";
import {
  createLabelGraphics,
  createLineGraphics,
  createPointGraphics,
  createPolygonGraphics,
  mergeSymbolStyles,
  serializeSymbolStyle
} from "../style";
import {
  createResultPolygonPrimitives,
  createResultPolylinePrimitive,
  removeResultPrimitiveRuntimes,
  resolveResultRenderMode,
  type ResultPrimitiveRuntime,
  type ResultRenderMode
} from "../primitives";
import { ClippingManager } from "./clipping";
import { TerrainAnalysisManager } from "./terrain";
import {
  classifyVisibility,
  interpolateVisibilitySamples
} from "./visibility-utils";
import {
  createProfileSamples,
  getProfileHeightRange,
  interpolateProfilePoints,
  sampleGroundCartographics
} from "./profile-utils";
import type {
  AnalysisResultLoadOptions,
  AnalysisResultsSnapshot,
  MeasureResult,
  MeasureResultSnapshot,
  MeasureToolOptions,
  ProfileComputeOptions,
  ProfileDrawOptions,
  ProfileResult,
  ProfileResultSnapshot,
  ProfileSampleSnapshot,
  VisibilityComputeOptions,
  VisibilityPickOptions,
  VisibilityResult,
  VisibilityResultSnapshot
} from "./types";

export class AnalysisManager {
  readonly measure: MeasureManager;
  readonly visibility: VisibilityManager;
  readonly profile: ProfileManager;
  readonly clipping: ClippingManager;
  readonly terrain: TerrainAnalysisManager;

  constructor(private readonly map: KairosMap) {
    this.measure = new MeasureManager(map);
    this.visibility = new VisibilityManager(map);
    this.profile = new ProfileManager(map);
    this.clipping = new ClippingManager(map);
    this.terrain = new TerrainAnalysisManager(map);
  }

  destroy(): void {
    this.measure.destroy();
    this.visibility.destroy();
    this.profile.destroy();
    this.clipping.destroy();
    this.terrain.destroy();
  }

  toJSON(): AnalysisResultsSnapshot {
    return {
      measure: this.measure.toJSON(),
      visibility: this.visibility.toJSON(),
      profile: this.profile.toJSON(),
      clipping: this.clipping.toJSON(),
      terrain: this.terrain.toJSON()
    };
  }

  async load(
    snapshot: AnalysisResultsSnapshot,
    options: AnalysisResultLoadOptions = {}
  ): Promise<void> {
    if (options.clear) {
      this.measure.clear();
      this.visibility.clear();
      this.profile.clear();
      this.clipping.clear();
      this.terrain.clear();
    }

    await this.measure.load(snapshot.measure, { clear: false });
    await this.visibility.load(snapshot.visibility, { clear: false });
    await this.profile.load(snapshot.profile, { clear: false });
    await this.clipping.load(snapshot.clipping, { clear: false });
    await this.terrain.load(snapshot.terrain ?? [], { clear: false });
  }
}

export interface MeasureManagerEvents {
  add: MeasureResult;
  remove: MeasureResult;
  clear: MeasureResult[];
}

export class MeasureManager extends Evented<MeasureManagerEvents> {
  private readonly results = new Map<string, MeasureResult>();

  constructor(private readonly map: KairosMap) {
    super();
  }

  distance(options?: MeasureToolOptions): Promise<Tool<MeasureToolOptions>> {
    return this.map.tools.start("measure.distance", options);
  }

  area(options?: MeasureToolOptions): Promise<Tool<MeasureToolOptions>> {
    return this.map.tools.start("measure.area", options);
  }

  height(options?: MeasureToolOptions): Promise<Tool<MeasureToolOptions>> {
    return this.map.tools.start("measure.height", options);
  }

  addResult(result: MeasureResult): MeasureResult {
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): MeasureResult | undefined {
    return this.results.get(id);
  }

  list(): MeasureResult[] {
    return [...this.results.values()];
  }

  toJSON(): MeasureResultSnapshot[] {
    return this.list().map((result) => ({
      id: result.id,
      type: result.type,
      positions: serializePositions(result.positions),
      value: result.value,
      unit: result.unit,
      label: result.label,
      createdAt: result.createdAt.toISOString(),
      style: serializeSymbolStyle(result.style),
      height: serializeHeightOptions(result.height),
      mode: result.mode,
      renderMode: result.renderMode === "primitive" ? "primitive" : undefined
    }));
  }

  async load(
    snapshots: MeasureResultSnapshot[],
    options: AnalysisResultLoadOptions = {}
  ): Promise<MeasureResult[]> {
    if (options.clear) {
      this.clear();
    }

    return snapshots.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  setStyle(id: string, style: ResultSymbolStyle): MeasureResult {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Measure result "${id}" does not exist.`);
    }

    removeMeasureRuntime(this.map, result);
    result.style = this.map.styles.resolveMeasureStyle(result.type, style);
    const rendered = renderMeasureResult(
      this.map,
      result,
      result.positions,
      result.style,
      result.height,
      result.renderMode
    );
    result.entities = rendered.entities;
    result.primitives = rendered.primitives;
    result.entityIds = result.entities.map((entity) => entity.id);
    return result;
  }

  remove(id: string): boolean {
    const result = this.results.get(id);
    if (!result) {
      return false;
    }

    removeMeasureRuntime(this.map, result);
    this.results.delete(id);
    this.emit("remove", result);
    this.map.tools.emitClear({ source: "measure", ids: [id] });
    return true;
  }

  clear(): void {
    const removed = [...this.results.values()];
    for (const result of removed) {
      removeMeasureRuntime(this.map, result);
      this.emit("remove", result);
    }

    this.results.clear();
    this.emit("clear", removed);
    this.map.tools.emitClear({ source: "measure", ids: removed.map((result) => result.id) });
  }

  stop(): void {
    this.map.tools.stop();
  }

  destroy(): void {
    this.clear();
    this.off();
  }

  private restoreSnapshot(snapshot: MeasureResultSnapshot): MeasureResult {
    const positions = deserializePositions(snapshot.positions);
    validateMeasurePositions(snapshot.type, positions);
    if (this.results.has(snapshot.id)) {
      this.remove(snapshot.id);
    }

    const style = this.map.styles.resolveMeasureStyle(snapshot.type, snapshot.style);
    const height = serializeHeightOptions(snapshot.height);
    const renderMode = resolveMeasureRenderMode(snapshot.type, snapshot.renderMode);
    const rendered = renderMeasureResult(
      this.map,
      snapshot,
      positions,
      style,
      height,
      renderMode
    );
    return this.addResult({
      id: snapshot.id,
      type: snapshot.type,
      positions,
      value: snapshot.value,
      unit: snapshot.unit,
      label: snapshot.label,
      entities: rendered.entities,
      entityIds: rendered.entities.map((entity) => entity.id),
      createdAt: parseSnapshotDate(snapshot.createdAt, "Measure result createdAt"),
      style,
      height,
      mode: snapshot.mode,
      renderMode,
      primitives: rendered.primitives
    });
  }
}

export interface VisibilityManagerEvents {
  add: VisibilityResult;
  remove: VisibilityResult;
  clear: VisibilityResult[];
}

export class VisibilityManager extends Evented<VisibilityManagerEvents> {
  private readonly results = new Map<string, VisibilityResult>();

  constructor(private readonly map: KairosMap) {
    super();
  }

  pick(options?: VisibilityPickOptions): Promise<Tool<VisibilityPickOptions>> {
    return this.map.tools.start("analysis.visibility.pick", options);
  }

  async compute(options: VisibilityComputeOptions): Promise<VisibilityResult> {
    const [start, end] = options.height
      ? await this.map.height.resolvePositions([options.start, options.end], options.height)
      : [Cartesian3.clone(options.start), Cartesian3.clone(options.end)];
    const samples = interpolateVisibilitySamples(
      start,
      end,
      options.sampleCount
    );
    const ground = await sampleGroundCartographics(
      this.map.viewer.terrainProvider,
      samples.map((sample) => sample.cartographic)
    );
    const classification = classifyVisibility(samples, ground, options.heightTolerance);
    const result = this.createResult(options, classification, [start, end]);
    return this.addResult(result);
  }

  addResult(result: VisibilityResult): VisibilityResult {
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): VisibilityResult | undefined {
    return this.results.get(id);
  }

  list(): VisibilityResult[] {
    return [...this.results.values()];
  }

  toJSON(): VisibilityResultSnapshot[] {
    return this.list().map((result) => ({
      id: result.id,
      type: "visibility",
      positions: [
        serializePosition(result.positions[0]),
        serializePosition(result.positions[1])
      ],
      visible: result.visible,
      distance: result.distance,
      blockedPosition: result.blockedPosition
        ? serializePosition(result.blockedPosition)
        : undefined,
      createdAt: result.createdAt.toISOString(),
      style: serializeSymbolStyle(result.style),
      height: serializeHeightOptions(result.height)
    }));
  }

  async load(
    snapshots: VisibilityResultSnapshot[],
    options: AnalysisResultLoadOptions = {}
  ): Promise<VisibilityResult[]> {
    if (options.clear) {
      this.clear();
    }

    return snapshots.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  setStyle(id: string, style: ResultSymbolStyle): VisibilityResult {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Visibility result "${id}" does not exist.`);
    }

    removeEntities(this.map, result.entities);
    result.style = this.map.styles.resolveVisibilityStyle(style);
    result.entities = renderVisibilityEntities(
      this.map,
      result.positions[0],
      result.positions[1],
      result.blockedPosition,
      result.style,
      result.height
    );
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
    this.map.tools.emitClear({ source: "visibility", ids: [id] });
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
      source: "visibility",
      ids: removed.map((result) => result.id)
    });
  }

  destroy(): void {
    this.clear();
    this.off();
  }

  private restoreSnapshot(snapshot: VisibilityResultSnapshot): VisibilityResult {
    if (this.results.has(snapshot.id)) {
      this.remove(snapshot.id);
    }

    const start = deserializePosition(snapshot.positions[0]);
    const end = deserializePosition(snapshot.positions[1]);
    const blockedPosition = snapshot.blockedPosition
      ? deserializePosition(snapshot.blockedPosition)
      : undefined;
    const style = this.map.styles.resolveVisibilityStyle(snapshot.style);
    const height = serializeHeightOptions(snapshot.height);
    const entities = renderVisibilityEntities(this.map, start, end, blockedPosition, style, height);

    return this.addResult({
      id: snapshot.id,
      type: "visibility",
      positions: [start, end],
      visible: snapshot.visible,
      distance: snapshot.distance,
      blockedPosition,
      entities,
      createdAt: parseSnapshotDate(snapshot.createdAt, "Visibility result createdAt"),
      style,
      height
    });
  }

  private createResult(
    options: VisibilityComputeOptions,
    classification: { visible: boolean; blockedPosition?: Cartesian3 },
    positions: [Cartesian3, Cartesian3]
  ): VisibilityResult {
    const id = createAnalysisId("visibility");
    const start = Cartesian3.clone(positions[0]);
    const end = Cartesian3.clone(positions[1]);
    const blockedPosition = classification.blockedPosition
      ? Cartesian3.clone(classification.blockedPosition)
      : undefined;
    const style = this.map.styles.resolveVisibilityStyle(visibilityOptionsToStyle(options));
    const entities = renderVisibilityEntities(
      this.map,
      start,
      end,
      blockedPosition,
      style,
      options.height
    );

    return {
      id,
      type: "visibility",
      positions: [start, end],
      visible: classification.visible,
      distance: Cartesian3.distance(start, end),
      blockedPosition,
      entities,
      createdAt: new Date(),
      style,
      height: serializeHeightOptions(options.height)
    };
  }
}

export interface ProfileManagerEvents {
  add: ProfileResult;
  remove: ProfileResult;
  clear: ProfileResult[];
}

export class ProfileManager extends Evented<ProfileManagerEvents> {
  private readonly results = new Map<string, ProfileResult>();

  constructor(private readonly map: KairosMap) {
    super();
  }

  draw(options?: ProfileDrawOptions): Promise<Tool<ProfileDrawOptions>> {
    return this.map.tools.start("analysis.profile.draw", options);
  }

  async compute(options: ProfileComputeOptions): Promise<ProfileResult> {
    const positions = options.height
      ? await this.map.height.resolvePositions(options.positions, options.height)
      : clonePositions(options.positions);
    const interpolated = interpolateProfilePoints(positions, options.sampleCount);
    const sampledCartographics = await sampleGroundCartographics(
      this.map.viewer.terrainProvider,
      interpolated.map((sample) => sample.cartographic)
    );
    const samples = createProfileSamples(interpolated, sampledCartographics);
    const range = getProfileHeightRange(samples);
    const style = this.map.styles.resolveProfileStyle(profileOptionsToStyle(options));
    const entities = renderProfileEntities(this.map, samples, style, options.height);
    const result: ProfileResult = {
      id: createAnalysisId("profile"),
      type: "profile",
      positions,
      samples,
      totalDistance: samples[samples.length - 1]?.distance ?? 0,
      minHeight: range.minHeight,
      maxHeight: range.maxHeight,
      entities,
      createdAt: new Date(),
      style,
      height: serializeHeightOptions(options.height)
    };

    return this.addResult(result);
  }

  addResult(result: ProfileResult): ProfileResult {
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): ProfileResult | undefined {
    return this.results.get(id);
  }

  list(): ProfileResult[] {
    return [...this.results.values()];
  }

  toJSON(): ProfileResultSnapshot[] {
    return this.list().map((result) => ({
      id: result.id,
      type: "profile",
      positions: serializePositions(result.positions),
      samples: result.samples.map((sample) => ({
        position: serializePosition(sample.position),
        distance: sample.distance,
        height: sample.height
      })),
      totalDistance: result.totalDistance,
      minHeight: result.minHeight,
      maxHeight: result.maxHeight,
      createdAt: result.createdAt.toISOString(),
      style: serializeSymbolStyle(result.style),
      height: serializeHeightOptions(result.height)
    }));
  }

  async load(
    snapshots: ProfileResultSnapshot[],
    options: AnalysisResultLoadOptions = {}
  ): Promise<ProfileResult[]> {
    if (options.clear) {
      this.clear();
    }

    return snapshots.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  setStyle(id: string, style: ResultSymbolStyle): ProfileResult {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Profile result "${id}" does not exist.`);
    }

    removeEntities(this.map, result.entities);
    result.style = this.map.styles.resolveProfileStyle(style);
    result.entities = renderProfileEntities(this.map, result.samples, result.style, result.height);
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
    this.map.tools.emitClear({ source: "profile", ids: [id] });
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
      source: "profile",
      ids: removed.map((result) => result.id)
    });
  }

  destroy(): void {
    this.clear();
    this.off();
  }

  private restoreSnapshot(snapshot: ProfileResultSnapshot): ProfileResult {
    if (this.results.has(snapshot.id)) {
      this.remove(snapshot.id);
    }

    const positions = deserializePositions(snapshot.positions);
    const samples = snapshot.samples.map(deserializeProfileSample);
    const style = this.map.styles.resolveProfileStyle(snapshot.style);
    const height = serializeHeightOptions(snapshot.height);
    const entities = renderProfileEntities(this.map, samples, style, height);

    return this.addResult({
      id: snapshot.id,
      type: "profile",
      positions,
      samples,
      totalDistance: snapshot.totalDistance,
      minHeight: snapshot.minHeight,
      maxHeight: snapshot.maxHeight,
      entities,
      createdAt: parseSnapshotDate(snapshot.createdAt, "Profile result createdAt"),
      style,
      height
    });
  }
}

function renderVisibilityEntities(
  map: KairosMap,
  start: Cartesian3,
  end: Cartesian3,
  blockedPosition: Cartesian3 | undefined,
  style: ResultSymbolStyle,
  height?: VisibilityResult["height"]
): Entity[] {
  const visibleLineStyle = style.visibleLine ?? style.line;
  const blockedLineStyle = style.blockedLine ?? style.line;
  const pointStyle = style.point;
  const blockedPointStyle = style.blockedPoint ?? style.point;
  const entities: Entity[] = [];

  if (blockedPosition) {
    entities.push(addPolyline(map, [start, blockedPosition], visibleLineStyle, height));
    entities.push(addPolyline(map, [blockedPosition, end], blockedLineStyle, height));
    entities.push(addPoint(map, blockedPosition, blockedPointStyle, height));
  } else {
    entities.push(addPolyline(map, [start, end], visibleLineStyle, height));
  }

  entities.push(addPoint(map, start, pointStyle, height));
  entities.push(addPoint(map, end, pointStyle, height));
  return entities;
}

type MeasureSnapshotLike = Pick<MeasureResultSnapshot, "id" | "type" | "value" | "unit" | "label">;

function renderMeasureEntities(
  map: KairosMap,
  snapshot: MeasureSnapshotLike,
  positions: Cartesian3[],
  style: ResultSymbolStyle,
  height?: MeasureResult["height"]
): Entity[] {
  const entities: Entity[] = [];

  if (snapshot.type === "area") {
    entities.push(addPolygon(map, positions, style.polygon, height));
  } else {
    entities.push(addPolyline(map, positions, style.line, height));
  }

  const label = snapshot.label ?? `${snapshot.value} ${snapshot.unit}`;
  const labelPosition = positions[positions.length - 1];
  if (labelPosition) {
    entities.push(addLabel(map, labelPosition, label, style.label));
  }

  return entities;
}

function renderMeasureResult(
  map: KairosMap,
  snapshot: MeasureSnapshotLike,
  positions: Cartesian3[],
  style: ResultSymbolStyle,
  height: MeasureResult["height"] | undefined,
  renderMode: ResultRenderMode | undefined
): { entities: Entity[]; primitives?: ResultPrimitiveRuntime[] } {
  const resolvedRenderMode = resolveMeasureRenderMode(snapshot.type, renderMode);
  if (resolvedRenderMode !== "primitive") {
    return {
      entities: renderMeasureEntities(map, snapshot, positions, style, height)
    };
  }

  const primitives = renderMeasurePrimitives(map, snapshot.type, snapshot.id, positions, style);
  const entities: Entity[] = [];
  const label = snapshot.label ?? `${snapshot.value} ${snapshot.unit}`;
  const labelPosition = positions[positions.length - 1];
  if (labelPosition) {
    entities.push(addLabel(map, labelPosition, label, style.label));
  }
  return { entities, primitives };
}

export function renderMeasurePrimitives(
  map: KairosMap,
  type: MeasureResult["type"],
  id: string,
  positions: Cartesian3[],
  style: ResultSymbolStyle
): ResultPrimitiveRuntime[] | undefined {
  if (type === "distance") {
    return [
      createResultPolylinePrimitive(map, {
        id,
        positions,
        style: style.line
      })
    ];
  }

  if (type === "area") {
    return createResultPolygonPrimitives(map, {
      id,
      positions,
      style: style.polygon
    });
  }

  return undefined;
}

export function resolveMeasureRenderMode(
  type: MeasureResult["type"],
  renderMode?: ResultRenderMode
): ResultRenderMode {
  if (type === "height") {
    return "entity";
  }
  return resolveResultRenderMode(renderMode);
}

function validateMeasurePositions(type: MeasureResult["type"], positions: Cartesian3[]): void {
  const minCount = type === "area" ? 3 : 2;
  if (positions.length < minCount) {
    throw new Error(`Measure result "${type}" requires at least ${minCount} positions.`);
  }
}

function deserializeProfileSample(sample: ProfileSampleSnapshot) {
  return {
    position: deserializePosition(sample.position),
    distance: sample.distance,
    height: sample.height
  };
}

function renderProfileEntities(
  map: KairosMap,
  samples: { position: Cartesian3 }[],
  style: ResultSymbolStyle,
  height?: ProfileResult["height"]
): Entity[] {
  const positions = samples.map((sample) => sample.position);
  const entities = [addPolyline(map, positions, style.line, height)];

  if (positions.length >= 2) {
    entities.push(addPoint(map, positions[0], style.point, height));
    entities.push(addPoint(map, positions[positions.length - 1], style.point, height));
  }

  return entities;
}

function addPolyline(
  map: KairosMap,
  positions: Cartesian3[],
  style?: ResultSymbolStyle["line"],
  height?: MeasureResult["height"] | VisibilityResult["height"] | ProfileResult["height"]
): Entity {
  const entity = map.viewer.entities.add({
    polyline: createLineGraphics(positions, lineStyleWithHeight(style, height))
  });
  applyHeightOptionsToEntity(entity, height);
  return entity;
}

function addPolygon(
  map: KairosMap,
  positions: Cartesian3[],
  style?: ResultSymbolStyle["polygon"],
  height?: MeasureResult["height"]
): Entity {
  const entity = map.viewer.entities.add({
    polygon: createPolygonGraphics(new ConstantProperty(positions), style)
  });
  applyHeightOptionsToEntity(entity, height);
  return entity;
}

function addPoint(
  map: KairosMap,
  position: Cartesian3,
  style?: ResultSymbolStyle["point"],
  height?: VisibilityResult["height"] | ProfileResult["height"]
): Entity {
  const entity = map.viewer.entities.add({
    position,
    point: createPointGraphics(style)
  });
  applyHeightOptionsToEntity(entity, height);
  return entity;
}

function addLabel(
  map: KairosMap,
  position: Cartesian3,
  text: string,
  style?: ResultSymbolStyle["label"]
): Entity {
  return map.viewer.entities.add({
    position,
    label: createLabelGraphics(text, style)
  });
}

function removeEntities(map: KairosMap, entities: Entity[]): void {
  for (const entity of entities) {
    map.viewer.entities.remove(entity);
  }
}

function removeMeasureRuntime(map: KairosMap, result: MeasureResult): void {
  removeEntities(map, result.entities);
  removeResultPrimitiveRuntimes(map, result.primitives);
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function createAnalysisId(type: "visibility" | "profile"): string {
  return `analysis-${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function visibilityOptionsToStyle(options: VisibilityComputeOptions): ResultSymbolStyle {
  return mergeSymbolStyles(
    {
      visibleLine: { color: options.visibleColor },
      blockedLine: { color: options.blockedColor },
      point: { color: options.pointColor },
      blockedPoint: { color: options.blockedColor }
    },
    options.style
  );
}

function profileOptionsToStyle(options: ProfileComputeOptions): ResultSymbolStyle {
  return mergeSymbolStyles(
    {
      line: { color: options.lineColor },
      point: { color: options.pointColor }
    },
    options.style
  );
}
