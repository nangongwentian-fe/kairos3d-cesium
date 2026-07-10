import { Cartesian3 } from "cesium";
import type { KairosMap } from "../core/map";
import {
  deserializePosition,
  deserializePositions,
  parseSnapshotDate,
  serializePosition,
  serializePositions
} from "../core/serialization";
import { Evented } from "../core/events";
import {
  runOrReuseOperation,
  type OperationContext
} from "../operations/manager";
import type { AsyncOperationOptions } from "../operations/types";
import type { PreparedSceneStage } from "../scene/transaction";
import { parseColorLike, serializeColor } from "../style";
import type { ColorLike } from "../style";
import {
  createEffectRuntime,
  type EffectRuntime,
  type EffectRuntimeContext
} from "./runtime";
import type {
  EffectConfig,
  EffectInstance,
  EffectLoadOptions,
  EffectManagerEvents,
  EffectMaterialDescriptor,
  EffectSnapshot,
  EffectType,
  EffectUpdateOptions,
  SerializableEffectConfig
} from "./types";

interface ManagedEffect {
  instance: EffectInstance;
  runtime: EffectRuntime;
}

interface PreparedEffect {
  config: EffectConfig;
  runtime: EffectRuntime;
  createdAt: Date;
  updatedAt?: Date;
}

interface PreparedLoadResult {
  loaded: EffectInstance[];
  removed: EffectInstance[];
}

type PreparedSceneEffectState =
  | "prepared"
  | "committing"
  | "committed"
  | "rolled-back"
  | "finalized"
  | "disposed";

export class EffectManager extends Evented<EffectManagerEvents> {
  private readonly effects = new Map<string, ManagedEffect>();
  private readonly pendingIds = new Set<string>();
  private readonly idVersions = new Map<string, number>();
  private removeTicker?: () => void;
  private previousTickTime?: number;
  private loadPending = false;
  private sceneLoadToken?: symbol;
  private clearEpoch = 0;
  private stateRevision = 0;
  private destroyed = false;

  constructor(private readonly map: KairosMap) {
    super();
  }

  async add(
    config: EffectConfig,
    operationOptions?: AsyncOperationOptions
  ): Promise<EffectInstance> {
    this.assertActive();
    if (this.effects.has(config.id)) {
      throw new Error(`Effect "${config.id}" already exists.`);
    }
    const normalized = this.normalizeConfig(config);
    this.validateConfig(normalized);
    const operation = this.beginIdOperation(normalized.id);
    let taskStarted = false;
    const promise = runOrReuseOperation(
      this.map.operations,
      { kind: "effects.add", label: `Add effect ${config.id}` },
      operationOptions,
      async (context) => {
        taskStarted = true;
        try {
          return await this.addWithOperation(normalized, operation, context);
        } finally {
          this.pendingIds.delete(normalized.id);
        }
      }
    );
    void promise.catch(() => {
      if (!taskStarted) {
        this.pendingIds.delete(normalized.id);
      }
    });
    const result = await promise;
    this.emit("add", result);
    return result;
  }

  private async addWithOperation(
    normalized: EffectConfig,
    operation: { id: string; version: number; epoch: number },
    context: OperationContext
  ): Promise<EffectInstance> {
    context.reportProgress(0.1, "validate");
    context.throwIfAborted();
    let runtime: EffectRuntime | undefined;
    let committed = false;
    try {
      runtime = await this.prepareRuntime(normalized);
      context.throwIfAborted();
      context.reportProgress(0.8, "prepare");
      context.throwIfAborted();
      context.reportProgress(0.95, "commit");
      context.throwIfAborted();
      this.assertIdOperationCurrent(operation);
      const managed = this.commitPrepared({
        config: normalized,
        runtime,
        createdAt: new Date()
      });
      committed = true;
      this.markMutation(normalized.id);
      const result = this.cloneInstance(managed.instance);
      return result;
    } catch (error) {
      if (runtime && !committed) {
        runtime.destroy();
      }
      throw error;
    }
  }

  async update(
    id: string,
    patch: EffectUpdateOptions,
    operationOptions?: AsyncOperationOptions
  ): Promise<EffectInstance> {
    this.assertActive();
    const current = this.requireEffect(id);
    const config = this.normalizeConfig({
      ...current.instance.config,
      ...patch,
      id,
      type: current.instance.type
    } as EffectConfig);
    this.validateConfig(config);
    const operation = this.beginIdOperation(id);
    let taskStarted = false;
    const promise = runOrReuseOperation(
      this.map.operations,
      { kind: "effects.update", label: `Update effect ${id}` },
      operationOptions,
      async (context) => {
        taskStarted = true;
        try {
          return await this.updateWithOperation(current, config, operation, context);
        } finally {
          this.pendingIds.delete(id);
        }
      }
    );
    void promise.catch(() => {
      if (!taskStarted) {
        this.pendingIds.delete(id);
      }
    });
    const result = await promise;
    this.emit("update", result);
    return result;
  }

  private async updateWithOperation(
    current: ManagedEffect,
    config: EffectConfig,
    operation: { id: string; version: number; epoch: number },
    context: OperationContext
  ): Promise<EffectInstance> {
    const id = current.instance.id;
    context.reportProgress(0.1, "validate");
    context.throwIfAborted();
    let runtime: EffectRuntime | undefined;
    let committed = false;
    try {
      runtime = await this.prepareRuntime(config);
      context.throwIfAborted();
      context.reportProgress(0.8, "prepare");
      context.throwIfAborted();
      context.reportProgress(0.95, "commit");
      context.throwIfAborted();
      this.assertIdOperationCurrent(operation, current);
      runtime.setShow(config.show ?? true);
      runtime.attach();

      current.runtime.destroy();
      const instance = this.createInstance(
        config,
        runtime,
        current.instance.createdAt,
        new Date()
      );
      this.effects.set(id, { instance, runtime });
      committed = true;
      this.markMutation(id);
      this.syncTicker();
      this.requestRender();
      const result = this.cloneInstance(instance);
      return result;
    } catch (error) {
      if (runtime && !committed) {
        runtime.destroy();
      }
      throw error;
    }
  }

  get(id: string): EffectInstance | undefined {
    const instance = this.effects.get(id)?.instance;
    return instance ? this.cloneInstance(instance) : undefined;
  }

  list(): EffectInstance[] {
    return [...this.effects.values()].map((managed) =>
      this.cloneInstance(managed.instance)
    );
  }

  getRuntimeObjects(id: string): unknown[] {
    return this.requireEffect(id).runtime.objects.slice();
  }

  getRuntimeObjectCount(): number {
    return [...this.effects.values()].reduce(
      (count, managed) => count + managed.runtime.objects.length,
      0
    );
  }

  getAnimatedCount(): number {
    return [...this.effects.values()].filter((managed) => managed.runtime.animated).length;
  }

  setShow(id: string, show: boolean): EffectInstance {
    this.assertNoSceneLoad("change effect visibility");
    const managed = this.requireEffect(id);
    managed.runtime.setShow(show);
    managed.instance.show = show;
    managed.instance.config.show = show;
    managed.instance.updatedAt = new Date();
    this.markMutation(id);
    this.requestRender();
    const result = this.cloneInstance(managed.instance);
    this.emit("update", result);
    return result;
  }

  setGroupShow(group: string, show: boolean): EffectInstance[] {
    this.assertNoSceneLoad("change effect group visibility");
    const updated: EffectInstance[] = [];
    for (const managed of this.effects.values()) {
      if (managed.instance.group === group) {
        updated.push(this.setShow(managed.instance.id, show));
      }
    }
    return updated;
  }

  remove(id: string): boolean {
    this.assertNoSceneLoad(`remove effect "${id}"`);
    this.invalidateId(id);
    this.stateRevision += 1;
    const managed = this.effects.get(id);
    if (!managed) {
      return false;
    }
    managed.runtime.destroy();
    this.effects.delete(id);
    this.syncTicker();
    this.requestRender();
    this.emit("remove", this.cloneInstance(managed.instance));
    return true;
  }

  clear(): void {
    this.assertNoSceneLoad("clear effects");
    const removed = this.clearManagedEffects();
    this.emit("clear", removed);
  }

  private clearManagedEffects(): EffectInstance[] {
    this.clearEpoch += 1;
    this.stateRevision += 1;
    const removed = this.list();
    for (const managed of this.effects.values()) {
      managed.runtime.destroy();
    }
    this.effects.clear();
    this.syncTicker();
    this.requestRender();
    return removed;
  }

  toJSON(): EffectSnapshot[] {
    const snapshots = this.list().map((instance) => ({
      id: instance.id,
      type: instance.type,
      show: instance.show,
      group: instance.group,
      metadata: cloneJSONRecord(instance.metadata),
      config: serializeConfig(instance.config),
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt?.toISOString()
    }));
    snapshots.forEach((snapshot) =>
      assertJSONSafe(snapshot, `Effect snapshot "${snapshot.id}"`)
    );
    return snapshots;
  }

  validateSnapshots(snapshots: EffectSnapshot[]): void {
    if (!Array.isArray(snapshots)) {
      throw new Error("Effect snapshots must be an array.");
    }
    const ids = new Set<string>();
    for (const snapshot of snapshots) {
      if (ids.has(snapshot.id)) {
        throw new Error(`Effect snapshot id "${snapshot.id}" is duplicated.`);
      }
      ids.add(snapshot.id);
      parseSnapshotDate(snapshot.createdAt, "Effect createdAt");
      if (snapshot.updatedAt) {
        parseSnapshotDate(snapshot.updatedAt, "Effect updatedAt");
      }
      assertJSONSafe(snapshot, `Effect snapshot "${snapshot.id}"`);
      this.validateConfig(deserializeSnapshotConfig(snapshot));
    }
  }

  /** @internal */
  async prepareSceneLoad(
    snapshots: EffectSnapshot[],
    options: { clear?: boolean } = {}
  ): Promise<PreparedSceneStage> {
    this.assertActive();
    this.assertSceneLoadAvailable();
    this.validateSnapshots(snapshots);
    const clear = options.clear ?? false;
    if (!clear) {
      for (const snapshot of snapshots) {
        if (this.effects.has(snapshot.id)) {
          throw new Error(`Effect "${snapshot.id}" already exists.`);
        }
      }
    }

    const revision = this.stateRevision;
    const epoch = this.clearEpoch;
    const token = Symbol("effects.scene-load");
    const release = () => {
      if (this.sceneLoadToken === token) {
        this.sceneLoadToken = undefined;
      }
    };
    this.sceneLoadToken = token;

    const prepared: PreparedEffect[] = [];
    try {
      for (const snapshot of snapshots) {
        const config = this.normalizeConfig(deserializeSnapshotConfig(snapshot));
        prepared.push({
          config,
          runtime: await this.prepareRuntime(config),
          createdAt: parseSnapshotDate(snapshot.createdAt, "Effect createdAt"),
          updatedAt: snapshot.updatedAt
            ? parseSnapshotDate(snapshot.updatedAt, "Effect updatedAt")
            : undefined
        });
        this.assertSceneLoadCurrent(revision, epoch, token);
      }
    } catch (error) {
      for (const item of prepared) {
        item.runtime.destroy();
      }
      release();
      throw error;
    }

    const previousEffects = new Map(this.effects);
    const previousIdVersions = new Map(this.idVersions);
    const removed = clear
      ? [...previousEffects.values()].map((managed) =>
          this.cloneInstance(managed.instance)
        )
      : [];
    const nextEffects = prepared.map((item) => {
      const instance = this.createInstance(
        item.config,
        item.runtime,
        item.createdAt,
        item.updatedAt
      );
      return { instance, runtime: item.runtime };
    });
    const loaded = nextEffects.map((managed) =>
      this.cloneInstance(managed.instance)
    );
    let state: PreparedSceneEffectState = "prepared";
    let published = false;

    return {
      phase: "effects",
      commit: () => {
        if (state !== "prepared") {
          throw new Error(`Cannot commit effects from state "${state}".`);
        }
        this.assertSceneLoadCurrent(revision, epoch, token);
        state = "committing";

        if (clear) {
          for (const managed of previousEffects.values()) {
            managed.runtime.detach();
          }
        }
        for (const managed of nextEffects) {
          managed.runtime.attach();
        }

        this.effects.clear();
        if (!clear) {
          for (const [id, managed] of previousEffects) {
            this.effects.set(id, managed);
          }
        }
        for (const managed of nextEffects) {
          this.effects.set(managed.instance.id, managed);
          this.invalidateId(managed.instance.id);
        }
        if (clear) {
          this.clearEpoch += 1;
        }
        this.stateRevision += clear ? 2 : 1;
        this.previousTickTime = undefined;
        this.syncTicker();
        this.requestRender();
        state = "committed";
      },
      rollback: () => {
        if (state === "rolled-back" || state === "disposed") {
          return;
        }
        if (state === "finalized") {
          throw new Error("Cannot roll back finalized effects.");
        }
        if (state === "prepared") {
          state = "rolled-back";
          return;
        }

        const errors: unknown[] = [];
        for (const managed of [...nextEffects].reverse()) {
          try {
            managed.runtime.detach();
          } catch (error) {
            errors.push(error);
          }
        }
        if (clear) {
          for (const managed of previousEffects.values()) {
            try {
              managed.runtime.attach();
            } catch (error) {
              errors.push(error);
            }
          }
        }

        this.effects.clear();
        for (const [id, managed] of previousEffects) {
          this.effects.set(id, managed);
        }
        this.idVersions.clear();
        for (const [id, version] of previousIdVersions) {
          this.idVersions.set(id, version);
        }
        this.clearEpoch = epoch;
        this.stateRevision = revision;
        this.previousTickTime = undefined;
        this.syncTicker();
        this.requestRender();
        state = "rolled-back";

        if (errors.length > 0) {
          throw new AggregateError(errors, "Failed to roll back effects.");
        }
      },
      finalize: () => {
        if (state === "finalized") {
          return;
        }
        if (state !== "committed") {
          throw new Error(`Cannot finalize effects from state "${state}".`);
        }

        const errors: unknown[] = [];
        if (clear) {
          for (const managed of previousEffects.values()) {
            try {
              managed.runtime.destroy();
            } catch (error) {
              errors.push(error);
            }
          }
        }
        state = "finalized";
        release();
        if (errors.length > 0) {
          throw new AggregateError(errors, "Failed to finalize effects.");
        }
      },
      dispose: () => {
        if (state === "disposed" || state === "finalized") {
          return;
        }
        if (state === "committing" || state === "committed") {
          throw new Error("Effects must be rolled back before disposal.");
        }

        const errors: unknown[] = [];
        for (const managed of nextEffects) {
          try {
            managed.runtime.destroy();
          } catch (error) {
            errors.push(error);
          }
        }
        state = "disposed";
        release();
        if (errors.length > 0) {
          throw new AggregateError(errors, "Failed to dispose prepared effects.");
        }
      },
      publish: () => {
        if (published) {
          return;
        }
        if (state !== "finalized") {
          throw new Error(`Cannot publish effects from state "${state}".`);
        }
        published = true;
        if (clear) {
          this.emit("clear", removed.map((instance) => this.cloneInstance(instance)));
        }
        this.emit("load", loaded.map((instance) => this.cloneInstance(instance)));
      }
    };
  }

  async load(
    snapshots: EffectSnapshot[],
    options: EffectLoadOptions = {}
  ): Promise<EffectInstance[]> {
    this.assertActive();
    this.assertNoPendingMutation("load effects");
    this.validateSnapshots(snapshots);
    if (!options.clear) {
      for (const snapshot of snapshots) {
        if (this.effects.has(snapshot.id)) {
          throw new Error(`Effect "${snapshot.id}" already exists.`);
        }
      }
    }

    const revision = this.stateRevision;
    const epoch = this.clearEpoch;
    this.loadPending = true;
    let taskStarted = false;
    const promise = runOrReuseOperation(
      this.map.operations,
      { kind: "effects.load", label: "Load effects" },
      options,
      async (context) => {
        taskStarted = true;
        try {
          return await this.loadWithOperation(
            snapshots,
            options,
            revision,
            epoch,
            context
          );
        } finally {
          this.loadPending = false;
        }
      }
    );
    void promise.catch(() => {
      if (!taskStarted) {
        this.loadPending = false;
      }
    });
    const result = await promise;
    if (options.clear) {
      this.emit("clear", result.removed);
    }
    this.emit("load", result.loaded);
    return result.loaded;
  }

  private async loadWithOperation(
    snapshots: EffectSnapshot[],
    options: EffectLoadOptions,
    revision: number,
    epoch: number,
    context: OperationContext
  ): Promise<PreparedLoadResult> {
    context.reportProgress(0.1, "validate");
    context.throwIfAborted();

    const prepared: PreparedEffect[] = [];
    try {
      for (const [index, snapshot] of snapshots.entries()) {
        const config = this.normalizeConfig(deserializeSnapshotConfig(snapshot));
        prepared.push({
          config,
          runtime: await this.prepareRuntime(config),
          createdAt: parseSnapshotDate(snapshot.createdAt, "Effect createdAt"),
          updatedAt: snapshot.updatedAt
            ? parseSnapshotDate(snapshot.updatedAt, "Effect updatedAt")
            : undefined
        });
        context.throwIfAborted();
        context.reportProgress(
          0.1 + (0.75 * (index + 1)) / Math.max(snapshots.length, 1),
          "prepare"
        );
        context.throwIfAborted();
        this.assertLoadCurrent(revision, epoch, prepared);
      }
      context.throwIfAborted();
      context.reportProgress(0.9, "attach");
      context.throwIfAborted();
      this.assertLoadCurrent(revision, epoch, prepared);
      for (const item of prepared) {
        item.runtime.setShow(item.config.show ?? true);
        item.runtime.attach();
      }
      context.throwIfAborted();
      context.reportProgress(0.95, "commit");
      context.throwIfAborted();
      this.assertLoadCurrent(revision, epoch, prepared);
    } catch (error) {
      for (const item of prepared) {
        item.runtime.destroy();
      }
      throw error;
    }

    const removed = options.clear ? this.clearManagedEffects() : [];
    const loaded = prepared.map((item) => {
      const instance = this.createInstance(
        item.config,
        item.runtime,
        item.createdAt,
        item.updatedAt
      );
      this.effects.set(instance.id, { instance, runtime: item.runtime });
      this.invalidateId(instance.id);
      return instance;
    });
    this.stateRevision += 1;
    this.syncTicker();
    this.requestRender();
    const result = loaded.map((instance) => this.cloneInstance(instance));
    return { loaded: result, removed };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    const removed = this.clearManagedEffects();
    this.emit("clear", removed);
    this.removeTicker?.();
    this.removeTicker = undefined;
    this.previousTickTime = undefined;
    this.destroyed = true;
    this.off();
  }

  private async prepareRuntime(config: EffectConfig): Promise<EffectRuntime> {
    const context: EffectRuntimeContext = {
      scene: this.map.viewer.scene,
      materials: this.map.materials
    };
    const runtime = await createEffectRuntime(context, config);
    runtime.setShow(config.show ?? true);
    return runtime;
  }

  private commitPrepared(item: PreparedEffect): ManagedEffect {
    item.runtime.setShow(item.config.show ?? true);
    item.runtime.attach();
    const instance = this.createInstance(
      item.config,
      item.runtime,
      item.createdAt,
      item.updatedAt
    );
    const managed = { instance, runtime: item.runtime };
    this.effects.set(instance.id, managed);
    this.syncTicker();
    this.requestRender();
    return managed;
  }

  private createInstance(
    config: EffectConfig,
    runtime: EffectRuntime,
    createdAt: Date,
    updatedAt?: Date
  ): EffectInstance {
    return {
      id: config.id,
      type: config.type,
      show: config.show ?? true,
      group: config.group,
      metadata: cloneRecord(config.metadata),
      config,
      runtimeObjects: runtime.objects.slice(),
      createdAt,
      updatedAt
    };
  }

  private cloneInstance(instance: EffectInstance): EffectInstance {
    return {
      ...instance,
      metadata: cloneRecord(instance.metadata),
      config: this.normalizeConfig(instance.config),
      runtimeObjects: instance.runtimeObjects.slice(),
      createdAt: new Date(instance.createdAt),
      updatedAt: instance.updatedAt ? new Date(instance.updatedAt) : undefined
    };
  }

  private normalizeConfig(config: EffectConfig): EffectConfig {
    const base = {
      ...config,
      show: config.show ?? true,
      metadata: cloneRecord(config.metadata)
    };
    switch (config.type) {
      case "flow-line":
      case "flow-wall":
      case "water-surface":
        return {
          ...base,
          positions: clonePositions(config.positions),
          material: cloneMaterial(config.material),
          ...(config.type === "flow-wall"
            ? {
                minimumHeights: config.minimumHeights?.slice(),
                maximumHeights: config.maximumHeights?.slice()
              }
            : {})
        } as EffectConfig;
      case "pulse-circle":
      case "radar-scan":
        return {
          ...base,
          position: Cartesian3.clone(config.position),
          material: config.material ? cloneMaterial(config.material) : undefined
        } as EffectConfig;
      case "particle":
        return {
          ...base,
          position: Cartesian3.clone(config.position),
          imageSize: config.imageSize?.slice() as [number, number] | undefined
        } as EffectConfig;
      default:
        return base;
    }
  }

  private validateConfig(config: EffectConfig): void {
    if (!config.id.trim()) {
      throw new Error("Effect id must be a non-empty string.");
    }
    switch (config.type) {
      case "flow-line":
        validatePositions(config.positions, 2, "Flow line");
        assertPositive(config.width ?? 3, "Flow line width");
        this.validateMaterial(config.material);
        break;
      case "flow-wall":
        validatePositions(config.positions, 2, "Flow wall");
        validateHeightArray(config.minimumHeights, config.positions.length, "minimumHeights");
        validateHeightArray(config.maximumHeights, config.positions.length, "maximumHeights");
        this.validateMaterial(config.material);
        break;
      case "pulse-circle":
      case "radar-scan":
        validatePosition(config.position, `${config.type} position`);
        assertPositive(config.radius, `${config.type} radius`);
        if (config.height !== undefined) {
          assertFinite(config.height, `${config.type} height`);
        }
        this.validateMaterial(
          config.material ?? {
            type: config.type === "pulse-circle" ? "radial-wave" : "radar-scan"
          }
        );
        break;
      case "water-surface":
        validatePositions(config.positions, 3, "Water surface");
        this.validateMaterial(config.material);
        break;
      case "particle":
        validatePosition(config.position, "Particle position");
        if (!config.image.trim()) {
          throw new Error("Particle image must be a non-empty URI or data URI.");
        }
        validateOptionalPositive(config.emissionRate, "Particle emissionRate");
        validateOptionalNonNegative(config.speed, "Particle speed");
        validateOptionalPositive(config.particleLife, "Particle particleLife");
        validateOptionalPositive(config.lifetime, "Particle lifetime");
        validateOptionalPositive(config.startScale, "Particle startScale");
        validateOptionalPositive(config.endScale, "Particle endScale");
        if (config.imageSize) {
          assertPositive(config.imageSize[0], "Particle image width");
          assertPositive(config.imageSize[1], "Particle image height");
        }
        break;
      case "rain":
      case "snow":
      case "fog":
        assertRange(config.intensity ?? 0.5, 0, 1, `${config.type} intensity`);
        validateOptionalNonNegative(config.speed, `${config.type} speed`);
        break;
      default:
        assertNever(config);
    }
  }

  private validateMaterial(material: EffectMaterialDescriptor): void {
    assertJSONSafe(material, `Effect material "${material.type}"`);
    const definition = this.map.materials
      .list()
      .find((candidate) => candidate.type === material.type);
    if (!definition) {
      throw new Error(`Material definition "${material.type}" is not registered.`);
    }
    if (!definition.targets.includes("primitive")) {
      throw new Error(`Material "${material.type}" does not support target "primitive".`);
    }
  }

  private requireEffect(id: string): ManagedEffect {
    const managed = this.effects.get(id);
    if (!managed) {
      throw new Error(`Effect "${id}" does not exist.`);
    }
    return managed;
  }

  private syncTicker(): void {
    if (this.getAnimatedCount() > 0 && !this.removeTicker) {
      this.previousTickTime = undefined;
      this.removeTicker = this.map.viewer.clock.onTick.addEventListener(() => {
        this.tick();
      });
      return;
    }
    if (this.getAnimatedCount() === 0 && this.removeTicker) {
      this.removeTicker();
      this.removeTicker = undefined;
      this.previousTickTime = undefined;
    }
  }

  private tick(): void {
    const current = performance.now();
    const seconds = this.previousTickTime === undefined
      ? 0
      : Math.max(0, Math.min(1, (current - this.previousTickTime) / 1_000));
    this.previousTickTime = current;
    let rendered = false;
    for (const managed of this.effects.values()) {
      if (managed.runtime.animated && managed.instance.show) {
        managed.runtime.advance(seconds);
        rendered = true;
      }
    }
    if (rendered) {
      this.requestRender();
    }
  }

  private requestRender(): void {
    if (this.map.viewer.isDestroyed?.()) {
      return;
    }
    this.map.viewer.scene.requestRender();
  }

  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("EffectManager is destroyed.");
    }
  }

  private beginIdOperation(id: string): {
    id: string;
    version: number;
    epoch: number;
  } {
    this.assertNoPendingMutation(`mutate effect "${id}"`);
    if (this.pendingIds.has(id)) {
      throw new Error(`Effect "${id}" already has an operation in progress.`);
    }
    this.pendingIds.add(id);
    return { id, version: this.getIdVersion(id), epoch: this.clearEpoch };
  }

  private assertIdOperationCurrent(
    operation: { id: string; version: number; epoch: number },
    expected?: ManagedEffect
  ): void {
    const current = this.effects.get(operation.id);
    if (
      this.destroyed ||
      operation.epoch !== this.clearEpoch ||
      operation.version !== this.getIdVersion(operation.id) ||
      (expected !== undefined && current !== expected) ||
      (expected === undefined && current !== undefined)
    ) {
      throw new Error(`Effect operation for "${operation.id}" was superseded.`);
    }
  }

  private assertLoadCurrent(
    revision: number,
    epoch: number,
    prepared: PreparedEffect[]
  ): void {
    if (
      this.destroyed ||
      revision !== this.stateRevision ||
      epoch !== this.clearEpoch
    ) {
      for (const item of prepared) {
        item.runtime.destroy();
      }
      prepared.length = 0;
      throw new Error("Effect load was superseded by another mutation.");
    }
  }

  private assertNoPendingMutation(action: string): void {
    if (this.loadPending) {
      throw new Error(`Cannot ${action} while an effect load is in progress.`);
    }
    this.assertNoSceneLoad(action);
  }

  private assertNoSceneLoad(action: string): void {
    if (this.sceneLoadToken) {
      throw new Error(
        `Cannot ${action} while a scene effect transaction is in progress.`
      );
    }
  }

  private assertSceneLoadAvailable(): void {
    if (this.sceneLoadToken || this.loadPending || this.pendingIds.size > 0) {
      throw new Error("Cannot prepare effects while another effect operation is in progress.");
    }
  }

  private assertSceneLoadCurrent(
    revision: number,
    epoch: number,
    token: symbol
  ): void {
    if (
      this.destroyed ||
      this.sceneLoadToken !== token ||
      this.stateRevision !== revision ||
      this.clearEpoch !== epoch
    ) {
      throw new Error("Effect scene load was superseded by another mutation.");
    }
  }

  private getIdVersion(id: string): number {
    return this.idVersions.get(id) ?? 0;
  }

  private invalidateId(id: string): void {
    this.idVersions.set(id, this.getIdVersion(id) + 1);
  }

  private markMutation(id: string): void {
    this.invalidateId(id);
    this.stateRevision += 1;
  }
}

function serializeConfig(config: EffectConfig): SerializableEffectConfig {
  const common = serializeSpecificColors(config);
  switch (config.type) {
    case "flow-line":
      return {
        positions: serializePositions(config.positions),
        width: config.width,
        material: serializeMaterial(config.material)
      };
    case "flow-wall":
      return {
        positions: serializePositions(config.positions),
        minimumHeights: config.minimumHeights?.slice(),
        maximumHeights: config.maximumHeights?.slice(),
        material: serializeMaterial(config.material)
      };
    case "pulse-circle":
    case "radar-scan":
      return {
        position: serializePosition(config.position),
        radius: config.radius,
        height: config.height,
        material: config.material ? serializeMaterial(config.material) : undefined
      };
    case "water-surface":
      return {
        positions: serializePositions(config.positions),
        material: serializeMaterial(config.material)
      };
    case "particle":
      return {
        position: serializePosition(config.position),
        image: config.image,
        emissionRate: config.emissionRate,
        speed: config.speed,
        particleLife: config.particleLife,
        lifetime: config.lifetime,
        startScale: config.startScale,
        endScale: config.endScale,
        imageSize: config.imageSize?.slice() as [number, number] | undefined,
        startColor: common.startColor,
        endColor: common.endColor,
        sizeInMeters: config.sizeInMeters
      };
    case "rain":
    case "snow":
    case "fog":
      return {
        intensity: config.intensity,
        speed: config.speed,
        color: common.color
      };
  }
}

function deserializeSnapshotConfig(snapshot: EffectSnapshot): EffectConfig {
  const base = {
    id: snapshot.id,
    type: snapshot.type,
    show: snapshot.show,
    group: snapshot.group,
    metadata: cloneRecord(snapshot.metadata)
  };
  const config = snapshot.config;
  switch (snapshot.type) {
    case "flow-line":
      return {
        ...base,
        type: snapshot.type,
        positions: deserializePositions(config.positions ?? []),
        width: config.width,
        material: requireMaterial(config.material, snapshot.id)
      };
    case "flow-wall":
      return {
        ...base,
        type: snapshot.type,
        positions: deserializePositions(config.positions ?? []),
        minimumHeights: config.minimumHeights?.slice(),
        maximumHeights: config.maximumHeights?.slice(),
        material: requireMaterial(config.material, snapshot.id)
      };
    case "pulse-circle":
    case "radar-scan":
      return {
        ...base,
        type: snapshot.type,
        position: deserializePosition(requirePosition(config.position, snapshot.id)),
        radius: config.radius ?? Number.NaN,
        height: config.height,
        material: config.material ? cloneMaterial(config.material) : undefined
      };
    case "water-surface":
      return {
        ...base,
        type: snapshot.type,
        positions: deserializePositions(config.positions ?? []),
        material: requireMaterial(config.material, snapshot.id)
      };
    case "particle":
      return {
        ...base,
        type: snapshot.type,
        position: deserializePosition(requirePosition(config.position, snapshot.id)),
        image: config.image ?? "",
        emissionRate: config.emissionRate,
        speed: config.speed,
        particleLife: config.particleLife,
        lifetime: config.lifetime,
        startScale: config.startScale,
        endScale: config.endScale,
        imageSize: config.imageSize?.slice() as [number, number] | undefined,
        startColor: config.startColor,
        endColor: config.endColor,
        sizeInMeters: config.sizeInMeters
      };
    case "rain":
    case "snow":
    case "fog":
      return {
        ...base,
        type: snapshot.type,
        intensity: config.intensity,
        speed: config.speed,
        color: config.color
      };
  }
}

function requireMaterial(
  material: EffectMaterialDescriptor | undefined,
  id: string
): EffectMaterialDescriptor {
  if (!material) {
    throw new Error(`Effect snapshot "${id}" requires a material descriptor.`);
  }
  return cloneMaterial(material);
}

function requirePosition(
  position: SerializableEffectConfig["position"],
  id: string
) {
  if (!position) {
    throw new Error(`Effect snapshot "${id}" requires a position.`);
  }
  return position;
}

function serializeMaterial(material: EffectMaterialDescriptor): EffectMaterialDescriptor {
  const serialized = cloneMaterial(material) as EffectMaterialDescriptor & Record<string, unknown>;
  for (const key of ["color", "baseWaterColor", "blendColor"] as const) {
    const value = serialized[key];
    if (value !== undefined) {
      serialized[key] = serializeColor(parseColorLike(value as never, `effect.material.${key}`));
    }
  }
  return serialized;
}

function serializeSpecificColors(
  config: EffectConfig
): Partial<Record<"startColor" | "endColor" | "color", ColorLike>> {
  const result: Partial<Record<"startColor" | "endColor" | "color", ColorLike>> = {};
  for (const key of ["startColor", "endColor", "color"] as const) {
    const value = (config as unknown as Record<string, unknown>)[key];
    if (value !== undefined) {
      result[key] = serializeColor(parseColorLike(value as ColorLike, `effect.${key}`));
    }
  }
  return result;
}

function cloneMaterial(material: EffectMaterialDescriptor): EffectMaterialDescriptor {
  assertJSONSafe(material, `Effect material "${material.type}"`);
  return JSON.parse(JSON.stringify(material)) as EffectMaterialDescriptor;
}

function validatePositions(positions: Cartesian3[], minimum: number, label: string): void {
  if (positions.length < minimum) {
    throw new Error(`${label} requires at least ${minimum} positions.`);
  }
  positions.forEach((position, index) => validatePosition(position, `${label} position ${index}`));
}

function validatePosition(position: Cartesian3, label: string): void {
  assertFinite(position.x, `${label}.x`);
  assertFinite(position.y, `${label}.y`);
  assertFinite(position.z, `${label}.z`);
}

function validateHeightArray(values: number[] | undefined, length: number, label: string): void {
  if (!values) {
    return;
  }
  if (values.length !== length) {
    throw new Error(`Flow wall ${label} length must match positions length.`);
  }
  values.forEach((value, index) => assertFinite(value, `Flow wall ${label}[${index}]`));
}

function validateOptionalPositive(value: number | undefined, label: string): void {
  if (value !== undefined) {
    assertPositive(value, label);
  }
}

function validateOptionalNonNegative(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function assertRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

function assertJSONSafe(value: unknown, label: string): void {
  try {
    JSON.stringify(value, (_key, item) => {
      if (typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") {
        throw new Error("unsupported value");
      }
      return item;
    });
  } catch {
    throw new Error(`${label} must contain JSON-safe data only.`);
  }
}

function cloneRecord<T extends Record<string, unknown>>(value: T | undefined): T | undefined {
  return value ? ({ ...value } as T) : undefined;
}

function cloneJSONRecord(
  value: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  assertJSONSafe(value, "Effect metadata");
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function assertNever(value: never): never {
  throw new Error(`Unsupported effect type "${String((value as EffectConfig).type)}".`);
}
