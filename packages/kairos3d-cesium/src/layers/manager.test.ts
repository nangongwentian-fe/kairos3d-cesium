import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { OperationCanceledError, OperationManager } from "../operations";
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

class TransactionalMemoryLayer implements LayerAdapter {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly runtime = {};
  show: boolean;
  order: number;
  attached = false;
  destroyed = false;

  readonly transaction = {
    prepare: vi.fn((_map: KairosMap) => undefined),
    attach: vi.fn((_map: KairosMap) => {
      if (this.config.metadata?.failAttach) {
        throw new Error(`attach failed: ${this.id}`);
      }
      this.attached = true;
    }),
    detach: vi.fn((_map: KairosMap) => {
      this.attached = false;
    })
  };
  readonly addTo = vi.fn(async (map: KairosMap) => {
    await this.transaction.prepare(map);
    await this.transaction.attach(map);
  });
  readonly remove = vi.fn(() => {
    this.attached = false;
  });

  constructor(private readonly config: XyzLayerConfig) {
    this.id = config.id ?? "transactional-memory";
    this.type = config.type;
    this.name = config.name;
    this.show = config.show ?? true;
    this.order = config.order ?? config.index ?? 0;
  }

  destroy(): void {
    this.remove();
    this.destroyed = true;
  }

  getState(): LayerState {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      show: this.show,
      order: this.order,
      config: this.toConfig()
    };
  }

  toConfig(): LayerConfig {
    return {
      ...this.config,
      id: this.id,
      show: this.show,
      order: this.order
    };
  }

  getRuntimeObjects(): unknown[] {
    return [this.runtime];
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

function createTransactionalRegistry(created: TransactionalMemoryLayer[]): LayerRegistry {
  const registry = new LayerRegistry();
  registry.register<XyzLayerConfig>("xyz", (config) => {
    const layer = new TransactionalMemoryLayer(config);
    created.push(layer);
    return layer;
  });
  return registry;
}

function createMapMock() {
  return {
    operations: new OperationManager(),
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

  it("reports batch progress through one layers operation", async () => {
    const created: MemoryLayer[] = [];
    const map = createMapMock();
    const manager = new LayerManager(map, createRegistry(created));
    const changes: Array<{ progress?: number; status: string }> = [];
    map.operations.on("change", (event) => {
      changes.push(event.data);
    });

    await manager.load(
      [
        {
          id: "base",
          type: "xyz",
          url: "https://example.com/base/{z}/{x}/{y}.png"
        },
        {
          id: "labels",
          type: "xyz",
          url: "https://example.com/labels/{z}/{x}/{y}.png"
        }
      ],
      { operationId: "load-layers" }
    );

    expect(map.operations.get("load-layers")).toMatchObject({
      kind: "layers.load",
      status: "succeeded",
      progress: 1
    });
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "running", progress: 0.5 }),
        expect.objectContaining({ status: "running", progress: 1 })
      ])
    );
  });

  it("cancels a batch and removes only layers added by that load", async () => {
    const created: MemoryLayer[] = [];
    const map = createMapMock();
    const registry = createRegistry(created);
    let release!: () => void;
    const pendingAdd = new Promise<void>((resolve) => {
      release = resolve;
    });
    registry.unregister("xyz");
    registry.register<XyzLayerConfig>("xyz", (config) => {
      const layer = new MemoryLayer(config);
      if (config.id === "new") {
        layer.addTo.mockImplementation(() => pendingAdd);
      }
      created.push(layer);
      return layer;
    });
    const manager = new LayerManager(map, registry);
    await manager.add({
      id: "old",
      type: "xyz",
      url: "https://example.com/old/{z}/{x}/{y}.png"
    });

    const loading = manager.load(
      [
        {
          id: "new",
          type: "xyz",
          url: "https://example.com/new/{z}/{x}/{y}.png"
        }
      ],
      { clear: true, operationId: "cancel-layers" }
    );
    await vi.waitFor(() => expect(created).toHaveLength(2));

    expect(map.operations.cancel("cancel-layers")).toBe(true);
    await expect(loading).rejects.toBeInstanceOf(OperationCanceledError);
    release();
    await vi.waitFor(() => expect(created[1].destroyed).toBe(true));

    expect(manager.list()).toEqual([]);
    expect(created[0].destroyed).toBe(true);
    expect(created[1].destroyed).toBe(true);
    expect(map.operations.get("cancel-layers")?.status).toBe("canceled");
  });

  it("cleans up when a final progress listener cancels the operation", async () => {
    const created: MemoryLayer[] = [];
    const map = createMapMock();
    const manager = new LayerManager(map, createRegistry(created));
    const loadListener = vi.fn();
    manager.on("load", loadListener);
    map.operations.on("change", (event) => {
      if (
        event.data.id === "cancel-final-progress" &&
        event.data.status === "running" &&
        event.data.progress === 1
      ) {
        map.operations.cancel(event.data.id);
      }
    });

    await expect(
      manager.load(
        [
          {
            id: "base",
            type: "xyz",
            url: "https://example.com/base/{z}/{x}/{y}.png"
          }
        ],
        { operationId: "cancel-final-progress" }
      )
    ).rejects.toBeInstanceOf(OperationCanceledError);

    expect(manager.list()).toEqual([]);
    expect(created[0].destroyed).toBe(true);
    expect(loadListener).not.toHaveBeenCalled();
  });

  it("cleans up when a load listener cancels the operation", async () => {
    const created: MemoryLayer[] = [];
    const map = createMapMock();
    const manager = new LayerManager(map, createRegistry(created));
    const loadListener = vi.fn(() => {
      map.operations.cancel("cancel-load-event");
    });
    manager.on("load", loadListener);

    await expect(
      manager.load(
        [
          {
            id: "base",
            type: "xyz",
            url: "https://example.com/base/{z}/{x}/{y}.png"
          }
        ],
        { operationId: "cancel-load-event" }
      )
    ).rejects.toBeInstanceOf(OperationCanceledError);

    expect(loadListener).toHaveBeenCalledOnce();
    expect(manager.list()).toEqual([]);
    expect(created[0].destroyed).toBe(true);
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

  it("stages a silent replacement and restores the same adapters on rollback", async () => {
    const created: TransactionalMemoryLayer[] = [];
    const manager = new LayerManager(
      createMapMock(),
      createTransactionalRegistry(created)
    );
    await manager.add({
      id: "old",
      type: "xyz",
      url: "https://example.com/old/{z}/{x}/{y}.png"
    });
    const oldLayer = created[0];
    const oldRuntime = oldLayer.runtime;
    const addListener = vi.fn();
    const clearListener = vi.fn();
    const loadListener = vi.fn();
    manager.on("add", addListener);
    manager.on("clear", clearListener);
    manager.on("load", loadListener);

    const stage = await manager.prepareTransaction(
      [{
        id: "new",
        type: "xyz",
        url: "https://example.com/new/{z}/{x}/{y}.png",
        flyTo: true
      }],
      { clear: true, flyTo: false }
    );
    const nextLayer = created[1];

    expect(manager.get("old")).toBe(oldLayer);
    expect(oldLayer.attached).toBe(true);
    expect(nextLayer.attached).toBe(false);
    expect(nextLayer.toConfig()).toMatchObject({ flyTo: false });

    await stage.commit();

    expect(manager.get("old")).toBeUndefined();
    expect(manager.get("new")).toBe(nextLayer);
    expect(oldLayer.attached).toBe(false);
    expect(nextLayer.attached).toBe(true);
    expect(addListener).not.toHaveBeenCalled();
    expect(clearListener).not.toHaveBeenCalled();
    expect(loadListener).not.toHaveBeenCalled();

    await stage.rollback();
    await stage.dispose();

    expect(manager.get("old")).toBe(oldLayer);
    expect(manager.getRuntimeObjects("old")).toEqual([oldRuntime]);
    expect(oldLayer.attached).toBe(true);
    expect(oldLayer.destroyed).toBe(false);
    expect(nextLayer.attached).toBe(false);
    expect(nextLayer.destroyed).toBe(true);
  });

  it("finalizes a replacement before publishing buffered manager events", async () => {
    const created: TransactionalMemoryLayer[] = [];
    const manager = new LayerManager(
      createMapMock(),
      createTransactionalRegistry(created)
    );
    await manager.add({
      id: "old",
      type: "xyz",
      url: "https://example.com/old/{z}/{x}/{y}.png"
    });
    const addListener = vi.fn();
    const clearListener = vi.fn();
    const loadListener = vi.fn();
    manager.on("add", addListener);
    manager.on("clear", clearListener);
    manager.on("load", loadListener);

    const stage = await manager.prepareTransaction(
      [{
        id: "new",
        type: "xyz",
        url: "https://example.com/new/{z}/{x}/{y}.png"
      }],
      { clear: true }
    );
    await stage.commit();
    await stage.finalize();

    expect(created[0].destroyed).toBe(true);
    expect(created[1].destroyed).toBe(false);
    expect(clearListener).not.toHaveBeenCalled();

    stage.publish();

    expect(clearListener).toHaveBeenCalledOnce();
    expect(addListener).toHaveBeenCalledOnce();
    expect(loadListener).toHaveBeenCalledOnce();
    expect(manager.get("new")).toBe(created[1]);
  });

  it("rolls back every attempted layer when a transactional attach fails", async () => {
    const created: TransactionalMemoryLayer[] = [];
    const manager = new LayerManager(
      createMapMock(),
      createTransactionalRegistry(created)
    );
    await manager.add({
      id: "old",
      type: "xyz",
      url: "https://example.com/old/{z}/{x}/{y}.png"
    });
    const oldLayer = created[0];
    const stage = await manager.prepareTransaction(
      [
        {
          id: "first",
          type: "xyz",
          url: "https://example.com/first/{z}/{x}/{y}.png"
        },
        {
          id: "broken",
          type: "xyz",
          url: "https://example.com/broken/{z}/{x}/{y}.png",
          metadata: { failAttach: true }
        }
      ],
      { clear: true }
    );

    await expect(stage.commit()).rejects.toThrow("attach failed: broken");
    await stage.rollback();
    await stage.dispose();

    expect(manager.list()).toEqual([oldLayer]);
    expect(oldLayer.attached).toBe(true);
    expect(created[1]).toMatchObject({ attached: false, destroyed: true });
    expect(created[2]).toMatchObject({ attached: false, destroyed: true });
  });

  it("rejects an existing non-transactional adapter before preparing replacements", async () => {
    const createdLegacy: MemoryLayer[] = [];
    const createdNext: TransactionalMemoryLayer[] = [];
    const registry = new LayerRegistry();
    registry.register<XyzLayerConfig>("xyz", (config) => {
      if (config.id === "old") {
        const layer = new MemoryLayer(config);
        createdLegacy.push(layer);
        return layer;
      }
      const layer = new TransactionalMemoryLayer(config);
      createdNext.push(layer);
      return layer;
    });
    const manager = new LayerManager(createMapMock(), registry);
    await manager.add({
      id: "old",
      type: "xyz",
      url: "https://example.com/old/{z}/{x}/{y}.png"
    });

    await expect(
      manager.prepareTransaction(
        [{
          id: "new",
          type: "xyz",
          url: "https://example.com/new/{z}/{x}/{y}.png"
        }],
        { clear: true }
      )
    ).rejects.toThrow("does not support transactional loading");

    expect(manager.get("old")).toBe(createdLegacy[0]);
    expect(createdLegacy[0].destroyed).toBe(false);
    expect(createdNext[0].transaction.prepare).not.toHaveBeenCalled();
    expect(createdNext[0].destroyed).toBe(true);
  });
});
