import { Cartesian3 } from "cesium";
import type { KairosMap } from "../core/map";
import {
  deserializePositions,
  parseSnapshotDate,
  serializePositions
} from "../core/serialization";
import { Evented } from "../core/events";
import {
  geoJSONToSnapshots,
  snapshotsToGeoJSON
} from "./geojson";
import {
  cloneOverlayData,
  normalizeOverlayHeight,
  renderOverlayEntity,
  serializeOverlayData,
  validateOverlayShape
} from "./render";
import type {
  BillboardOverlayOptions,
  BoxOverlayOptions,
  CircleOverlayOptions,
  CorridorOverlayOptions,
  CylinderOverlayOptions,
  EllipseOverlayOptions,
  GeoJsonExportOptions,
  KairosGeoJsonFeatureCollection,
  LabelOverlayOptions,
  ModelOverlayOptions,
  Overlay,
  OverlayConfig,
  OverlayData,
  OverlayLoadOptions,
  OverlayQueryOptions,
  OverlaySnapshot,
  OverlayType,
  OverlayUpdateOptions,
  PointOverlayOptions,
  PolygonOverlayOptions,
  PolylineOverlayOptions,
  RectangleOverlayOptions,
  WallOverlayOptions
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
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  locked: boolean;
  editable: boolean;
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

  addEllipse(options: EllipseOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "ellipse",
      positions: [options.center],
      data: {
        ...options.data,
        semiMajorAxis: options.semiMajorAxis,
        semiMinorAxis: options.semiMinorAxis
      }
    });
  }

  addWall(options: WallOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "wall",
      data: {
        ...options.data,
        minimumHeights: options.minimumHeights,
        maximumHeights: options.maximumHeights
      }
    });
  }

  addCorridor(options: CorridorOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "corridor",
      data: { ...options.data, width: options.width }
    });
  }

  addBox(options: BoxOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "box",
      positions: [options.position],
      data: { ...options.data, dimensions: options.dimensions }
    });
  }

  addCylinder(options: CylinderOverlayOptions): Overlay {
    return this.add({
      ...options,
      type: "cylinder",
      positions: [options.position],
      data: {
        ...options.data,
        length: options.length,
        topRadius: options.topRadius,
        bottomRadius: options.bottomRadius
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
    const properties = options.properties ?? overlay.properties;
    const metadata = options.metadata ?? overlay.metadata;
    const group = options.group ?? overlay.group;
    const locked = options.locked ?? overlay.locked;
    const editable = options.editable ?? overlay.editable;

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
    overlay.properties = cloneRecord(properties);
    overlay.metadata = cloneMetadata(metadata);
    overlay.group = group;
    overlay.locked = locked;
    overlay.editable = editable;
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

  setLocked(id: string, locked: boolean): Overlay {
    const overlay = this.getRequired(id);
    overlay.locked = locked;
    overlay.updatedAt = new Date();
    this.emit("update", overlay);
    return overlay;
  }

  setEditable(id: string, editable: boolean): Overlay {
    const overlay = this.getRequired(id);
    overlay.editable = editable;
    overlay.updatedAt = new Date();
    this.emit("update", overlay);
    return overlay;
  }

  setGroup(id: string, group: string | undefined): Overlay {
    const overlay = this.getRequired(id);
    overlay.group = group;
    overlay.updatedAt = new Date();
    this.emit("update", overlay);
    return overlay;
  }

  get(id: string): Overlay | undefined {
    return this.overlays.get(id);
  }

  list(options: OverlayQueryOptions = {}): Overlay[] {
    return [...this.overlays.values()].filter((overlay) => matchesOverlayQuery(overlay, options));
  }

  getProperties(id: string): Record<string, unknown> | undefined {
    return cloneRecord(this.getRequired(id).properties);
  }

  setProperties(
    id: string,
    properties: Record<string, unknown> | undefined
  ): Overlay {
    const overlay = this.getRequired(id);
    overlay.properties = cloneRecord(properties);
    overlay.updatedAt = new Date();
    this.emit("update", overlay);
    return overlay;
  }

  mergeProperties(id: string, patch: Record<string, unknown>): Overlay {
    const overlay = this.getRequired(id);
    return this.setProperties(id, {
      ...(overlay.properties ?? {}),
      ...patch
    });
  }

  getMetadata(id: string): Record<string, unknown> | undefined {
    return cloneMetadata(this.getRequired(id).metadata);
  }

  setMetadata(id: string, metadata: Record<string, unknown> | undefined): Overlay {
    const overlay = this.getRequired(id);
    overlay.metadata = cloneMetadata(metadata);
    overlay.updatedAt = new Date();
    this.emit("update", overlay);
    return overlay;
  }

  mergeMetadata(id: string, patch: Record<string, unknown>): Overlay {
    const overlay = this.getRequired(id);
    return this.setMetadata(id, {
      ...(overlay.metadata ?? {}),
      ...patch
    });
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
      properties: cloneRecord(overlay.properties),
      metadata: cloneMetadata(overlay.metadata),
      group: overlay.group,
      locked: overlay.locked || undefined,
      editable: overlay.editable === false ? false : undefined,
      createdAt: overlay.createdAt.toISOString(),
      updatedAt: overlay.updatedAt?.toISOString()
    }));
  }

  toKairosJSON(): OverlaySnapshot[] {
    return this.toJSON();
  }

  async loadKairosJSON(
    snapshots: OverlaySnapshot[],
    options: OverlayLoadOptions = {}
  ): Promise<Overlay[]> {
    return this.load(snapshots, options);
  }

  toGeoJSON(options: GeoJsonExportOptions = {}): KairosGeoJsonFeatureCollection {
    return snapshotsToGeoJSON(this.toJSON(), options);
  }

  async loadGeoJSON(
    geojson: KairosGeoJsonFeatureCollection,
    options: OverlayLoadOptions = {}
  ): Promise<Overlay[]> {
    return this.load(geoJSONToSnapshots<OverlaySnapshot>(geojson), options);
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

  setStyleMany(ids: string[], style: ResultSymbolStyle): Overlay[] {
    const overlays = ids.map((id) => this.getRequired(id));
    return overlays.map((overlay) => this.setStyle(overlay.id, style));
  }

  setStyleWhere(options: OverlayQueryOptions, style: ResultSymbolStyle): Overlay[] {
    return this.list(options).map((overlay) => this.setStyle(overlay.id, style));
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

  removeGroup(group: string): number {
    const overlays = this.list({ group });
    for (const overlay of overlays) {
      this.remove(overlay.id);
    }
    return overlays.length;
  }

  clearGroup(group: string): number {
    return this.removeGroup(group);
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
    const locked = config.locked ?? false;
    const editable = config.editable ?? true;
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
      properties: cloneRecord(config.properties),
      metadata: cloneMetadata(config.metadata),
      group: config.group,
      locked,
      editable,
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
        properties: cloneRecord(snapshot.properties),
        metadata: cloneMetadata(snapshot.metadata),
        group: snapshot.group,
        locked: snapshot.locked ?? false,
        editable: snapshot.editable ?? true
      };
    });
  }

  private restoreSnapshot(prepared: PreparedOverlaySnapshot): Overlay {
    const {
      snapshot,
      positions,
      data,
      style,
      height,
      show,
      properties,
      metadata,
      group,
      locked,
      editable
    } = prepared;
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
      properties,
      metadata,
      group,
      locked,
      editable,
      createdAt: prepared.createdAt,
      updatedAt: prepared.updatedAt
    };

    this.overlays.set(overlay.id, overlay);
    this.emit("add", overlay);
    return overlay;
  }

  private getRequired(id: string): Overlay {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      throw new Error(`Overlay "${id}" does not exist.`);
    }
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
      type === "model" ||
      type === "ellipse" ||
      type === "box" ||
      type === "cylinder")
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
  if (options.semiMajorAxis !== undefined) {
    data.semiMajorAxis = options.semiMajorAxis;
  }
  if (options.semiMinorAxis !== undefined) {
    data.semiMinorAxis = options.semiMinorAxis;
  }
  if (options.width !== undefined) {
    data.width = options.width;
  }
  if (options.minimumHeights !== undefined) {
    data.minimumHeights = [...options.minimumHeights];
  }
  if (options.maximumHeights !== undefined) {
    data.maximumHeights = [...options.maximumHeights];
  }
  if (options.dimensions !== undefined) {
    data.dimensions = cloneDimensions(options.dimensions);
  }
  if (options.length !== undefined) {
    data.length = options.length;
  }
  if (options.topRadius !== undefined) {
    data.topRadius = options.topRadius;
  }
  if (options.bottomRadius !== undefined) {
    data.bottomRadius = options.bottomRadius;
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

function cloneRecord(
  record?: Record<string, unknown>
): Record<string, unknown> | undefined {
  return record ? { ...record } : undefined;
}

function cloneDimensions(
  dimensions: [number, number, number]
): [number, number, number] {
  return [dimensions[0], dimensions[1], dimensions[2]];
}

function matchesOverlayQuery(overlay: Overlay, options: OverlayQueryOptions): boolean {
  if (options.type !== undefined) {
    const types = Array.isArray(options.type) ? options.type : [options.type];
    if (!types.includes(overlay.type)) {
      return false;
    }
  }
  if (options.group !== undefined && overlay.group !== options.group) {
    return false;
  }
  if (options.visible !== undefined && overlay.show !== options.visible) {
    return false;
  }
  if (options.locked !== undefined && overlay.locked !== options.locked) {
    return false;
  }
  if (options.editable !== undefined && overlay.editable !== options.editable) {
    return false;
  }
  return true;
}
