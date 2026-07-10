import { describe, expect, it, vi } from "vitest";
import { OperationCanceledError } from "./errors";
import {
  createOperationScope,
  OperationManager,
  runOperation
} from "./manager";

describe("OperationManager", () => {
  it("tracks successful work and keeps progress monotonic", async () => {
    const manager = new OperationManager();
    const changes: string[] = [];
    manager.on("change", (event) => {
      changes.push(`${event.data.status}:${event.data.progress}:${event.data.phase ?? ""}`);
    });

    await expect(
      runOperation(
        manager,
        { kind: "layers.load", label: "Load layers" },
        { operationId: "load-1" },
        async (context) => {
          context.reportProgress(0.6, "prepare");
          context.reportProgress(0.2, "prepare");
          context.reportProgress(0.8, "commit");
          return "done";
        }
      )
    ).resolves.toBe("done");

    expect(manager.get("load-1")).toMatchObject({
      id: "load-1",
      kind: "layers.load",
      label: "Load layers",
      status: "succeeded",
      progress: 1,
      phase: "commit"
    });
    expect(changes).toEqual([
      "running:0:",
      "running:0.6:prepare",
      "running:0.8:commit",
      "succeeded:1:commit"
    ]);
  });

  it("captures failures without changing the rejected error", async () => {
    const manager = new OperationManager();
    const failure = Object.assign(new Error("network failed"), { code: "NETWORK" });

    await expect(
      runOperation(
        manager,
        { kind: "effects.load" },
        { operationId: "failure-1" },
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);

    expect(manager.get("failure-1")).toMatchObject({
      status: "failed",
      error: { name: "Error", message: "network failed", code: "NETWORK" }
    });
  });

  it("cancels promptly and exposes OperationCanceledError", async () => {
    const manager = new OperationManager();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const promise = runOperation(
      manager,
      { kind: "analysis.profile" },
      { operationId: "cancel-1" },
      async (context) => {
        await pending;
        context.throwIfAborted();
      }
    );

    expect(manager.cancel("cancel-1")).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(OperationCanceledError);
    expect(manager.get("cancel-1")?.status).toBe("canceled");
    expect(manager.cancel("cancel-1")).toBe(false);
    release();
  });

  it("links an external AbortSignal", async () => {
    const manager = new OperationManager();
    const controller = new AbortController();
    const promise = runOperation(
      manager,
      { kind: "scene.load" },
      { operationId: "external-1", signal: controller.signal },
      async () => new Promise<void>(() => undefined)
    );

    controller.abort();
    await expect(promise).rejects.toMatchObject({
      name: "OperationCanceledError",
      operationId: "external-1"
    });
    expect(manager.get("external-1")?.status).toBe("canceled");
  });

  it("respects cancelAll query filters", async () => {
    const manager = new OperationManager();
    const first = runOperation(
      manager,
      { kind: "layers.load" },
      { operationId: "running-layer" },
      async () => new Promise<void>(() => undefined)
    );
    const second = runOperation(
      manager,
      { kind: "effects.load" },
      { operationId: "running-effect" },
      async () => new Promise<void>(() => undefined)
    );

    expect(manager.cancelAll({ kind: "layers.load" })).toBe(1);
    await expect(first).rejects.toBeInstanceOf(OperationCanceledError);
    expect(manager.get("running-effect")?.status).toBe("running");
    expect(manager.cancelAll({ status: "failed" })).toBe(0);
    expect(manager.get("running-effect")?.status).toBe("running");
    manager.cancel("running-effect");
    await expect(second).rejects.toBeInstanceOf(OperationCanceledError);
  });

  it("validates scoped progress before mapping it to the parent", async () => {
    const manager = new OperationManager();

    await expect(
      runOperation(
        manager,
        { kind: "scene.load" },
        { operationId: "scope-progress" },
        async (context) => {
          const scope = createOperationScope(context, 0.2, 0.4, "layers");
          expect(() => scope.reportProgress(-0.1)).toThrow(
            "Operation progress must be a finite number between 0 and 1."
          );
          expect(() => scope.reportProgress(1.1)).toThrow(
            "Operation progress must be a finite number between 0 and 1."
          );
          expect(() => scope.reportProgress(Number.NaN)).toThrow(
            "Operation progress must be a finite number between 0 and 1."
          );
          scope.reportProgress(0.5, "prepare");
        }
      )
    ).resolves.toBeUndefined();

    expect(manager.get("scope-progress")).toMatchObject({
      status: "succeeded",
      progress: 1,
      phase: "layers.prepare"
    });
  });

  it("rejects duplicate retained ids and filters records", async () => {
    const manager = new OperationManager();
    await runOperation(
      manager,
      { kind: "layers.load" },
      { operationId: "shared" },
      async () => undefined
    );

    await expect(
      runOperation(
        manager,
        { kind: "effects.load" },
        { operationId: "shared" },
        async () => undefined
      )
    ).rejects.toThrow('Operation id "shared" already exists.');
    expect(manager.list({ kind: "layers.load", status: "succeeded" })).toHaveLength(1);
    expect(manager.list({ status: ["failed", "canceled"] })).toHaveLength(0);
  });

  it("returns isolated state copies and clears finished records", async () => {
    const manager = new OperationManager();
    const cleared = vi.fn();
    const changes: Array<ReturnType<OperationManager["get"]>> = [];
    manager.on("change", (event) => changes.push(event.data));
    manager.on("clear", cleared);
    await runOperation(
      manager,
      { kind: "effects.add" },
      { operationId: "copy-1" },
      async () => undefined
    );

    const state = manager.get("copy-1")!;
    const listed = manager.list()[0];
    const changed = changes.at(-1)!;
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(Object.isFrozen(changed)).toBe(true);
    state.startedAt.setTime(0);
    listed.startedAt.setTime(1);
    changed!.startedAt.setTime(2);
    expect(manager.get("copy-1")?.startedAt.getTime()).not.toBe(0);
    expect(manager.get("copy-1")?.startedAt.getTime()).not.toBe(1);
    expect(manager.get("copy-1")?.startedAt.getTime()).not.toBe(2);
    expect(manager.clearFinished({ status: "succeeded" })).toBe(1);
    expect(manager.get("copy-1")).toBeUndefined();
    expect(cleared).toHaveBeenCalledOnce();
    const clearPayload = cleared.mock.calls[0][0].data;
    expect(Object.isFrozen(clearPayload[0])).toBe(true);
  });

  it("retains at most one hundred finished operations", async () => {
    const manager = new OperationManager();
    const removed = vi.fn();
    manager.on("remove", removed);

    for (let index = 0; index < 101; index += 1) {
      await runOperation(
        manager,
        { kind: "test" },
        { operationId: `operation-${index}` },
        async () => undefined
      );
    }

    expect(manager.list()).toHaveLength(100);
    expect(manager.get("operation-0")).toBeUndefined();
    expect(removed).toHaveBeenCalledOnce();
    expect(Object.isFrozen(removed.mock.calls[0][0].data)).toBe(true);
  });

  it("aborts active work and suppresses late events after destroy", async () => {
    const manager = new OperationManager();
    const listener = vi.fn();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    manager.on("change", listener);
    const promise = runOperation(
      manager,
      { kind: "effects.add" },
      { operationId: "destroy-1" },
      async (context) => {
        await pending;
        context.throwIfAborted();
      }
    );

    manager.destroy();
    await expect(promise).rejects.toBeInstanceOf(OperationCanceledError);
    release();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(manager.list()).toEqual([]);
  });
});
