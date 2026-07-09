import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { LayerManager } from "./manager";
import { LayerRegistry } from "./registry";
import type { LayerAdapter, LayerConfig, LayerState, XyzLayerConfig } from "./types";

class MemoryLayer implements LayerAdapter {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  show: boolean;
  order: number;
  opacity?: number;
  destroyed = false;

  readonly addTo = vi.fn();
  readonly remove = vi.fn(() => {
    this.destroyed = true;
  });
  readonly flyTo = vi.fn(async () => true);

  constructor(private readonly config: XyzLayerConfig) {
    this.id = config.id ?? "memory";
    this.type = config.type;
    this.name = config.name;
    this.show = config.show ?? true;
    this.order = config.order ?? config.index ?? 0;
    this.opacity = config.alpha;
  }

  destroy(): void {
    this.remove();
  }

  getState(): LayerState {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      group: this.config.group,
      show: this.show,
      order: this.order,
      opacity: this.opacity,
      metadata: this.config.metadata,
      config: this.toConfig()
    };
  }

  toConfig(): LayerConfig {
    return {
      ...this.config,
      id: this.id,
      show: this.show,
      order: this.order,
      alpha: this.opacity
    };
  }

  getRuntimeObjects(): unknown[] {
    return [this];
  }

  setOpacity(alpha: number): void {
    this.opacity = alpha;
  }

  setOrder(order: number): void {
    this.order = order;
  }
}

function createRegistry(created: MemoryLayer[]): LayerRegistry {
  const registry = new LayerRegistry();
  registry.register<XyzLayerConfig>("xyz", (config) => {
    const layer = new MemoryLayer(config);
    created.push(layer);
    return layer;
  });
  return registry;
}

function createMapMock() {
  return {
    viewer: {
      flyTo: vi.fn(async () => true)
    }
  } as unknown as KairosMap;
}

describe("LayerManager", () => {
  it("lists states by order and updates visibility", async () => {
    const created: MemoryLayer[] = [];
    const manager = new LayerManager(createMapMock(), createRegistry(created));
    const listener = vi.fn();
    manager.on("update", listener);

    await manager.add({
      id: "labels",
      type: "xyz",
      url: "https://example.com/labels/{z}/{x}/{y}.png",
      group: "overlay",
      order: 2
    });
    await manager.add({
      id: "base",
      type: "xyz",
      url: "https://example.com/base/{z}/{x}/{y}.png",
      group: "base",
      order: 0
    });

    expect(manager.list().map((layer) => layer.id)).toEqual(["base", "labels"]);
    expect(manager.listByGroup("overlay").map((layer) => layer.id)).toEqual(["labels"]);
    expect(manager.getRuntimeObjects("base")).toEqual([created[1]]);

    const hidden = manager.setShow("labels", false);
    const visible = manager.toggle("labels");

    expect(hidden.show).toBe(false);
    expect(visible.show).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("updates opacity, order, and group visibility", async () => {
    const created: MemoryLayer[] = [];
    const manager = new LayerManager(createMapMock(), createRegistry(created));
    const moveListener = vi.fn();
    manager.on("move", moveListener);

    await manager.add({
      id: "base",
      type: "xyz",
      url: "https://example.com/base/{z}/{x}/{y}.png",
      group: "base",
      order: 0
    });
    await manager.add({
      id: "labels",
      type: "xyz",
      url: "https://example.com/labels/{z}/{x}/{y}.png",
      group: "base",
      order: 1
    });

    expect(manager.setOpacity("base", 0.35)).toMatchObject({ opacity: 0.35 });
    expect(manager.move("base", 4)).toMatchObject({ order: 4 });
    expect(manager.list().map((layer) => layer.id)).toEqual(["labels", "base"]);
    expect(manager.setGroupShow("base", false).map((state) => state.show)).toEqual([
      false,
      false
    ]);
    expect(moveListener).toHaveBeenCalledOnce();
  });

  it("exports configs and loads them back", async () => {
    const created: MemoryLayer[] = [];
    const manager = new LayerManager(createMapMock(), createRegistry(created));
    const loadListener = vi.fn();
    manager.on("load", loadListener);

    await manager.add({
      id: "old",
      type: "xyz",
      url: "https://example.com/old/{z}/{x}/{y}.png"
    });

    const loaded = await manager.load(
      [
        {
          id: "base",
          type: "xyz",
          url: "https://example.com/base/{z}/{x}/{y}.png",
          group: "base",
          order: 1,
          metadata: { source: "test" }
        }
      ],
      { clear: true, flyTo: false }
    );

    expect(created[0].destroyed).toBe(true);
    expect(loaded.map((layer) => layer.id)).toEqual(["base"]);
    expect(manager.toJSON()).toEqual([
      expect.objectContaining({
        id: "base",
        type: "xyz",
        group: "base",
        order: 1,
        flyTo: false,
        metadata: { source: "test" }
      })
    ]);
    expect(loadListener).toHaveBeenCalledWith(
      expect.objectContaining({ data: loaded })
    );
  });

  it("removes partially loaded layers when batch loading fails", async () => {
    const created: MemoryLayer[] = [];
    const manager = new LayerManager(createMapMock(), createRegistry(created));

    await expect(
      manager.load([
        {
          id: "base",
          type: "xyz",
          url: "https://example.com/base/{z}/{x}/{y}.png"
        },
        {
          id: "base",
          type: "xyz",
          url: "https://example.com/duplicate/{z}/{x}/{y}.png"
        }
      ])
    ).rejects.toThrow('Layer id "base" already exists.');

    expect(created[0].destroyed).toBe(true);
    expect(manager.list()).toEqual([]);
  });

  it("flies to a managed layer and validates inputs", async () => {
    const created: MemoryLayer[] = [];
    const manager = new LayerManager(createMapMock(), createRegistry(created));
    await manager.add({
      id: "base",
      type: "xyz",
      url: "https://example.com/base/{z}/{x}/{y}.png"
    });

    await expect(manager.flyTo("base")).resolves.toBe(true);
    expect(created[0].flyTo).toHaveBeenCalledOnce();
    expect(() => manager.setOpacity("base", 2)).toThrow(
      "Layer opacity must be a number between 0 and 1."
    );
    expect(() => manager.move("base", Number.NaN)).toThrow(
      "Layer order must be a finite number."
    );
  });
});
