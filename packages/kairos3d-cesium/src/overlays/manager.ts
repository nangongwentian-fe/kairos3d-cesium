import { Cartesian3 } from "cesium";
import type { KairosMap } from "../core/map";
import {
  deserializePositions,
  parseSnapshotDate,
  serializePositions
} from "../core/serialization";
import { Evented } from "../core/events";
import {
  cloneOverlayData,
  normalizeOverlayHeight,
  renderOverlayEntity,
  serializeOverlayData,
  validateOverlayShape
} from "./render";
import type {
  BillboardOverlayOptions,
  CircleOverlayOptions,
  LabelOverlayOptions,
  ModelOverlayOptions,
  Overlay,
  OverlayConfig,
  OverlayData,
  OverlayLoadOptions,
  OverlaySnapshot,
  OverlayType,
  OverlayUpdateOptions,
  PointOverlayOptions,
  PolygonOverlayOptions,
  PolylineOverlayOptions,
  RectangleOverlayOptions
} from "./types";
import type { ResultSymbolStyle } from "../style";
import {
  applySymbolStyleToEntities,
  serializeSymbolStyle
} from "../style";

export interface OverlayManagerEvents {
  add: Overlay;
  update: Overlay;
  remove: Overlay;
  clear: Overlay[];
  load: Overlay[];
}

interface PreparedOverlaySnapshot {
  snapshot: OverlaySnapshot;
  positions: Cartesian3[];
  createdAt: Date;
  updatedAt?: Date;
  data?: OverlayData;
  style: ResultSymbolStyle;
  height?: Overlay["height"];
  show: boolean;
  metadata?: Record<string, unknown>;
}

let overlayIdSeed = 0;

export class OverlayManager extends Evented<OverlayManagerEvents> {
  private readonly overlays = new Map<string, Overlay>();

  constructor(private readonly map: KairosMap) {
    super();
  }

  add(config: OverlayConfig): Overlay {
    const overlay = this.createOverlayFromConfig(config);
    const existing = this.overlays.get(overlay.id);
    if (existing) {
      this.remove(overlay.id);
    }

    this.overlays.set(overlay.id, overlay);
    this.emit("add", overlay);
    return overlay;
  }

  addPoint(options: PointOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "point",
      positions: [options.position]
    });
  }

  addPolyline(options: PolylineOverlayOptions): Overlay {
    return this.add({ ...options, type: "polyline" });
  }

  addPolygon(options: PolygonOverlayOptions): Overlay {
    return this.add({ ...options, type: "polygon" });
  }

  addCircle(options: CircleOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "circle",
      positions: [options.center],
      data: { ...options.data, radius: options.radius }
    });
  }

  addRectangle(options: RectangleOverlayOptions): Overlay {
    return this.add({ ...options, type: "rectangle" });
  }

  addBillboard(options: BillboardOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "billboard",
      positions: [options.position],
      data: { ...options.data, image: options.image, scale: options.scale }
    });
  }

  addLabel(options: LabelOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "label",
      positions: [options.position],
      data: { ...options.data, text: options.text }
    });
  }

  addModel(options: ModelOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "model",
      positions: [options.position],
      data: {
        ...options.data,
        uri: options.uri,
        scale: options.scale,
        minimumPixelSize: options.minimumPixelSize,
        maximumScale: options.maximumScale,
        heading: options.heading,
        pitch: options.pitch,
        roll: options.roll
      }
    });
  }

  update(id: string, options: OverlayUpdateOptions): Overlay {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      throw new Error(`Overlay "${id}" does not exist.`);
    }

    const positions = resolveUpdatedPositions(overlay.type, overlay.positions, options);
    const data = mergeOverlayData(overlay.data, options);
    const style = options.style
      ? this.map.styles.resolveDrawStyle(overlay.type, options.style)
      : overlay.style ?? this.map.styles.resolveDrawStyle(overlay.type);
    const height = options.height
      ? normalizeOverlayHeight(options.height)
      : overlay.height;
    const show = options.show ?? overlay.show;
    const metadata = options.metadata ?? overlay.metadata;

    validateOverlayShape(id, overlay.type, positions, data);
    this.map.viewer.entities.remove(overlay.entity);
    overlay.entity = renderOverlayEntity(this.map, {
      id,
      type: overlay.type,
      positions,
      data,
      style,
      height,
      show
    });
    overlay.positions = clonePositions(positions);
    overlay.data = cloneOverlayData(data);
    overlay.style = style;
    overlay.height = height;
    overlay.show = show;
    overlay.metadata = cloneMetadata(metadata);
    overlay.updatedAt = new Date();

    this.emit("update", overlay);
    return overlay;
  }

  setStyle(id: string, style: ResultSymbolStyle): Overlay {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      throw new Error(`Overlay "${id}" does not exist.`);
    }

    overlay.style = this.map.styles.resolveDrawStyle(overlay.type, style);
    overlay.updatedAt = new Date();
    if (overlay.type === "circle" || overlay.type === "rectangle") {
      this.map.viewer.entities.remove(overlay.entity);
      overlay.entity = renderOverlayEntity(this.map, {
        id,
        type: overlay.type,
        positions: overlay.positions,
        data: overlay.data,
        style: overlay.style,
        height: overlay.height,
        show: overlay.show
      });
    } else {
      applySymbolStyleToEntities([overlay.entity], overlay.style);
    }
    this.emit("update", overlay);
    return overlay;
  }

  setShow(id: string, show: boolean): Overlay {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      throw new Error(`Overlay "${id}" does not exist.`);
    }

    overlay.show = show;
    overlay.entity.show = show;
    overlay.updatedAt = new Date();
    this.emit("update", overlay);
    return overlay;
  }

  get(id: string): Overlay | undefined {
    return this.overlays.get(id);
  }

  list(): Overlay[] {
    return [...this.overlays.values()];
  }

  findByEntity(entity: unknown): Overlay | undefined {
    return this.list().find((overlay) => overlay.entity === entity);
  }

  toJSON(): OverlaySnapshot[] {
    return this.list().map((overlay) => ({
      id: overlay.id,
      type: overlay.type,
      positions: serializePositions(overlay.positions),
      data: serializeOverlayData(overlay.data),
      style: serializeSymbolStyle(overlay.style),
      height: normalizeOverlayHeight(overlay.height),
      show: overlay.show,
      metadata: cloneMetadata(overlay.metadata),
      createdAt: overlay.createdAt.toISOString(),
      updatedAt: overlay.updatedAt?.toISOString()
    }));
  }

  async load(
    snapshots: OverlaySnapshot[],
    options: OverlayLoadOptions = {}
  ): Promise<Overlay[]> {
    const prepared = this.prepareSnapshots(snapshots);
    if (options.clear) {
      this.clear();
    }

    const restored = prepared.map((snapshot) => this.restoreSnapshot(snapshot));
    this.emit("load", restored);
    return restored;
  }

  validateSnapshots(snapshots: OverlaySnapshot[]): void {
    this.prepareSnapshots(snapshots);
  }

  remove(id: string): boolean {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      return false;
    }

    this.map.viewer.entities.remove(overlay.entity);
    this.overlays.delete(id);
    this.emit("remove", overlay);
    return true;
  }

  clear(): void {
    const removed = this.list();
    for (const overlay of removed) {
      this.map.viewer.entities.remove(overlay.entity);
      this.emit("remove", overlay);
    }

    this.overlays.clear();
    this.emit("clear", removed);
  }

  destroy(): void {
    this.clear();
    this.off();
  }

  private createOverlayFromConfig(config: OverlayConfig): Overlay {
    const id = config.id ?? createOverlayId(config.type);
    const positions = clonePositions(config.positions);
    const data = cloneOverlayData(config.data);
    const style = this.map.styles.resolveDrawStyle(config.type, config.style);
    const height = normalizeOverlayHeight(config.height);
    const show = config.show ?? true;
    validateOverlayShape(id, config.type, positions, data);

    return {
      id,
      type: config.type,
      entity: renderOverlayEntity(this.map, {
        id,
        type: config.type,
        positions,
        data,
        style,
        height,
        show
      }),
      positions,
      data,
      style,
      height,
      show,
      metadata: cloneMetadata(config.metadata),
      createdAt: new Date()
    };
  }

  private prepareSnapshots(snapshots: OverlaySnapshot[]): PreparedOverlaySnapshot[] {
    const ids = new Set<string>();
    return snapshots.map((snapshot) => {
      if (!snapshot.id) {
        throw new Error("Overlay snapshot id is required.");
      }
      if (ids.has(snapshot.id)) {
        throw new Error(`Overlay snapshot id "${snapshot.id}" is duplicated.`);
      }
      ids.add(snapshot.id);

      const positions = deserializePositions(snapshot.positions);
      const data = cloneOverlayData(snapshot.data);
      validateOverlayShape(snapshot.id, snapshot.type, positions, data);

      return {
        snapshot,
        positions,
        data,
        createdAt: parseSnapshotDate(snapshot.createdAt, "Overlay createdAt"),
        updatedAt: snapshot.updatedAt
          ? parseSnapshotDate(snapshot.updatedAt, "Overlay updatedAt")
          : undefined,
        style: this.map.styles.resolveDrawStyle(snapshot.type, snapshot.style),
        height: normalizeOverlayHeight(snapshot.height),
        show: snapshot.show ?? true,
        metadata: cloneMetadata(snapshot.metadata)
      };
    });
  }

  private restoreSnapshot(prepared: PreparedOverlaySnapshot): Overlay {
    const { snapshot, positions, data, style, height, show, metadata } = prepared;
    if (this.overlays.has(snapshot.id)) {
      this.remove(snapshot.id);
    }

    const overlay: Overlay = {
      id: snapshot.id,
      type: snapshot.type,
      entity: renderOverlayEntity(this.map, {
        id: snapshot.id,
        type: snapshot.type,
        positions,
        data,
        style,
        height,
        show
      }),
      positions,
      data,
      style,
      height,
      show,
      metadata,
      createdAt: prepared.createdAt,
      updatedAt: prepared.updatedAt
    };

    this.overlays.set(overlay.id, overlay);
    this.emit("add", overlay);
    return overlay;
  }
}

function resolveUpdatedPositions(
  type: OverlayType,
  current: Cartesian3[],
  options: OverlayUpdateOptions
): Cartesian3[] {
  if (options.positions) {
    return clonePositions(options.positions);
  }

  const singlePosition = options.position ?? options.center;
  if (
    singlePosition &&
    (type === "point" ||
      type === "circle" ||
      type === "billboard" ||
      type === "label" ||
      type === "model")
  ) {
    return [Cartesian3.clone(singlePosition)];
  }

  return clonePositions(current);
}

function mergeOverlayData(
  current: OverlayData | undefined,
  options: OverlayUpdateOptions
): OverlayData | undefined {
  const data = {
    ...current,
    ...options.data
  };

  if (options.radius !== undefined) {
    data.radius = options.radius;
  }
  if (options.text !== undefined) {
    data.text = options.text;
  }
  if (options.image !== undefined) {
    data.image = options.image;
  }
  if (options.uri !== undefined) {
    data.uri = options.uri;
  }
  if (options.scale !== undefined) {
    data.scale = options.scale;
  }
  if (options.minimumPixelSize !== undefined) {
    data.minimumPixelSize = options.minimumPixelSize;
  }
  if (options.maximumScale !== undefined) {
    data.maximumScale = options.maximumScale;
  }
  if (options.heading !== undefined) {
    data.heading = options.heading;
  }
  if (options.pitch !== undefined) {
    data.pitch = options.pitch;
  }
  if (options.roll !== undefined) {
    data.roll = options.roll;
  }

  return Object.keys(data).length ? data : undefined;
}

function createOverlayId(type: OverlayType): string {
  overlayIdSeed += 1;
  return `overlay-${type}-${overlayIdSeed}`;
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function cloneMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined {
  return metadata ? { ...metadata } : undefined;
}
