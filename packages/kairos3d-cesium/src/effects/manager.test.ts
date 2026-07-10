import {
  Cartesian3,
  Clock,
  Event as CesiumEvent,
  JulianDate,
  Material
} from "cesium";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core/map";
import { MaterialManager } from "../materials";
import { OperationManager } from "../operations";
import { EffectManager } from "./manager";
import type { EffectConfig, EffectSnapshot } from "./types";

beforeAll(() => {
  vi.stubGlobal("HTMLCanvasElement", class HTMLCanvasElementMock {});
  vi.stubGlobal("HTMLImageElement", class HTMLImageElementMock {});
  vi.stubGlobal("HTMLVideoElement", class HTMLVideoElementMock {});
  vi.stubGlobal("ImageBitmap", class ImageBitmapMock {});
  vi.stubGlobal("OffscreenCanvas", class OffscreenCanvasMock {});
});

describe("EffectManager", () => {
  it("creates all nine effect runtimes and shares one ticker", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);

    for (const config of createAllEffectConfigs()) {
      await manager.add(config);
    }

    expect(manager.list().map((effect) => effect.type)).toEqual([
      "flow-line",
      "flow-wall",
      "pulse-circle",
      "radar-scan",
      "water-surface",
      "particle",
      "rain",
      "snow",
      "fog"
    ]);
    expect(manager.getRuntimeObjectCount()).toBe(9);
    expect(manager.getAnimatedCount()).toBe(8);
    expect(fixture.primitives).toHaveLength(6);
    expect(fixture.stages).toHaveLength(3);
    expect(fixture.onTick.numberOfListeners).toBe(1);

    fixture.clock.currentTime = JulianDate.addSeconds(
      fixture.clock.currentTime,
      1,
      new JulianDate()
    );
    fixture.onTick.raiseEvent(fixture.clock);
    expect(fixture.requestRender).toHaveBeenCalled();

    manager.clear();
    manager.clear();
    expect(fixture.primitives).toHaveLength(0);
    expect(fixture.stages).toHaveLength(0);
    expect(fixture.onTick.numberOfListeners).toBe(0);
    expect(manager.remove("missing")).toBe(false);
  });

  it("advances Fabric animation from monotonic wall-clock time", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add(createAllEffectConfigs()[0]);
    const collection = manager.getRuntimeObjects("flow-line-1")[0] as {
      get(index: number): { material: Material };
    };
    const material = collection.get(0).material;
    const now = vi.spyOn(performance, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_000);

    fixture.onTick.raiseEvent(fixture.clock);
    fixture.onTick.raiseEvent(fixture.clock);

    expect(material.uniforms.time).toBeCloseTo(1);
    now.mockRestore();
    manager.destroy();
  });

  it("rejects duplicate pending ids and invalidates async add on destroy", async () => {
    const firstFixture = createMapFixture();
    const firstManager = new EffectManager(firstFixture.map);
    const firstDeferred = deferredMaterial(firstFixture.materials, "slow-add");
    const config = slowFlowConfig("pending-add", "slow-add");
    const firstAdd = firstManager.add(config);

    await expect(firstManager.add(config)).rejects.toThrow("operation in progress");
    firstDeferred.resolve(Material.fromType(Material.ColorType));
    await expect(firstAdd).resolves.toMatchObject({ id: "pending-add" });
    expect(firstFixture.primitives).toHaveLength(1);
    firstManager.clear();
    expect(firstFixture.primitives).toHaveLength(0);

    const secondFixture = createMapFixture();
    const secondManager = new EffectManager(secondFixture.map);
    const secondDeferred = deferredMaterial(secondFixture.materials, "slow-destroy");
    const pending = secondManager.add(slowFlowConfig("destroyed-add", "slow-destroy"));
    secondManager.destroy();
    secondDeferred.resolve(Material.fromType(Material.ColorType));

    await expect(pending).rejects.toThrow("superseded");
    expect(secondManager.list()).toHaveLength(0);
    expect(secondFixture.primitives).toHaveLength(0);
    expect(secondFixture.onTick.numberOfListeners).toBe(0);
  });

  it("does not resurrect an effect removed during async update", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add(createAllEffectConfigs()[0]);
    const deferred = deferredMaterial(fixture.materials, "slow-update");
    const pending = manager.update("flow-line-1", {
      material: { type: "slow-update", options: {} }
    });

    manager.remove("flow-line-1");
    deferred.resolve(Material.fromType(Material.ColorType));

    await expect(pending).rejects.toThrow("superseded");
    expect(manager.get("flow-line-1")).toBeUndefined();
    expect(fixture.primitives).toHaveLength(0);
    expect(fixture.onTick.numberOfListeners).toBe(0);
  });

  it("updates by preparing the replacement first and preserves the old runtime on failure", async () => {
    const fixture = createMapFixture();
    fixture.materials.register({
      type: "broken",
      targets: ["primitive"],
      createMaterial: async () => {
        throw new Error("material failed");
      }
    });
    const manager = new EffectManager(fixture.map);
    await manager.add(createAllEffectConfigs()[0]);
    const original = manager.getRuntimeObjects("flow-line-1")[0];

    await expect(
      manager.update("flow-line-1", {
        material: { type: "broken", options: {} }
      })
    ).rejects.toThrow("material failed");
    expect(manager.getRuntimeObjects("flow-line-1")[0]).toBe(original);
    expect(fixture.primitives).toHaveLength(1);

    await manager.update("flow-line-1", {
      width: 7,
      material: { type: "flow", color: "#35d07f", speed: 2 }
    });
    expect(manager.getRuntimeObjects("flow-line-1")[0]).not.toBe(original);
    expect(manager.get("flow-line-1")?.config).toMatchObject({ width: 7 });
    expect(fixture.primitives).toHaveLength(1);
  });

  it("cancels add and destroys the prepared runtime before commit", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    const deferred = deferredMaterial(fixture.materials, "slow-canceled-add");
    const material = Material.fromType(Material.ColorType);
    const destroy = vi.spyOn(material, "destroy");
    const controller = new AbortController();
    const config: EffectConfig = {
      id: "canceled-add",
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(114, 22),
      radius: 100,
      material: { type: "slow-canceled-add", options: {} }
    };
    const pending = manager.add(
      config,
      { signal: controller.signal, operationId: "effects-add-canceled" }
    );

    await deferred.started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      name: "OperationCanceledError",
      operationId: "effects-add-canceled"
    });
    await expect(manager.add(config)).rejects.toThrow("operation in progress");
    deferred.resolve(material);
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());

    expect(manager.get("canceled-add")).toBeUndefined();
    expect(fixture.primitives).toHaveLength(0);
    expect(fixture.operations.get("effects-add-canceled")?.status).toBe("canceled");
  });

  it("cancels update without replacing the old runtime", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add({
      id: "stable-pulse",
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(114, 22),
      radius: 100
    });
    const original = manager.getRuntimeObjects("stable-pulse")[0];
    const deferred = deferredMaterial(fixture.materials, "slow-canceled-update");
    const material = Material.fromType(Material.ColorType);
    const destroy = vi.spyOn(material, "destroy");
    const controller = new AbortController();
    const pending = manager.update(
      "stable-pulse",
      { material: { type: "slow-canceled-update", options: {} } },
      { signal: controller.signal, operationId: "effects-update-canceled" }
    );

    await deferred.started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "OperationCanceledError" });
    await expect(manager.update("stable-pulse", { radius: 200 })).rejects.toThrow(
      "operation in progress"
    );
    deferred.resolve(material);
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());

    expect(manager.getRuntimeObjects("stable-pulse")[0]).toBe(original);
    expect(fixture.primitives).toEqual([original]);
  });

  it("cancels load before clear and reports progress for successful loads", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add({ id: "existing-fog", type: "fog", intensity: 0.2 });
    const deferred = deferredMaterial(fixture.materials, "slow-canceled-load");
    const material = Material.fromType(Material.ColorType);
    const destroy = vi.spyOn(material, "destroy");
    const controller = new AbortController();
    const snapshot: EffectSnapshot = {
      id: "loaded-pulse",
      type: "pulse-circle",
      show: true,
      config: {
        position: { longitude: 114, latitude: 22, height: 0 },
        radius: 100,
        material: { type: "slow-canceled-load", options: {} }
      },
      createdAt: new Date().toISOString()
    };
    const pending = manager.load([snapshot], {
      clear: true,
      signal: controller.signal,
      operationId: "effects-load-canceled"
    });

    await deferred.started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "OperationCanceledError" });
    await expect(
      manager.add({ id: "blocked-during-load", type: "fog", intensity: 0.2 })
    ).rejects.toThrow("load is in progress");
    deferred.resolve(material);
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());
    expect(manager.get("existing-fog")).toBeDefined();
    expect(manager.get("loaded-pulse")).toBeUndefined();

    const phases: Array<string | undefined> = [];
    const off = fixture.operations.on("change", (event) => {
      if (event.data.id === "effects-load-success") {
        phases.push(event.data.phase);
      }
    });
    await manager.load(manager.toJSON(), {
      clear: true,
      operationId: "effects-load-success"
    });
    off();
    expect(phases).toEqual(expect.arrayContaining(["validate", "prepare", "attach", "commit"]));
    expect(fixture.operations.get("effects-load-success")).toMatchObject({
      kind: "effects.load",
      status: "succeeded",
      progress: 1
    });
  });

  it("honors synchronous progress cancellation before add, update, and load commits", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    const added = vi.fn();
    const updated = vi.fn();
    const loaded = vi.fn();
    manager.on("add", added);
    manager.on("update", updated);
    manager.on("load", loaded);

    const cancelAtCommit = (operationId: string) =>
      fixture.operations.on("change", (event) => {
        if (
          event.data.id === operationId &&
          event.data.status === "running" &&
          event.data.phase === "commit"
        ) {
          fixture.operations.cancel(operationId);
        }
      });

    let off = cancelAtCommit("effects-add-progress-cancel");
    await expect(
      manager.add(
        {
          id: "progress-canceled-add",
          type: "pulse-circle",
          position: Cartesian3.fromDegrees(114, 22),
          radius: 100
        },
        { operationId: "effects-add-progress-cancel" }
      )
    ).rejects.toMatchObject({ name: "OperationCanceledError" });
    off();
    expect(manager.get("progress-canceled-add")).toBeUndefined();
    expect(fixture.primitives).toHaveLength(0);
    expect(added).not.toHaveBeenCalled();

    await manager.add({
      id: "progress-stable",
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(114, 22),
      radius: 100
    });
    added.mockClear();
    const original = manager.getRuntimeObjects("progress-stable")[0];
    off = cancelAtCommit("effects-update-progress-cancel");
    await expect(
      manager.update(
        "progress-stable",
        { radius: 200 },
        { operationId: "effects-update-progress-cancel" }
      )
    ).rejects.toMatchObject({ name: "OperationCanceledError" });
    off();
    expect(manager.getRuntimeObjects("progress-stable")[0]).toBe(original);
    expect(fixture.primitives).toEqual([original]);
    expect(updated).not.toHaveBeenCalled();

    const snapshot: EffectSnapshot = {
      id: "progress-loaded-fog",
      type: "fog",
      show: true,
      config: { intensity: 0.3 },
      createdAt: new Date().toISOString()
    };
    off = cancelAtCommit("effects-load-progress-cancel");
    await expect(
      manager.load([snapshot], {
        clear: true,
        operationId: "effects-load-progress-cancel"
      })
    ).rejects.toMatchObject({ name: "OperationCanceledError" });
    off();
    expect(manager.get("progress-stable")).toBeDefined();
    expect(manager.get("progress-loaded-fog")).toBeUndefined();
    expect(fixture.primitives).toEqual([original]);
    expect(fixture.stages).toHaveLength(0);
    expect(loaded).not.toHaveBeenCalled();
  });

  it("emits manager mutation events after direct operations succeed", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    const observations: Array<{
      event: string;
      status: string | undefined;
      canceled: boolean;
    }> = [];
    let operationId = "effects-add-event-order";
    const observe = (event: string) => {
      observations.push({
        event,
        status: fixture.operations.get(operationId)?.status,
        canceled: fixture.operations.cancel(operationId)
      });
    };
    manager.on("add", () => observe("add"));
    manager.on("update", () => observe("update"));
    manager.on("clear", () => observe("clear"));
    manager.on("load", () => observe("load"));

    await manager.add(
      {
        id: "event-order-pulse",
        type: "pulse-circle",
        position: Cartesian3.fromDegrees(114, 22),
        radius: 100
      },
      { operationId }
    );
    operationId = "effects-update-event-order";
    await manager.update(
      "event-order-pulse",
      { radius: 200 },
      { operationId }
    );
    operationId = "effects-load-event-order";
    await manager.load(
      [
        {
          id: "event-order-fog",
          type: "fog",
          show: true,
          config: { intensity: 0.4 },
          createdAt: new Date().toISOString()
        }
      ],
      { clear: true, operationId }
    );

    expect(observations).toEqual([
      { event: "add", status: "succeeded", canceled: false },
      { event: "update", status: "succeeded", canceled: false },
      { event: "clear", status: "succeeded", canceled: false },
      { event: "load", status: "succeeded", canceled: false }
    ]);
    expect(manager.get("event-order-pulse")).toBeUndefined();
    expect(manager.get("event-order-fog")).toBeDefined();
  });

  it("manages show, groups, runtime objects, and scoped post-process stage names", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add({
      id: "rain-a",
      type: "rain",
      group: "weather",
      intensity: 0.5
    });
    await manager.add({
      id: "fog-a",
      type: "fog",
      group: "weather",
      intensity: 0.25
    });

    manager.setGroupShow("weather", false);
    expect(manager.list().every((effect) => !effect.show)).toBe(true);
    const rain = manager.getRuntimeObjects("rain-a")[0] as { name: string; enabled: boolean };
    expect(rain.name).toContain("rain-a");
    expect(rain.enabled).toBe(false);

    manager.setShow("rain-a", true);
    expect(rain.enabled).toBe(true);
    expect(manager.get("rain-a")?.updatedAt).toBeInstanceOf(Date);

    const exposed = manager.get("rain-a")!;
    exposed.show = false;
    exposed.config.show = false;
    exposed.runtimeObjects.length = 0;
    expect(manager.get("rain-a")?.show).toBe(true);
    expect(manager.getRuntimeObjects("rain-a")).toHaveLength(1);
  });

  it("destroys materials owned by geometry primitives", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    const destroy = vi.spyOn(Material.prototype, "destroy");

    await manager.add({
      id: "pulse-material",
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(114, 22),
      radius: 100
    });
    manager.remove("pulse-material");

    expect(destroy).toHaveBeenCalledOnce();
    destroy.mockRestore();
  });

  it("cleans up after the external Viewer has already destroyed scene objects", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add({
      id: "external-pulse",
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(114, 22),
      radius: 100
    });
    await manager.add({ id: "external-fog", type: "fog", intensity: 0.2 });
    const primitive = manager.getRuntimeObjects("external-pulse")[0] as {
      destroy(): void;
    };
    const stage = manager.getRuntimeObjects("external-fog")[0] as {
      destroy(): void;
    };
    primitive.destroy();
    stage.destroy();
    fixture.viewerIsDestroyed.mockReturnValue(true);
    fixture.removePrimitive.mockClear();
    fixture.removeStage.mockClear();
    fixture.requestRender.mockClear();

    expect(() => manager.destroy()).not.toThrow();
    expect(fixture.removePrimitive).not.toHaveBeenCalled();
    expect(fixture.removeStage).not.toHaveBeenCalled();
    expect(fixture.requestRender).not.toHaveBeenCalled();
  });

  it("roundtrips JSON-safe snapshots and restarts animation state", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add({
      id: "pulse-1",
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(114, 22, 20),
      radius: 500,
      group: "signals",
      metadata: { owner: "ops" },
      material: { type: "radial-wave", color: "#00d4ff", speed: 1.5, phase: 0.7 }
    });
    const snapshots = manager.toJSON();

    expect(() => JSON.stringify(snapshots)).not.toThrow();
    expect(snapshots[0].config.position?.longitude).toBeCloseTo(114);
    expect(snapshots[0].config.position?.latitude).toBeCloseTo(22);

    await manager.load(snapshots, { clear: true });
    expect(manager.list()).toHaveLength(1);
    expect(manager.get("pulse-1")).toMatchObject({
      type: "pulse-circle",
      group: "signals",
      show: true
    });
    const restored = manager.toJSON()[0];
    expect(restored).toMatchObject({
      id: snapshots[0].id,
      type: snapshots[0].type,
      show: snapshots[0].show,
      group: snapshots[0].group,
      metadata: snapshots[0].metadata,
      createdAt: snapshots[0].createdAt,
      config: {
        radius: 500,
        material: { type: "radial-wave", phase: 0.7 }
      }
    });
  });

  it("validates every snapshot before clearing existing effects", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add({
      id: "fog-existing",
      type: "fog",
      intensity: 0.2
    });
    const invalid: EffectSnapshot[] = [
      {
        id: "bad-flow",
        type: "flow-line",
        show: true,
        config: {
          positions: [],
          material: { type: "missing", options: {} }
        },
        createdAt: new Date().toISOString()
      }
    ];

    expect(() => manager.validateSnapshots(invalid)).toThrow();
    await expect(manager.load(invalid, { clear: true })).rejects.toThrow();
    expect(manager.get("fog-existing")).toBeDefined();
    expect(fixture.stages).toHaveLength(1);
  });

  it("rejects duplicate ids, invalid dimensions, and entity-only materials", async () => {
    const fixture = createMapFixture();
    fixture.materials.register({
      type: "entity-only",
      targets: ["entity"],
      createProperty: () => ({}) as never
    });
    const manager = new EffectManager(fixture.map);
    const config = createAllEffectConfigs()[0];
    await manager.add(config);

    await expect(manager.add(config)).rejects.toThrow("already exists");
    await expect(
      manager.add({
        id: "bad-radius",
        type: "pulse-circle",
        position: new Cartesian3(1, 2, 3),
        radius: 0
      })
    ).rejects.toThrow("radius");
    await expect(
      manager.add({
        id: "wrong-target",
        type: "flow-line",
        positions: [new Cartesian3(1, 2, 3), new Cartesian3(2, 3, 4)],
        material: { type: "entity-only", options: {} }
      })
    ).rejects.toThrow("does not support target");
  });

  it("rolls back a prepared scene replacement with the original runtime identities", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add({
      id: "original-pulse",
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(114, 22),
      radius: 100
    });
    await manager.add({ id: "original-rain", type: "rain", intensity: 0.4 });
    const originalPrimitive = manager.getRuntimeObjects("original-pulse")[0] as {
      destroy(): void;
      isDestroyed(): boolean;
    };
    const originalStage = manager.getRuntimeObjects("original-rain")[0] as {
      destroy(): void;
      isDestroyed(): boolean;
    };
    const primitiveDestroy = vi.spyOn(originalPrimitive, "destroy");
    const stageDestroy = vi.spyOn(originalStage, "destroy");
    const cleared = vi.fn();
    const loaded = vi.fn();
    manager.on("clear", cleared);
    manager.on("load", loaded);

    const transaction = await manager.prepareSceneLoad(
      createSceneTransactionSnapshots("replacement"),
      { clear: true }
    );

    expect(fixture.primitives).toEqual([originalPrimitive]);
    expect(fixture.stages).toEqual([originalStage]);
    expect(fixture.onTick.numberOfListeners).toBe(1);

    transaction.commit();
    const replacementPrimitive = manager.getRuntimeObjects("replacement-pulse")[0] as {
      isDestroyed(): boolean;
    };
    const replacementStage = manager.getRuntimeObjects("replacement-rain")[0] as {
      isDestroyed(): boolean;
    };
    expect(fixture.primitives).toEqual([replacementPrimitive]);
    expect(fixture.stages).toEqual([replacementStage]);
    expect(fixture.primitiveCollection.destroyPrimitives).toBe(true);
    expect(primitiveDestroy).not.toHaveBeenCalled();
    expect(stageDestroy).not.toHaveBeenCalled();
    expect(fixture.onTick.numberOfListeners).toBe(1);
    expect(() => manager.clear()).toThrow("scene effect transaction");

    transaction.rollback();
    expect(manager.getRuntimeObjects("original-pulse")[0]).toBe(originalPrimitive);
    expect(manager.getRuntimeObjects("original-rain")[0]).toBe(originalStage);
    expect(manager.get("replacement-pulse")).toBeUndefined();
    expect(fixture.primitives).toEqual([originalPrimitive]);
    expect(fixture.stages).toEqual([originalStage]);
    expect(originalPrimitive.isDestroyed()).toBe(false);
    expect(originalStage.isDestroyed()).toBe(false);
    expect(fixture.onTick.numberOfListeners).toBe(1);
    expect(cleared).not.toHaveBeenCalled();
    expect(loaded).not.toHaveBeenCalled();

    transaction.dispose();
    expect(replacementPrimitive.isDestroyed()).toBe(true);
    expect(replacementStage.isDestroyed()).toBe(true);
    expect(manager.setShow("original-rain", false)).toMatchObject({ show: false });
  });

  it("disposes detached runtimes when scene preparation fails", async () => {
    const fixture = createMapFixture();
    fixture.materials.register({
      type: "broken-scene-material",
      targets: ["primitive"],
      createMaterial: async () => {
        throw new Error("scene material failed");
      }
    });
    const manager = new EffectManager(fixture.map);
    await manager.add({ id: "stable-scene-fog", type: "fog", intensity: 0.2 });
    const stableStage = manager.getRuntimeObjects("stable-scene-fog")[0];
    const destroyMaterial = vi.spyOn(Material.prototype, "destroy");
    const valid = createSceneTransactionSnapshots("prepared")[0];
    const invalid: EffectSnapshot = {
      id: "broken-scene-flow",
      type: "flow-line",
      show: true,
      config: {
        positions: [
          { longitude: 114, latitude: 22, height: 0 },
          { longitude: 114.01, latitude: 22.01, height: 0 }
        ],
        material: { type: "broken-scene-material", options: {} }
      },
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    await expect(
      manager.prepareSceneLoad([valid, invalid], { clear: true })
    ).rejects.toThrow("scene material failed");

    expect(manager.getRuntimeObjects("stable-scene-fog")[0]).toBe(stableStage);
    expect(fixture.primitives).toHaveLength(0);
    expect(fixture.stages).toEqual([stableStage]);
    expect(fixture.onTick.numberOfListeners).toBe(0);
    expect(destroyMaterial).toHaveBeenCalledOnce();
    expect(manager.setShow("stable-scene-fog", false)).toMatchObject({ show: false });
    destroyMaterial.mockRestore();
  });

  it("finalizes a scene replacement before publishing buffered events", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add({
      id: "retired-pulse",
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(114, 22),
      radius: 100
    });
    await manager.add({ id: "retired-rain", type: "rain", intensity: 0.4 });
    const retiredPrimitive = manager.getRuntimeObjects("retired-pulse")[0] as {
      isDestroyed(): boolean;
    };
    const retiredStage = manager.getRuntimeObjects("retired-rain")[0] as {
      isDestroyed(): boolean;
    };
    const cleared = vi.fn();
    const loaded = vi.fn();
    manager.on("clear", cleared);
    manager.on("load", loaded);
    const transaction = await manager.prepareSceneLoad(
      createSceneTransactionSnapshots("active"),
      { clear: true }
    );

    transaction.commit();
    const activePrimitive = manager.getRuntimeObjects("active-pulse")[0] as {
      isDestroyed(): boolean;
    };
    const activeStage = manager.getRuntimeObjects("active-rain")[0] as {
      isDestroyed(): boolean;
    };
    expect(retiredPrimitive.isDestroyed()).toBe(false);
    expect(retiredStage.isDestroyed()).toBe(false);
    expect(cleared).not.toHaveBeenCalled();
    expect(loaded).not.toHaveBeenCalled();

    transaction.finalize();
    expect(retiredPrimitive.isDestroyed()).toBe(true);
    expect(retiredStage.isDestroyed()).toBe(true);
    expect(activePrimitive.isDestroyed()).toBe(false);
    expect(activeStage.isDestroyed()).toBe(false);
    expect(cleared).not.toHaveBeenCalled();
    expect(loaded).not.toHaveBeenCalled();

    transaction.publish();
    transaction.publish();
    expect(cleared).toHaveBeenCalledOnce();
    expect(
      cleared.mock.calls[0][0].data.map((effect: { id: string }) => effect.id)
    ).toEqual(["retired-pulse", "retired-rain"]);
    expect(loaded).toHaveBeenCalledOnce();
    expect(
      loaded.mock.calls[0][0].data.map((effect: { id: string }) => effect.id)
    ).toEqual(["active-pulse", "active-rain"]);
    expect(fixture.primitives).toEqual([activePrimitive]);
    expect(fixture.stages).toEqual([activeStage]);
    expect(fixture.onTick.numberOfListeners).toBe(1);

    transaction.dispose();
    expect(activePrimitive.isDestroyed()).toBe(false);
    expect(activeStage.isDestroyed()).toBe(false);
  });

  it("restores ticker state after rolling back an additive scene load", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add({ id: "stable-fog", type: "fog", intensity: 0.2 });
    const stableStage = manager.getRuntimeObjects("stable-fog")[0];
    await expect(
      manager.prepareSceneLoad(manager.toJSON(), { clear: false })
    ).rejects.toThrow("already exists");

    const transaction = await manager.prepareSceneLoad(
      [createSceneTransactionSnapshots("additive")[1]],
      { clear: false }
    );
    expect(fixture.onTick.numberOfListeners).toBe(0);
    transaction.commit();
    const additiveStage = manager.getRuntimeObjects("additive-rain")[0] as {
      isDestroyed(): boolean;
    };
    expect(manager.getRuntimeObjects("stable-fog")[0]).toBe(stableStage);
    expect(fixture.stages).toEqual([stableStage, additiveStage]);
    expect(fixture.onTick.numberOfListeners).toBe(1);

    transaction.rollback();
    expect(manager.getRuntimeObjects("stable-fog")[0]).toBe(stableStage);
    expect(manager.get("additive-rain")).toBeUndefined();
    expect(fixture.stages).toEqual([stableStage]);
    expect(fixture.onTick.numberOfListeners).toBe(0);
    transaction.dispose();
    expect(additiveStage.isDestroyed()).toBe(true);
  });

  it("is idempotent after destroy and rejects new mutations", async () => {
    const fixture = createMapFixture();
    const manager = new EffectManager(fixture.map);
    await manager.add(createAllEffectConfigs()[8]);

    manager.destroy();
    manager.destroy();
    expect(manager.list()).toHaveLength(0);
    expect(fixture.stages).toHaveLength(0);
    await expect(manager.add(createAllEffectConfigs()[8])).rejects.toThrow("destroyed");
  });
});

function createMapFixture() {
  const primitives: unknown[] = [];
  const stages: unknown[] = [];
  const requestRender = vi.fn();
  const viewerIsDestroyed = vi.fn(() => false);
  const onTick = new CesiumEvent<(clock: Clock) => void>();
  const clock = {
    currentTime: JulianDate.fromIso8601("2026-07-10T00:00:00Z"),
    onTick
  } as Clock;
  const materials = new MaterialManager();
  const operations = new OperationManager();
  const primitiveCollection = {
    destroyPrimitives: true,
    add: vi.fn((object: unknown) => {
      primitives.push(object);
      return object;
    }),
    contains: vi.fn((object: unknown) => primitives.includes(object)),
    remove: undefined as unknown
  };
  const removePrimitive = vi.fn((object: unknown) => {
    const index = primitives.indexOf(object);
    if (index >= 0) {
      primitives.splice(index, 1);
      if (primitiveCollection.destroyPrimitives) {
        (object as { destroy(): void }).destroy();
      }
    }
    return index >= 0;
  });
  primitiveCollection.remove = removePrimitive;
  const postProcessStages = {
    add: vi.fn((object: unknown) => {
      stages.push(object);
      return object;
    }),
    contains: vi.fn((object: unknown) => stages.includes(object)),
    remove: undefined as unknown
  };
  const removeStage = vi.fn((object: unknown) => {
    const index = stages.indexOf(object);
    if (index >= 0) {
      stages.splice(index, 1);
      (object as { destroy(): void }).destroy();
    }
    return index >= 0;
  });
  postProcessStages.remove = removeStage;
  const scene = {
    primitives: primitiveCollection,
    postProcessStages,
    requestRender
  };
  const map = {
    viewer: { scene, clock, isDestroyed: viewerIsDestroyed },
    materials,
    operations
  } as unknown as KairosMap;
  return {
    map,
    materials,
    operations,
    primitives,
    stages,
    requestRender,
    clock,
    onTick,
    primitiveCollection,
    postProcessStages,
    viewerIsDestroyed,
    removePrimitive,
    removeStage
  };
}

function deferredMaterial(materials: MaterialManager, type: string) {
  let resolve!: (material: Material) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((next) => {
    markStarted = next;
  });
  const promise = new Promise<Material>((next) => {
    resolve = next;
  });
  materials.register({
    type,
    targets: ["primitive"],
    createMaterial: () => {
      markStarted();
      return promise;
    }
  });
  return { resolve, started };
}

function slowFlowConfig(id: string, materialType: string): EffectConfig {
  return {
    id,
    type: "flow-line",
    positions: [
      Cartesian3.fromDegrees(114, 22),
      Cartesian3.fromDegrees(114.01, 22.01)
    ],
    material: { type: materialType, options: {} }
  };
}

function createSceneTransactionSnapshots(prefix: string): EffectSnapshot[] {
  return [
    {
      id: `${prefix}-pulse`,
      type: "pulse-circle",
      show: true,
      config: {
        position: { longitude: 114, latitude: 22, height: 0 },
        radius: 200
      },
      createdAt: "2026-07-10T00:00:00.000Z"
    },
    {
      id: `${prefix}-rain`,
      type: "rain",
      show: true,
      config: { intensity: 0.6, speed: 1.5 },
      createdAt: "2026-07-10T00:00:00.000Z"
    }
  ];
}

function createAllEffectConfigs(): EffectConfig[] {
  const p1 = Cartesian3.fromDegrees(114, 22, 20);
  const p2 = Cartesian3.fromDegrees(114.01, 22.01, 60);
  const p3 = Cartesian3.fromDegrees(114.02, 22, 30);
  const flow = { type: "flow" as const, color: "#00d4ff", speed: 1.5 };
  return [
    {
      id: "flow-line-1",
      type: "flow-line",
      positions: [p1, p2],
      width: 4,
      material: flow,
      group: "traffic"
    },
    {
      id: "flow-wall-1",
      type: "flow-wall",
      positions: [p1, p2],
      minimumHeights: [0, 0],
      maximumHeights: [100, 100],
      material: flow
    },
    {
      id: "pulse-1",
      type: "pulse-circle",
      position: p1,
      radius: 500
    },
    {
      id: "radar-1",
      type: "radar-scan",
      position: p2,
      radius: 500
    },
    {
      id: "water-1",
      type: "water-surface",
      positions: [p1, p2, p3],
      material: { type: "color", color: "#2f80ed88" }
    },
    {
      id: "particle-1",
      type: "particle",
      position: p1,
      image: "data:image/png;base64,iVBORw0KGgo="
    },
    { id: "rain-1", type: "rain", intensity: 0.5 },
    { id: "snow-1", type: "snow", intensity: 0.5 },
    { id: "fog-1", type: "fog", intensity: 0.3 }
  ];
}
