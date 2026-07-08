import {
  Cartesian3,
  ConstantPositionProperty,
  ConstantProperty,
  type Entity
} from "cesium";
import type { KairosMap } from "../core/map";
import { Evented } from "../core/events";
import {
  deserializePositions,
  parseSnapshotDate,
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
  applySymbolStyleToEntities,
  createLineGraphics,
  createPointGraphics,
  createPolygonGraphics,
  serializeSymbolStyle
} from "../style";
import { clonePositions, minPositionCount, updateDrawResultGeometry } from "./geometry";
import type {
  DrawEditEvent,
  DrawEditOptions,
  DrawEditReason,
  DrawEditStartOptions,
  DrawResult,
  DrawResultLoadOptions,
  DrawResultSnapshot,
  DrawToolOptions
} from "./types";

export interface DrawManagerEvents {
  add: DrawResult;
  remove: DrawResult;
  clear: DrawResult[];
  "edit-change": DrawEditEvent;
}

export class DrawManager extends Evented<DrawManagerEvents> {
  private readonly results = new Map<string, DrawResult>();
  private activeEditResultId?: string;
  private readonly offToolStop: () => void;

  constructor(private readonly map: KairosMap) {
    super();
    this.offToolStop = this.map.tools.on("stop", (event) => {
      if (event.data.id === "draw.edit") {
        this.activeEditResultId = undefined;
      }
    });
  }

  point(options?: DrawToolOptions): Promise<Tool<DrawToolOptions>> {
    return this.map.tools.start("draw.point", options);
  }

  polyline(options?: DrawToolOptions): Promise<Tool<DrawToolOptions>> {
    return this.map.tools.start("draw.polyline", options);
  }

  polygon(options?: DrawToolOptions): Promise<Tool<DrawToolOptions>> {
    return this.map.tools.start("draw.polygon", options);
  }

  async edit(id: string, options: DrawEditOptions = {}): Promise<Tool<DrawEditStartOptions>> {
    if (!this.results.has(id)) {
      throw new Error(`Draw result "${id}" does not exist.`);
    }

    const tool = await this.map.tools.start("draw.edit", { ...options, resultId: id });
    this.activeEditResultId = id;
    return tool;
  }

  stopEdit(): void {
    if (this.map.tools.active?.id === "draw.edit") {
      this.map.tools.stop();
    }
  }

  cancelEdit(): void {
    if (this.map.tools.active?.id === "draw.edit") {
      this.map.tools.cancel();
    }
  }

  addResult(result: DrawResult): DrawResult {
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): DrawResult | undefined {
    return this.results.get(id);
  }

  list(): DrawResult[] {
    return [...this.results.values()];
  }

  toJSON(): DrawResultSnapshot[] {
    return this.list().map((result) => ({
      id: result.id,
      type: result.type,
      positions: serializePositions(result.positions),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt?.toISOString(),
      style: serializeSymbolStyle(result.style),
      height: serializeHeightOptions(result.height)
    }));
  }

  async load(
    snapshots: DrawResultSnapshot[],
    options: DrawResultLoadOptions = {}
  ): Promise<DrawResult[]> {
    if (options.clear) {
      this.clear();
    }

    return snapshots.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  setStyle(id: string, style: ResultSymbolStyle): DrawResult {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Draw result "${id}" does not exist.`);
    }

    result.style = this.map.styles.resolveDrawStyle(result.type, style);
    result.updatedAt = new Date();
    applySymbolStyleToEntities([result.entity], result.style);
    applyHeightOptionsToEntity(result.entity, result.height);
    return result;
  }

  update(
    id: string,
    positions: Cartesian3[],
    reason: DrawEditReason = "programmatic"
  ): DrawResult {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Draw result "${id}" does not exist.`);
    }

    const previousPositions = clonePositions(result.positions);
    updateDrawResultGeometry(result, positions);
    const event = {
      result,
      previousPositions,
      positions: clonePositions(result.positions),
      reason
    };
    this.emit("edit-change", event);
    return result;
  }

  remove(id: string): boolean {
    const result = this.results.get(id);
    if (!result) {
      return false;
    }

    if (this.activeEditResultId === id) {
      this.cancelEdit();
    }

    this.map.viewer.entities.remove(result.entity);
    this.results.delete(id);
    this.emit("remove", result);
    this.map.tools.emitClear({ source: "draw", ids: [id] });
    return true;
  }

  clear(): void {
    if (this.activeEditResultId) {
      this.cancelEdit();
    }

    const removed = [...this.results.values()];
    for (const result of removed) {
      this.map.viewer.entities.remove(result.entity);
      this.emit("remove", result);
    }

    this.results.clear();
    this.emit("clear", removed);
    this.map.tools.emitClear({ source: "draw", ids: removed.map((result) => result.id) });
  }

  destroy(): void {
    this.clear();
    this.offToolStop();
    this.off();
  }

  private restoreSnapshot(snapshot: DrawResultSnapshot): DrawResult {
    const positions = deserializePositions(snapshot.positions);
    if (positions.length < minPositionCount(snapshot.type)) {
      throw new Error(
        `Draw result "${snapshot.id}" requires at least ${minPositionCount(snapshot.type)} positions.`
      );
    }
    if (this.results.has(snapshot.id)) {
      this.remove(snapshot.id);
    }

    const style = this.map.styles.resolveDrawStyle(snapshot.type, snapshot.style);
    const height = serializeHeightOptions(snapshot.height);
    const entity = renderDrawEntity(this.map, snapshot.type, snapshot.id, positions, style, height);
    const result: DrawResult = {
      id: snapshot.id,
      type: snapshot.type,
      entity,
      positions,
      createdAt: parseSnapshotDate(snapshot.createdAt, "Draw result createdAt"),
      updatedAt: snapshot.updatedAt
        ? parseSnapshotDate(snapshot.updatedAt, "Draw result updatedAt")
        : undefined,
      style,
      height
    };

    return this.addResult(result);
  }
}

function renderDrawEntity(
  map: KairosMap,
  type: DrawResult["type"],
  id: string,
  positions: Cartesian3[],
  style: ResultSymbolStyle,
  height?: DrawResult["height"]
): Entity {
  if (type === "point") {
    const entity = map.viewer.entities.add({
      id,
      position: new ConstantPositionProperty(positions[0]),
      point: createPointGraphics(style.point)
    });
    applyHeightOptionsToEntity(entity, height);
    return entity;
  }

  if (type === "polyline") {
    const entity = map.viewer.entities.add({
      id,
      polyline: createLineGraphics(
        new ConstantProperty(positions),
        lineStyleWithHeight(style.line, height)
      )
    });
    applyHeightOptionsToEntity(entity, height);
    return entity;
  }

  const entity = map.viewer.entities.add({
    id,
    polygon: createPolygonGraphics(new ConstantProperty(positions), style.polygon)
  });
  applyHeightOptionsToEntity(entity, height);
  return entity;
}
