import type { KairosMap } from "../core";
import { Evented } from "../core";
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
    const layer = await this.registry.create(config);
    if (this.layers.has(layer.id)) {
      throw new Error(`Layer id "${layer.id}" already exists.`);
    }

    await layer.addTo(this.map);
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
    return this.listByGroup(group).map((layer) => this.setShow(layer.id, show));
  }

  setOpacity(id: string, alpha: number): LayerState {
    const opacity = normalizeOpacity(alpha);
    const layer = this.requireLayer(id);
    layer.setOpacity?.(opacity);
    this.opacityOverrides.set(id, opacity);
    const state = this.getLayerState(layer);
    this.emit("update", state);
    return state;
  }

  move(id: string, order: number): LayerState {
    const nextOrder = normalizeOrder(order);
    const layer = this.requireLayer(id);
    layer.setOrder?.(nextOrder);
    this.orderOverrides.set(id, nextOrder);
    const state = this.getLayerState(layer);
    this.emit("move", state);
    return state;
  }

  async flyTo(id: string): Promise<boolean> {
    const layer = this.requireLayer(id);
    if (layer.flyTo) {
      return layer.flyTo();
    }

    const target = this.getRuntimeObjects(id)[0] as Parameters<
      typeof this.map.viewer.flyTo
    >[0] | undefined;
    return target ? this.map.viewer.flyTo(target) : false;
  }

  toJSON(): LayerConfig[] {
    return this.listState()
      .map((state) => state.config)
      .filter((config): config is LayerConfig => Boolean(config));
  }

  async load(configs: LayerConfig[], options: LayerLoadOptions = {}): Promise<LayerAdapter[]> {
    if (options.clear) {
      this.clear();
    }

    const layers: LayerAdapter[] = [];
    for (const config of configs) {
      const nextConfig = options.flyTo === undefined
        ? config
        : { ...config, flyTo: options.flyTo };
      layers.push(await this.add(nextConfig));
    }

    this.emit("load", layers);
    return layers;
  }

  remove(id: string): boolean {
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
    for (const layer of [...this.layers.values()].reverse()) {
      layer.destroy();
    }
    this.layers.clear();
    this.orderOverrides.clear();
    this.opacityOverrides.clear();
    this.emit("clear", undefined);
  }

  destroy(): void {
    this.clear();
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
