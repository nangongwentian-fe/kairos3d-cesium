import { Cartographic } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { OperationCanceledError, OperationManager } from "../operations";
import { SceneTransactionError } from "./errors";
import { SceneStateManager } from "./manager";
import type { PreparedSceneStage } from "./transaction";
import type { SceneSnapshot } from "./types";

function createSnapshot(): SceneSnapshot {
  return {
    version: 1,
    layers: [],
    bookmarks: [],
    createdAt: "2026-07-10T00:00:00.000Z"
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createStageHarness(phase: string) {
  const lifecycle: string[] = [];
  const stage = {
    phase,
    commit: vi.fn(() => {
      lifecycle.push("commit");
    }),
    rollback: vi.fn(() => {
      lifecycle.push("rollback");
    }),
    finalize: vi.fn(() => {
      lifecycle.push("finalize");
    }),
    dispose: vi.fn(() => {
      lifecycle.push("dispose");
    }),
    publish: vi.fn(() => {
      lifecycle.push("publish");
    })
  } satisfies PreparedSceneStage;
  const prepare = vi.fn(async () => {
    lifecycle.push("prepare");
    return stage;
  });

  return { lifecycle, prepare, stage };
}

function createMapMock() {
  const operations = new OperationManager();
  const layers = createStageHarness("layers");
  const draw = createStageHarness("draw");
  const analysis = createStageHarness("analysis");
  const stopTools = vi.fn();
  const clearSelection = vi.fn();
  const requestRender = vi.fn();
  const camera = {
    positionCartographic: Cartographic.fromDegrees(114.2, 22.3, 1500),
    heading: 0.1,
    pitch: -0.8,
    roll: 0,
    flyTo: vi.fn((options: { complete?: () => void; cancel?: () => void }) =>
      options.complete?.()
    ),
    cancelFlight: vi.fn(),
    setView: vi.fn()
  };
  const layersToJSON = vi.fn(() => []);
  const map = {
    operations,
    viewer: { camera, scene: { requestRender } },
    layers: {
      prepareTransaction: layers.prepare,
      toJSON: layersToJSON
    },
    draw: { prepareSceneLoad: draw.prepare },
    analysis: { prepareSceneLoad: analysis.prepare },
    tools: { stop: stopTools },
    selection: { clear: clearSelection }
  } as unknown as KairosMap;

  return {
    analysis,
    camera,
    clearSelection,
    draw,
    layers,
    layersToJSON,
    map,
    operations,
    requestRender,
    stopTools
  };
}

describe("SceneStateManager transactional loading", () => {
  it("uses transactional lifecycle by default and records one scene.load operation", async () => {
    const { layers, map, operations, requestRender } = createMapMock();
    const manager = new SceneStateManager(map);

    await manager.load(createSnapshot(), {
      flyToCamera: false,
      operationId: "transaction-success"
    });

    expect(layers.prepare).toHaveBeenCalledWith([], { clear: true, flyTo: false });
    expect(layers.lifecycle).toEqual(["prepare", "commit", "finalize", "publish"]);
    expect(layers.stage.rollback).not.toHaveBeenCalled();
    expect(layers.stage.dispose).not.toHaveBeenCalled();
    expect(requestRender).toHaveBeenCalledOnce();
    expect(manager.getTransactionState()).toMatchObject({
      mode: "transactional",
      operationId: "transaction-success",
      rollbackStatus: "not-needed",
      status: "succeeded"
    });
    expect(operations.list().map(({ id, kind, status }) => ({ id, kind, status }))).toEqual([
      {
        id: "transaction-success",
        kind: "scene.load",
        status: "succeeded"
      }
    ]);
  });

  it("disposes prepared stages without committing when prepare fails", async () => {
    const { analysis, draw, layers, map, stopTools } = createMapMock();
    const manager = new SceneStateManager(map);
    const failure = new Error("draw prepare failed");
    draw.prepare.mockRejectedValueOnce(failure);

    const error = await manager.load(createSnapshot(), {
      flyToCamera: false,
      restoreResults: true
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SceneTransactionError);
    expect(error).toMatchObject({
      originalError: failure,
      phase: "prepare",
      rollbackStatus: "not-needed",
      stage: "draw"
    });
    expect(layers.lifecycle).toEqual(["prepare", "dispose"]);
    expect(layers.stage.commit).not.toHaveBeenCalled();
    expect(analysis.prepare).not.toHaveBeenCalled();
    expect(stopTools).not.toHaveBeenCalled();
  });

  it("rolls back and reports SceneTransactionError when commit fails", async () => {
    const { layers, map } = createMapMock();
    const manager = new SceneStateManager(map);
    const failure = new Error("layer commit failed");
    layers.stage.commit.mockImplementationOnce(() => {
      layers.lifecycle.push("commit");
      throw failure;
    });

    const error = await manager.load(createSnapshot(), {
      flyToCamera: false
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SceneTransactionError);
    expect(error).toMatchObject({
      originalError: failure,
      phase: "commit",
      rollbackErrors: [],
      rollbackStatus: "succeeded",
      stage: "layers"
    });
    expect(layers.lifecycle).toEqual(["prepare", "commit", "rollback", "dispose"]);
    expect(manager.getTransactionState()).toMatchObject({
      rollbackStatus: "succeeded",
      status: "failed"
    });
  });

  it("treats finalize failures as best-effort cleanup after a successful commit", async () => {
    const { analysis, draw, layers, map } = createMapMock();
    const manager = new SceneStateManager(map);
    layers.stage.finalize.mockImplementationOnce(() => {
      layers.lifecycle.push("finalize");
      throw new Error("retired layer cleanup failed");
    });

    await expect(manager.load(createSnapshot(), {
      flyToCamera: false,
      restoreResults: true
    })).resolves.toBeUndefined();

    expect(layers.lifecycle).toEqual(["prepare", "commit", "finalize", "publish"]);
    expect(draw.lifecycle).toEqual(["prepare", "commit", "finalize", "publish"]);
    expect(analysis.lifecycle).toEqual(["prepare", "commit", "finalize", "publish"]);
    expect(layers.stage.rollback).not.toHaveBeenCalled();
    expect(layers.stage.dispose).not.toHaveBeenCalled();
    expect(manager.getTransactionState()).toMatchObject({
      rollbackStatus: "not-needed",
      status: "succeeded"
    });
  });

  it("rejects cancellation immediately while whenIdle waits for background cleanup", async () => {
    const { layers, map, operations } = createMapMock();
    const manager = new SceneStateManager(map);
    const commit = createDeferred<void>();
    const rollback = createDeferred<void>();
    layers.stage.commit.mockImplementationOnce(async () => {
      layers.lifecycle.push("commit");
      await commit.promise;
    });
    layers.stage.rollback.mockImplementationOnce(async () => {
      layers.lifecycle.push("rollback");
      await rollback.promise;
    });

    const loading = manager.load(createSnapshot(), {
      flyToCamera: false,
      operationId: "cancel-transaction"
    });
    await vi.waitFor(() => expect(layers.stage.commit).toHaveBeenCalledOnce());
    const idle = manager.whenIdle();
    let idleFinished = false;
    void idle.then(() => {
      idleFinished = true;
    });

    expect(operations.cancel("cancel-transaction")).toBe(true);
    await expect(loading).rejects.toBeInstanceOf(OperationCanceledError);
    expect(idleFinished).toBe(false);
    await expect(manager.load(createSnapshot(), { flyToCamera: false })).rejects.toThrow(
      "A scene transaction is already running."
    );

    commit.resolve(undefined);
    await vi.waitFor(() => expect(layers.stage.rollback).toHaveBeenCalledOnce());
    expect(idleFinished).toBe(false);

    rollback.resolve(undefined);
    await idle;

    expect(layers.lifecycle).toEqual(["prepare", "commit", "rollback", "dispose"]);
    expect(manager.getTransactionState()).toMatchObject({
      rollbackStatus: "succeeded",
      status: "canceled"
    });
  });

  it("rejects concurrent load and toJSON while a transaction is running", async () => {
    const { layers, layersToJSON, map } = createMapMock();
    const manager = new SceneStateManager(map);
    const prepared = createDeferred<typeof layers.stage>();
    layers.prepare.mockImplementationOnce(() => prepared.promise);

    const loading = manager.load(createSnapshot(), {
      flyToCamera: false,
      operationId: "active-transaction"
    });
    await vi.waitFor(() => expect(layers.prepare).toHaveBeenCalledOnce());

    await expect(manager.load(createSnapshot(), { flyToCamera: false })).rejects.toThrow(
      "A scene transaction is already running."
    );
    expect(() => manager.toJSON()).toThrow(
      "Cannot create a scene snapshot while a scene transaction is running."
    );
    expect(layersToJSON).not.toHaveBeenCalled();

    prepared.resolve(layers.stage);
    await loading;
  });

  it("returns isolated transaction state clones", async () => {
    const { map } = createMapMock();
    const manager = new SceneStateManager(map);

    await manager.load(createSnapshot(), { flyToCamera: false });
    const first = manager.getTransactionState()!;
    const startedAt = first.startedAt.getTime();
    const finishedAt = first.finishedAt!.getTime();

    expect(Object.isFrozen(first)).toBe(true);
    first.startedAt.setTime(0);
    first.finishedAt!.setTime(0);

    const second = manager.getTransactionState()!;
    expect(second).not.toBe(first);
    expect(second.startedAt.getTime()).toBe(startedAt);
    expect(second.finishedAt!.getTime()).toBe(finishedAt);
  });

  it("continues rollback after a handler fails and exposes diagnostics", async () => {
    const { analysis, draw, layers, map } = createMapMock();
    const manager = new SceneStateManager(map);
    const commitFailure = new Error("analysis commit failed");
    const rollbackFailure = new Error("draw rollback failed");
    analysis.stage.commit.mockImplementationOnce(() => {
      analysis.lifecycle.push("commit");
      throw commitFailure;
    });
    draw.stage.rollback.mockImplementationOnce(() => {
      draw.lifecycle.push("rollback");
      throw rollbackFailure;
    });

    const error = await manager.load(createSnapshot(), {
      flyToCamera: false,
      restoreResults: true
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SceneTransactionError);
    expect(error).toMatchObject({
      originalError: commitFailure,
      rollbackStatus: "failed"
    });
    expect((error as SceneTransactionError).rollbackErrors).toEqual([
      expect.objectContaining({ message: rollbackFailure.message })
    ]);
    expect(layers.stage.rollback).toHaveBeenCalledOnce();
    expect(draw.stage.rollback).toHaveBeenCalledOnce();
    expect(analysis.stage.rollback).toHaveBeenCalledOnce();
  });

  it("cancels during prepare and disposes the late prepared runtime before becoming idle", async () => {
    const { layers, map, operations } = createMapMock();
    const manager = new SceneStateManager(map);
    const prepared = createDeferred<typeof layers.stage>();
    layers.prepare.mockImplementationOnce(() => prepared.promise);

    const loading = manager.load(createSnapshot(), {
      flyToCamera: false,
      operationId: "cancel-prepare"
    });
    await vi.waitFor(() => expect(layers.prepare).toHaveBeenCalledOnce());
    const idle = manager.whenIdle();
    expect(operations.cancel("cancel-prepare")).toBe(true);
    await expect(loading).rejects.toBeInstanceOf(OperationCanceledError);

    prepared.resolve(layers.stage);
    await idle;

    expect(layers.stage.commit).not.toHaveBeenCalled();
    expect(layers.stage.dispose).toHaveBeenCalledOnce();
    expect(manager.getTransactionState()).toMatchObject({
      rollbackStatus: "not-needed",
      status: "canceled"
    });
  });

  it("serializes destroy behind the active transaction rollback", async () => {
    const { layers, map } = createMapMock();
    const manager = new SceneStateManager(map);
    const commit = createDeferred<void>();
    const rollback = createDeferred<void>();
    layers.stage.commit.mockImplementationOnce(async () => {
      layers.lifecycle.push("commit");
      await commit.promise;
    });
    layers.stage.rollback.mockImplementationOnce(async () => {
      layers.lifecycle.push("rollback");
      await rollback.promise;
    });

    const loading = manager.load(createSnapshot(), {
      flyToCamera: false,
      operationId: "destroy-transaction"
    });
    await vi.waitFor(() => expect(layers.stage.commit).toHaveBeenCalledOnce());

    const destroying = manager.destroyAndWait();
    await expect(loading).rejects.toBeInstanceOf(OperationCanceledError);
    expect(layers.stage.rollback).not.toHaveBeenCalled();
    expect(layers.stage.dispose).not.toHaveBeenCalled();

    commit.resolve(undefined);
    await vi.waitFor(() => expect(layers.stage.rollback).toHaveBeenCalledOnce());
    expect(layers.stage.dispose).not.toHaveBeenCalled();

    rollback.resolve(undefined);
    await destroying;

    expect(layers.lifecycle).toEqual(["prepare", "commit", "rollback", "dispose"]);
    expect(layers.stage.rollback).toHaveBeenCalledOnce();
    expect(layers.stage.dispose).toHaveBeenCalledOnce();
  });

  it("cancels a transactional camera flight and restores the previous view", async () => {
    const { camera, layers, map, operations } = createMapMock();
    const manager = new SceneStateManager(map);
    const prepared = createDeferred<typeof layers.stage>();
    let cancelFlight: (() => void) | undefined;
    layers.prepare.mockImplementationOnce(() => prepared.promise);
    camera.flyTo.mockImplementationOnce((options) => {
      cancelFlight = options.cancel;
    });
    camera.cancelFlight.mockImplementation(() => cancelFlight?.());
    const snapshot = {
      ...createSnapshot(),
      camera: {
        longitude: 115,
        latitude: 23,
        height: 2000,
        heading: 0,
        pitch: -1,
        roll: 0
      }
    };

    const loading = manager.load(snapshot, { operationId: "cancel-camera-transaction" });
    await vi.waitFor(() => expect(layers.prepare).toHaveBeenCalledOnce());
    camera.positionCartographic = Cartographic.fromDegrees(120, 30, 9000);
    camera.heading = 1.2;
    camera.pitch = -0.2;
    prepared.resolve(layers.stage);
    await vi.waitFor(() => expect(camera.flyTo).toHaveBeenCalledOnce());
    expect(operations.cancel("cancel-camera-transaction")).toBe(true);
    await expect(loading).rejects.toBeInstanceOf(OperationCanceledError);
    await manager.whenIdle();

    expect(camera.cancelFlight).toHaveBeenCalled();
    expect(camera.setView).toHaveBeenCalledOnce();
    expect(camera.setView).toHaveBeenCalledWith(expect.objectContaining({
      orientation: {
        heading: 0.1,
        pitch: -0.8,
        roll: 0
      }
    }));
    expect(layers.stage.rollback).toHaveBeenCalledOnce();
    expect(manager.getTransactionState()).toMatchObject({
      rollbackStatus: "succeeded",
      status: "canceled"
    });
  });
});
