import type { KairosMap } from "../core";
import { Evented } from "../core";
import {
  assertRuntimeMutationAllowed,
  getRuntimeLeaseOwner,
  runWithRuntimeLease,
  runWithRuntimeWriteLease,
  type RuntimeLeaseOwnerToken
} from "../concurrency/lease";
import { runOrReuseOperation } from "../operations/manager";
import type { PreparedSceneStage } from "../scene/transaction";
import { registerDefaultLayerFactories } from "./defaults";
import { layerRegistry, type LayerRegistry } from "./registry";
import type { LayerAdapter, LayerConfig, LayerLoadOptions, LayerState } from "./types";

export interface LayerManagerEvents {
  add: LayerAdapter;
  remove: LayerAdapter;
  clear: undefined;
  update: LayerState;
  move: LayerState;
  load: LayerAdapter[];
}

/** @internal Detached adapter set validated for one transactional layer load. */
export interface LayerTransactionPreflight {
  readonly owner: LayerManager;
  readonly clear: boolean;
  readonly oldEntries: Array<[string, LayerAdapter]>;
  readonly oldOrderOverrides: Array<[string, number]>;
  readonly oldOpacityOverrides: Array<[string, number]>;
  readonly nextLayers: LayerAdapter[];
  consumed: boolean;
}

export class LayerManager extends Evented<LayerManagerEvents> {
  private readonly layers = new Map<string, LayerAdapter>();
  private readonly orderOverrides = new Map<string, number>();
  private readonly opacityOverrides = new Map<string, number>();

  constructor(
    private readonly map: KairosMap,
    private readonly registry: LayerRegistry = layerRegistry
  ) {
    super();
    registerDefaultLayerFactories();
  }

  async add(config: LayerConfig): Promise<LayerAdapter> {
    return runWithRuntimeLease(
      this.map.concurrency,
      {
        kind: "layers.add",
        mode: "write",
        resources: ["layers"],
        conflictPolicy: "reject"
      },
      () => this.addInternal(config)
    );
  }

  private async addInternal(config: LayerConfig): Promise<LayerAdapter> {
    const layer = await this.registry.create(config);
    if (this.layers.has(layer.id)) {
      layer.destroy();
      throw new Error(`Layer id "${layer.id}" already exists.`);
    }

    try {
      await layer.addTo(this.map);
    } catch (error) {
      layer.destroy();
      throw error;
    }
    if (this.map.isDestroyed()) {
      layer.destroy();
      throw new Error(`Layer "${layer.id}" finished loading after the map was destroyed.`);
    }
    this.layers.set(layer.id, layer);
    if (!layer.getState) {
      this.orderOverrides.set(layer.id, getConfigOrder(config));
    }
    this.emit("add", layer);
    return layer;
  }

  get(id: string): LayerAdapter | undefined {
    return this.layers.get(id);
  }

  list(): LayerAdapter[] {
    return [...this.layers.values()].sort(
      (left, right) => this.getLayerState(left).order - this.getLayerState(right).order
    );
  }

  listState(): LayerState[] {
    return this.list().map((layer) => this.getLayerState(layer));
  }

  listByGroup(group: string): LayerAdapter[] {
    return this.list().filter((layer) => this.getLayerState(layer).group === group);
  }

  findByRuntimeObject(object: unknown): LayerAdapter | undefined {
    return this.list().find((layer) => layer.ownsRuntimeObject?.(object));
  }

  getRuntimeObjects(id: string): unknown[] {
    return this.requireLayer(id).getRuntimeObjects?.() ?? [];
  }

  setShow(id: string, show: boolean): LayerState {
    return this.runMutation("layers.setShow", () => this.setShowInternal(id, show));
  }

  private setShowInternal(id: string, show: boolean): LayerState {
    const layer = this.requireLayer(id);
    layer.show = show;
    const state = this.getLayerState(layer);
    this.emit("update", state);
    return state;
  }

  toggle(id: string): LayerState {
    const layer = this.requireLayer(id);
    return this.setShow(id, !layer.show);
  }

  setGroupShow(group: string, show: boolean): LayerState[] {
    return this.runMutation("layers.setGroupShow", () =>
      this.listByGroup(group).map((layer) => this.setShowInternal(layer.id, show))
    );
  }

  setOpacity(id: string, alpha: number): LayerState {
    return this.runMutation("layers.setOpacity", () => {
    const opacity = normalizeOpacity(alpha);
    const layer = this.requireLayer(id);
    layer.setOpacity?.(opacity);
    this.opacityOverrides.set(id, opacity);
    const state = this.getLayerState(layer);
    this.emit("update", state);
    return state;
    });
  }

  move(id: string, order: number): LayerState {
    return this.runMutation("layers.move", () => {
    const nextOrder = normalizeOrder(order);
    const layer = this.requireLayer(id);
    layer.setOrder?.(nextOrder);
    this.orderOverrides.set(id, nextOrder);
    const state = this.getLayerState(layer);
    this.emit("move", state);
    return state;
    });
  }

  async flyTo(id: string): Promise<boolean> {
    return runWithRuntimeLease(
      this.map.concurrency,
      {
        kind: "layers.flyTo",
        mode: "write",
        resources: ["camera"],
        conflictPolicy: "reject"
      },
      async () => {
        const layer = this.requireLayer(id);
        if (layer.flyTo) {
          return layer.flyTo();
        }

        const target = this.getRuntimeObjects(id)[0] as Parameters<
          typeof this.map.viewer.flyTo
        >[0] | undefined;
        return target ? this.map.viewer.flyTo(target) : false;
      }
    );
  }

  toJSON(): LayerConfig[] {
    return this.listState()
      .map((state) => state.config)
      .filter((config): config is LayerConfig => Boolean(config));
  }

  async load(configs: LayerConfig[], options: LayerLoadOptions = {}): Promise<LayerAdapter[]> {
    return runOrReuseOperation(
      this.map.operations,
      { kind: "layers.load", label: "Load layers" },
      options,
      async (context) => {
        return runWithRuntimeLease(
          this.map.concurrency,
          {
            kind: "layers.load",
            mode: "write",
            resources: ["layers"],
            operationId: context.id,
            signal: context.signal,
            conflictPolicy: "reject",
            ownerToken: getRuntimeLeaseOwner(options)
          },
          async () => {
            context.throwIfAborted();
            if (options.clear) {
              this.clearInternal();
            }

            const layers: LayerAdapter[] = [];
            try {
              if (configs.length === 0) {
                context.reportProgress(1, "layers");
                context.throwIfAborted();
              }
              for (let index = 0; index < configs.length; index += 1) {
                context.throwIfAborted();
                const config = configs[index];
                const nextConfig = options.flyTo === undefined
                  ? config
                  : { ...config, flyTo: options.flyTo };
                const layer = await this.addInternal(nextConfig);
                layers.push(layer);
                context.throwIfAborted();
                context.reportProgress((index + 1) / configs.length, "layers");
                context.throwIfAborted();
              }

              context.throwIfAborted();
              this.emit("load", layers);
              context.throwIfAborted();
              return layers;
            } catch (error) {
              for (const layer of [...layers].reverse()) {
                if (this.layers.get(layer.id) === layer) {
                  this.removeInternal(layer.id);
                }
              }
              throw error;
            }
          }
        );
      }
    );
  }

  /** @internal Validates transactional adapters without creating Cesium runtime. */
  async preflightTransaction(
    configs: LayerConfig[],
    options: { clear?: boolean; flyTo?: boolean } = {}
  ): Promise<LayerTransactionPreflight> {
    this.assertMutationAllowed(
      "scene.layers.preflight",
      getRuntimeLeaseOwner(options)
    );
    const clear = options.clear ?? false;
    const oldEntries = [...this.layers.entries()];
    const oldOrderOverrides = [...this.orderOverrides.entries()];
    const oldOpacityOverrides = [...this.opacityOverrides.entries()];
    const nextLayers: LayerAdapter[] = [];

    try {
      for (const config of configs) {
        const nextConfig = options.flyTo === undefined
          ? config
          : { ...config, flyTo: options.flyTo };
        nextLayers.push(await this.registry.create(nextConfig));
      }

      assertTransactionLayerIds(nextLayers, clear ? undefined : this.layers);
      const unsupported = [
        ...(clear ? oldEntries.map(([, layer]) => layer) : []),
        ...nextLayers
      ].find((layer) => !layer.transaction);
      if (unsupported) {
        throw new Error(
          `Layer adapter "${unsupported.id}" (type "${unsupported.type}") does not support transactional loading.`
        );
      }

      for (const layer of nextLayers) {
        await layer.transaction!.preflight?.(this.map);
      }
    } catch (error) {
      destroyLayersBestEffort(nextLayers);
      throw error;
    }

    return {
      owner: this,
      clear,
      oldEntries,
      oldOrderOverrides,
      oldOpacityOverrides,
      nextLayers,
      consumed: false
    };
  }

  /** @internal Used by SceneStateManager to stage a layer replacement without nested operations. */
  async prepareTransaction(
    configs: LayerConfig[],
    options: { clear?: boolean; flyTo?: boolean } = {},
    preflight?: LayerTransactionPreflight
  ): Promise<PreparedSceneStage> {
    this.assertMutationAllowed(
      "scene.layers.prepare",
      getRuntimeLeaseOwner(options)
    );
    const validated = preflight ?? await this.preflightTransaction(configs, options);
    const clear = options.clear ?? false;
    if (validated.owner !== this || validated.clear !== clear || validated.consumed) {
      throw new Error("Layer transaction preflight is invalid or has already been consumed.");
    }
    validated.consumed = true;
    const {
      oldEntries,
      oldOrderOverrides,
      oldOpacityOverrides,
      nextLayers
    } = validated;

    try {
      for (const layer of nextLayers) {
        await layer.transaction!.prepare(this.map);
      }
    } catch (error) {
      destroyLayersBestEffort(nextLayers);
      throw error;
    }

    const oldLayers = oldEntries.map(([, layer]) => layer);
    const attemptedOldDetach: LayerAdapter[] = [];
    const attemptedNextAttach: LayerAdapter[] = [];
    let commitStarted = false;
    let committed = false;
    let rolledBack = false;
    let finalized = false;
    let disposed = false;
    let published = false;

    return {
      phase: "layers",
      commit: async () => {
        if (committed) {
          return;
        }
        if (commitStarted || rolledBack || finalized || disposed) {
          throw new Error("Layer transaction can no longer be committed.");
        }

        this.assertTransactionBaseUnchanged(
          oldEntries,
          oldOrderOverrides,
          oldOpacityOverrides
        );
        commitStarted = true;

        if (clear) {
          for (const layer of [...oldLayers].reverse()) {
            attemptedOldDetach.push(layer);
            await layer.transaction!.detach(this.map);
          }
        }

        for (const layer of nextLayers) {
          attemptedNextAttach.push(layer);
          await layer.transaction!.attach(this.map);
        }

        if (clear) {
          this.layers.clear();
          this.orderOverrides.clear();
          this.opacityOverrides.clear();
        }
        for (const layer of nextLayers) {
          this.layers.set(layer.id, layer);
          if (!layer.getState) {
            const config = layer.toConfig?.();
            this.orderOverrides.set(layer.id, config ? getConfigOrder(config) : 0);
          }
        }
        committed = true;
      },
      rollback: async () => {
        if (!commitStarted || rolledBack || finalized || disposed) {
          return;
        }

        const errors: unknown[] = [];
        for (const layer of [...attemptedNextAttach].reverse()) {
          try {
            await layer.transaction!.detach(this.map);
          } catch (error) {
            errors.push(error);
          }
        }
        for (const layer of [...attemptedOldDetach].reverse()) {
          try {
            await layer.transaction!.attach(this.map);
          } catch (error) {
            errors.push(error);
          }
        }

        replaceMapEntries(this.layers, oldEntries);
        replaceMapEntries(this.orderOverrides, oldOrderOverrides);
        replaceMapEntries(this.opacityOverrides, oldOpacityOverrides);
        committed = false;
        rolledBack = true;

        if (errors.length > 0) {
          throw new AggregateError(errors, "Failed to roll back the layer transaction.");
        }
      },
      finalize: () => {
        if (finalized) {
          return;
        }
        if (!committed || disposed) {
          throw new Error("Layer transaction must be committed before it is finalized.");
        }

        const errors = clear ? destroyLayers(oldLayers) : [];
        finalized = true;
        if (errors.length > 0) {
          throw new AggregateError(errors, "Failed to destroy replaced layers.");
        }
      },
      dispose: () => {
        if (disposed || finalized) {
          return;
        }
        if (committed && !rolledBack) {
          throw new Error("Layer transaction must be rolled back before it is disposed.");
        }

        const errors = destroyLayers(nextLayers);
        disposed = true;
        if (errors.length > 0) {
          throw new AggregateError(errors, "Failed to dispose prepared layers.");
        }
      },
      publish: () => {
        if (published) {
          return;
        }
        if (!finalized) {
          throw new Error("Layer transaction must be finalized before events are published.");
        }

        if (clear) {
          this.emit("clear", undefined);
        }
        for (const layer of nextLayers) {
          this.emit("add", layer);
        }
        this.emit("load", [...nextLayers]);
        published = true;
      }
    };
  }

  remove(id: string): boolean {
    return this.runMutation("layers.remove", () => this.removeInternal(id));
  }

  private removeInternal(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer) {
      return false;
    }

    layer.destroy();
    this.layers.delete(id);
    this.orderOverrides.delete(id);
    this.opacityOverrides.delete(id);
    this.emit("remove", layer);
    return true;
  }

  clear(): void {
    this.runMutation("layers.clear", () => this.clearInternal());
  }

  private clearInternal(): void {
    for (const layer of [...this.layers.values()].reverse()) {
      layer.destroy();
    }
    this.layers.clear();
    this.orderOverrides.clear();
    this.opacityOverrides.clear();
    this.emit("clear", undefined);
  }

  destroy(): void {
    this.clearInternal();
    this.off();
  }

  private requireLayer(id: string): LayerAdapter {
    const layer = this.layers.get(id);
    if (!layer) {
      throw new Error(`Layer id "${id}" does not exist.`);
    }

    return layer;
  }

  private getLayerState(layer: LayerAdapter): LayerState {
    const fallback: LayerState = {
      id: layer.id,
      type: layer.type,
      name: layer.name,
      show: layer.show,
      order: 0,
      config: layer.toConfig?.()
    };
    const state = layer.getState?.() ?? fallback;
    const order = this.orderOverrides.get(layer.id) ?? state.order;
    const opacity = this.opacityOverrides.has(layer.id)
      ? this.opacityOverrides.get(layer.id)
      : state.opacity;
    const config = state.config
      ? ({ ...state.config, show: layer.show, order } as LayerConfig)
      : undefined;

    return {
      ...state,
      show: layer.show,
      order,
      opacity,
      config
    };
  }

  private assertTransactionBaseUnchanged(
    layers: Array<[string, LayerAdapter]>,
    orderOverrides: Array<[string, number]>,
    opacityOverrides: Array<[string, number]>
  ): void {
    if (
      !mapEntriesEqual(this.layers, layers) ||
      !mapEntriesEqual(this.orderOverrides, orderOverrides) ||
      !mapEntriesEqual(this.opacityOverrides, opacityOverrides)
    ) {
      throw new Error("Layers changed while the transaction was being prepared.");
    }
  }

  private assertMutationAllowed(
    kind: string,
    ownerToken?: RuntimeLeaseOwnerToken
  ): void {
    assertRuntimeMutationAllowed(
      this.map.concurrency,
      "layers",
      kind,
      ownerToken
    );
  }

  private runMutation<T>(kind: string, task: () => T): T {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind, resources: ["layers"] },
      () => task()
    );
  }
}

function assertTransactionLayerIds(
  layers: LayerAdapter[],
  existing: ReadonlyMap<string, LayerAdapter> | undefined
): void {
  const ids = new Set<string>();
  for (const layer of layers) {
    if (ids.has(layer.id) || existing?.has(layer.id)) {
      throw new Error(`Layer id "${layer.id}" already exists.`);
    }
    ids.add(layer.id);
  }
}

function mapEntriesEqual<K, V>(map: ReadonlyMap<K, V>, entries: Array<[K, V]>): boolean {
  if (map.size !== entries.length) {
    return false;
  }
  return entries.every(([key, value]) => map.get(key) === value);
}

function replaceMapEntries<K, V>(map: Map<K, V>, entries: Array<[K, V]>): void {
  map.clear();
  for (const [key, value] of entries) {
    map.set(key, value);
  }
}

function destroyLayers(layers: LayerAdapter[]): unknown[] {
  const errors: unknown[] = [];
  for (const layer of [...layers].reverse()) {
    try {
      layer.destroy();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function destroyLayersBestEffort(layers: LayerAdapter[]): void {
  destroyLayers(layers);
}

function getConfigOrder(config: LayerConfig): number {
  if (typeof config.order === "number") {
    return config.order;
  }

  if ("index" in config && typeof config.index === "number") {
    return config.index;
  }

  return 0;
}

function normalizeOrder(order: number): number {
  if (!Number.isFinite(order)) {
    throw new Error("Layer order must be a finite number.");
  }

  return Math.floor(order);
}

function normalizeOpacity(alpha: number): number {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new Error("Layer opacity must be a number between 0 and 1.");
  }

  return alpha;
}
