import { Cartesian3 } from "cesium";
import {
  getRuntimeLeaseOwner,
  runWithRuntimeLease,
  runWithRuntimeWriteLease,
  type RuntimeLeaseOwnerToken
} from "../concurrency/lease";
import type { KairosMap } from "../core/map";
import { removeEntityIfOwned } from "../core/entity-collection";
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
  createOverlayEntity,
  normalizeOverlayHeight,
  renderOverlayEntity,
  serializeOverlayData,
  validateOverlayShape
} from "./render";
import type { PreparedSceneStage } from "../scene/transaction";
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
  PlotOverlayOptions,
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
  id: string;
  type: OverlayType;
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
  private readonly scenePreflights = new WeakMap<
    object,
    { clear: boolean; prepared: PreparedOverlaySnapshot[] }
  >();

  constructor(private readonly map: KairosMap) {
    super();
  }

  add(config: OverlayConfig): Overlay {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.add", resources: ["overlays"] },
      () => this.addInternal(config)
    );
  }

  private addInternal(config: OverlayConfig): Overlay {
    const overlay = this.createOverlayFromConfig(config);
    const existing = this.overlays.get(overlay.id);
    if (existing) {
      this.removeInternal(overlay.id);
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

  addPlot(options: PlotOverlayOptions): Overlay {
    const data: OverlayData = { ...options.data };
    if (options.plot) {
      data.plot = { ...options.plot };
    }
    return this.add({
      ...options,
      data
    });
  }

  update(id: string, options: OverlayUpdateOptions): Overlay {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.update", resources: ["overlays"] },
      () => this.updateInternal(id, options)
    );
  }

  private updateInternal(id: string, options: OverlayUpdateOptions): Overlay {
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
    removeEntityIfOwned(this.map.viewer.entities, overlay.entity);
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
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.set-style", resources: ["overlays"] },
      () => this.setStyleInternal(id, style)
    );
  }

  private setStyleInternal(id: string, style: ResultSymbolStyle): Overlay {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      throw new Error(`Overlay "${id}" does not exist.`);
    }

    overlay.style = this.map.styles.resolveDrawStyle(overlay.type, style);
    overlay.updatedAt = new Date();
    if (overlay.type === "circle" || overlay.type === "rectangle") {
      removeEntityIfOwned(this.map.viewer.entities, overlay.entity);
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
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.set-show", resources: ["overlays"] },
      () => this.setShowInternal(id, show)
    );
  }

  private setShowInternal(id: string, show: boolean): Overlay {
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
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.set-locked", resources: ["overlays"] },
      () => this.setLockedInternal(id, locked)
    );
  }

  private setLockedInternal(id: string, locked: boolean): Overlay {
    const overlay = this.getRequired(id);
    overlay.locked = locked;
    overlay.updatedAt = new Date();
    this.emit("update", overlay);
    return overlay;
  }

  setEditable(id: string, editable: boolean): Overlay {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.set-editable", resources: ["overlays"] },
      () => this.setEditableInternal(id, editable)
    );
  }

  private setEditableInternal(id: string, editable: boolean): Overlay {
    const overlay = this.getRequired(id);
    overlay.editable = editable;
    overlay.updatedAt = new Date();
    this.emit("update", overlay);
    return overlay;
  }

  setGroup(id: string, group: string | undefined): Overlay {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.set-group", resources: ["overlays"] },
      () => this.setGroupInternal(id, group)
    );
  }

  private setGroupInternal(id: string, group: string | undefined): Overlay {
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
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.set-properties", resources: ["overlays"] },
      () => this.setPropertiesInternal(id, properties)
    );
  }

  private setPropertiesInternal(
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
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.merge-properties", resources: ["overlays"] },
      () => {
        const overlay = this.getRequired(id);
        return this.setPropertiesInternal(id, {
          ...(overlay.properties ?? {}),
          ...patch
        });
      }
    );
  }

  getMetadata(id: string): Record<string, unknown> | undefined {
    return cloneMetadata(this.getRequired(id).metadata);
  }

  setMetadata(id: string, metadata: Record<string, unknown> | undefined): Overlay {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.set-metadata", resources: ["overlays"] },
      () => this.setMetadataInternal(id, metadata)
    );
  }

  private setMetadataInternal(
    id: string,
    metadata: Record<string, unknown> | undefined
  ): Overlay {
    const overlay = this.getRequired(id);
    overlay.metadata = cloneMetadata(metadata);
    overlay.updatedAt = new Date();
    this.emit("update", overlay);
    return overlay;
  }

  mergeMetadata(id: string, patch: Record<string, unknown>): Overlay {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.merge-metadata", resources: ["overlays"] },
      () => {
        const overlay = this.getRequired(id);
        return this.setMetadataInternal(id, {
          ...(overlay.metadata ?? {}),
          ...patch
        });
      }
    );
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
    return runWithRuntimeLease(
      this.map.concurrency,
      {
        kind: "overlays.load",
        mode: "write",
        resources: ["overlays"],
        conflictPolicy: "reject",
        ownerToken: getRuntimeLeaseOwner(options)
      },
      () => {
        const prepared = this.prepareSnapshots(snapshots);
        if (options.clear) {
          this.clearInternal();
        }

        const restored = prepared.map((snapshot) => this.restoreSnapshot(snapshot));
        this.emit("load", restored);
        return restored;
      }
    );
  }

  setStyleMany(ids: string[], style: ResultSymbolStyle): Overlay[] {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.set-style-many", resources: ["overlays"] },
      () => {
        const overlays = ids.map((id) => this.getRequired(id));
        return overlays.map((overlay) => this.setStyleInternal(overlay.id, style));
      }
    );
  }

  setStyleWhere(options: OverlayQueryOptions, style: ResultSymbolStyle): Overlay[] {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.set-style-where", resources: ["overlays"] },
      () => this.list(options).map((overlay) => this.setStyleInternal(overlay.id, style))
    );
  }

  validateSnapshots(snapshots: OverlaySnapshot[]): void {
    this.prepareSnapshots(snapshots);
  }

  /** @internal */
  preflightSceneLoad(
    snapshots: OverlaySnapshot[],
    options: OverlayLoadOptions = {}
  ): object {
    const token = Object.freeze({ phase: "overlays" });
    this.scenePreflights.set(token, {
      clear: options.clear ?? false,
      prepared: this.prepareSnapshots(snapshots)
    });
    return token;
  }

  /** @internal */
  async prepareSceneLoad(
    snapshots: OverlaySnapshot[],
    options: OverlayLoadOptions = {},
    preflightToken?: object
  ): Promise<PreparedSceneStage> {
    const clear = options.clear ?? false;
    const token = preflightToken ?? this.preflightSceneLoad(snapshots, options);
    const preflight = this.scenePreflights.get(token);
    if (!preflight || preflight.clear !== clear) {
      throw new Error("Overlay scene preflight token is invalid or stale.");
    }
    this.scenePreflights.delete(token);
    const prepared = preflight.prepared;
    const staged = prepared.map((item) => this.createPreparedOverlay(item, false));
    const previous = clear
      ? this.list()
      : staged
          .map((overlay) => this.overlays.get(overlay.id))
          .filter((overlay): overlay is Overlay => Boolean(overlay));
    const detachedPrevious: Overlay[] = [];
    const attachedStaged: Overlay[] = [];
    let mapsSwapped = false;
    let published = false;

    return {
      phase: "overlays",
      commit: () => {
        for (const overlay of previous) {
          if (removeEntityIfOwned(this.map.viewer.entities, overlay.entity)) {
            detachedPrevious.push(overlay);
          }
        }
        for (const overlay of staged) {
          this.map.viewer.entities.add(overlay.entity);
          attachedStaged.push(overlay);
        }
        for (const overlay of previous) {
          this.overlays.delete(overlay.id);
        }
        for (const overlay of staged) {
          this.overlays.set(overlay.id, overlay);
        }
        mapsSwapped = true;
      },
      rollback: () => {
        for (const overlay of [...attachedStaged].reverse()) {
          removeEntityIfOwned(this.map.viewer.entities, overlay.entity);
        }
        attachedStaged.length = 0;
        if (mapsSwapped) {
          for (const overlay of staged) {
            this.overlays.delete(overlay.id);
          }
        }
        for (const overlay of detachedPrevious) {
          this.map.viewer.entities.add(overlay.entity);
          this.overlays.set(overlay.id, overlay);
        }
        detachedPrevious.length = 0;
        mapsSwapped = false;
      },
      finalize: () => undefined,
      dispose: () => {
        for (const overlay of [...attachedStaged].reverse()) {
          removeEntityIfOwned(this.map.viewer.entities, overlay.entity);
        }
        attachedStaged.length = 0;
      },
      publish: () => {
        if (published) {
          return;
        }
        published = true;
        if (previous.length > 0) {
          for (const overlay of previous) {
            this.emit("remove", overlay);
          }
          if (clear) {
            this.emit("clear", previous);
          }
        }
        for (const overlay of staged) {
          this.emit("add", overlay);
        }
        this.emit("load", staged);
      }
    };
  }

  remove(id: string): boolean {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.remove", resources: ["overlays"] },
      () => this.removeInternal(id)
    );
  }

  private removeInternal(id: string): boolean {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      return false;
    }

    removeEntityIfOwned(this.map.viewer.entities, overlay.entity);
    this.overlays.delete(id);
    this.emit("remove", overlay);
    return true;
  }

  removeGroup(group: string): number {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.remove-group", resources: ["overlays"] },
      () => {
        const overlays = this.list({ group });
        for (const overlay of overlays) {
          this.removeInternal(overlay.id);
        }
        return overlays.length;
      }
    );
  }

  clearGroup(group: string): number {
    return this.removeGroup(group);
  }

  clear(): void {
    runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.clear", resources: ["overlays"] },
      () => this.clearInternal()
    );
  }

  /** @internal */
  clearWithRuntimeLease(ownerToken: RuntimeLeaseOwnerToken): void {
    runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "overlays.clear", resources: ["overlays"], ownerToken },
      () => this.clearInternal()
    );
  }

  private clearInternal(): void {
    const removed = this.list();
    for (const overlay of removed) {
      removeEntityIfOwned(this.map.viewer.entities, overlay.entity);
    }

    this.overlays.clear();
    for (const overlay of removed) {
      this.emit("remove", overlay);
    }
    this.emit("clear", removed);
  }

  destroy(): void {
    this.clearInternal();
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
        id: snapshot.id,
        type: snapshot.type,
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
    const overlay = this.createPreparedOverlay(prepared, true);
    if (this.overlays.has(overlay.id)) {
      this.removeInternal(overlay.id);
    }
    this.overlays.set(overlay.id, overlay);
    this.emit("add", overlay);
    return overlay;
  }

  private createPreparedOverlay(
    prepared: PreparedOverlaySnapshot,
    attach: boolean
  ): Overlay {
    const {
      id,
      type,
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
    const overlay: Overlay = {
      id,
      type,
      entity: attach
        ? renderOverlayEntity(this.map, {
            id,
            type,
            positions,
            data,
            style,
            height,
            show
          })
        : createOverlayEntity({
            id,
            type,
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
  if (options.plot !== undefined) {
    data.plot = { ...options.plot };
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
