import { describe, expect, it, vi } from "vitest";
import { RuntimeMutationConflictError } from "./errors";
import {
  acquireRuntimeLease,
  assertRuntimeMutationAllowed,
  destroyRuntimeConcurrency,
  getRuntimeLeaseOwner,
  getRuntimeConcurrencyCounts,
  runWithRuntimeWriteLease,
  runWithRuntimeLease,
  withRuntimeLeaseOwner
} from "./lease";
import { RuntimeConcurrencyManager } from "./manager";

describe("RuntimeConcurrencyManager", () => {
  it("validates internal lease definitions before changing state", async () => {
    const manager = new RuntimeConcurrencyManager();

    await expect(
      acquireRuntimeLease(manager, { kind: " ", mode: "write", resources: ["layers"] })
    ).rejects.toThrow("kind is required");
    await expect(
      acquireRuntimeLease(manager, {
        kind: "invalid",
        mode: "write",
        resources: ["unknown" as "layers"]
      })
    ).rejects.toThrow("unknown resource");
    expect(manager.list()).toEqual([]);
  });

  it("allows writes for different resources and queues writes for the same resource", async () => {
    const manager = new RuntimeConcurrencyManager();
    const layers = await acquireRuntimeLease(manager, request("layers", "write", ["layers"]));
    const effects = await acquireRuntimeLease(manager, request("effects", "write", ["effects"]));
    const waiting = acquireRuntimeLease(manager, request("layers-2", "write", ["layers"]));

    expect(manager.list({ status: "active" })).toHaveLength(2);
    expect(manager.list({ status: "waiting" })).toEqual([
      expect.objectContaining({ kind: "layers-2", resources: ["layers"] })
    ]);
    expect(getRuntimeConcurrencyCounts(manager)).toEqual({ active: 2, waiting: 1 });

    layers.release();
    const next = await waiting;
    expect(manager.list({ resource: "layers" })).toEqual([
      expect.objectContaining({ kind: "layers-2", status: "active" })
    ]);
    effects.release();
    next.release();
    await manager.whenIdle();
  });

  it("gives a queued exclusive reservation preference over newer writes", async () => {
    const manager = new RuntimeConcurrencyManager();
    const first = await acquireRuntimeLease(manager, request("first", "write", ["layers"]));
    const exclusivePromise = acquireRuntimeLease(
      manager,
      request("scene", "exclusive", ["scene"])
    );
    const laterWritePromise = acquireRuntimeLease(
      manager,
      request("later", "write", ["effects"])
    );

    expect(manager.list().map(({ kind, status }) => [kind, status])).toEqual([
      ["first", "active"],
      ["scene", "waiting"],
      ["later", "waiting"]
    ]);
    first.release();

    const exclusive = await exclusivePromise;
    expect(manager.list({ status: "active" })).toEqual([
      expect.objectContaining({ kind: "scene", mode: "exclusive" })
    ]);
    expect(manager.list({ kind: "later" })[0]?.status).toBe("waiting");

    exclusive.release();
    const later = await laterWritePromise;
    expect(manager.list({ kind: "later" })[0]?.status).toBe("active");
    later.release();
  });

  it("rejects conflicts without creating observable lease state", async () => {
    const manager = new RuntimeConcurrencyManager();
    const holder = await acquireRuntimeLease(manager, request("holder", "write", ["layers"]));

    await expect(
      acquireRuntimeLease(manager, {
        ...request("rejected", "write", ["layers"]),
        conflictPolicy: "reject"
      })
    ).rejects.toMatchObject({
      name: "RuntimeMutationConflictError",
      code: "RUNTIME_MUTATION_CONFLICT",
      resource: "layers",
      holder: expect.objectContaining({ kind: "holder" })
    });
    expect(manager.list()).toHaveLength(1);
    holder.release();
  });

  it("blocks synchronous mutations for active or reserved conflicts without creating a lease", async () => {
    const manager = new RuntimeConcurrencyManager();
    const active = await acquireRuntimeLease(manager, request("active", "write", ["layers"]));
    const exclusivePromise = acquireRuntimeLease(
      manager,
      request("scene", "exclusive", ["scene"])
    );

    expect(() => assertRuntimeMutationAllowed(manager, "layers", "sync.layers")).toThrow(
      RuntimeMutationConflictError
    );
    expect(() => assertRuntimeMutationAllowed(manager, "effects", "sync.effects")).toThrow(
      RuntimeMutationConflictError
    );
    expect(manager.list()).toHaveLength(2);

    active.release();
    const exclusive = await exclusivePromise;
    exclusive.release();
  });

  it("uses an exclusive owner token for unobservable nested work", async () => {
    const manager = new RuntimeConcurrencyManager();
    const exclusive = await acquireRuntimeLease(
      manager,
      request("scene", "exclusive", ["scene"])
    );

    assertRuntimeMutationAllowed(manager, "layers", "scene.layers", exclusive.ownerToken);
    const nested = await acquireRuntimeLease(manager, {
      ...request("nested", "write", ["layers"]),
      ownerToken: getRuntimeLeaseOwner(
        withRuntimeLeaseOwner({ clear: true }, exclusive.ownerToken)
      )
    });
    expect(manager.list()).toHaveLength(1);

    nested.release();
    expect(manager.isBusy()).toBe(true);
    exclusive.release();
    expect(manager.isBusy()).toBe(false);
  });

  it("returns isolated frozen snapshots and filters states", async () => {
    const manager = new RuntimeConcurrencyManager();
    const lease = await acquireRuntimeLease(manager, {
      ...request("layers", "write", ["layers", "layers"]),
      operationId: "load-layers"
    });
    const state = manager.list({ resource: "scene", mode: "write" })[0]!;
    const originalTime = state.startedAt.getTime();

    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.resources)).toBe(true);
    expect(state.resources).toEqual(["layers"]);
    expect(state.activatedAt).toBeInstanceOf(Date);
    expect(() => (state.resources as string[]).push("effects")).toThrow();
    state.startedAt.setTime(0);
    expect(manager.list()[0]?.startedAt.getTime()).toBe(originalTime);
    expect(manager.isBusy("effects")).toBe(false);
    expect(manager.isBusy("scene")).toBe(true);

    lease.release();
  });

  it("keeps scheduling when a change listener throws", async () => {
    const manager = new RuntimeConcurrencyManager();
    manager.on("change", () => {
      throw new Error("listener failed");
    });

    const lease = await acquireRuntimeLease(manager, request("safe", "write", ["layers"]));
    expect(manager.isBusy("layers")).toBe(true);
    lease.release();
    expect(manager.isBusy()).toBe(false);
  });

  it("waits for matching leases and supports aborting the wait", async () => {
    const manager = new RuntimeConcurrencyManager();
    const lease = await acquireRuntimeLease(manager, request("layers", "write", ["layers"]));
    const idle = vi.fn();
    const unrelatedIdle = manager.whenIdle({ resource: "effects" }).then(idle);
    await unrelatedIdle;
    expect(idle).toHaveBeenCalledOnce();

    const controller = new AbortController();
    const waiting = manager.whenIdle({ resource: "layers" }, { signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });

    const actualIdle = manager.whenIdle({ resource: "layers" });
    lease.release();
    await expect(actualIdle).resolves.toBeUndefined();
  });

  it("removes an aborted queued lease and continues scheduling", async () => {
    const manager = new RuntimeConcurrencyManager();
    const active = await acquireRuntimeLease(manager, request("active", "write", ["layers"]));
    const controller = new AbortController();
    const canceled = acquireRuntimeLease(manager, {
      ...request("canceled", "exclusive", ["scene"]),
      signal: controller.signal
    });
    const nextPromise = acquireRuntimeLease(manager, request("next", "write", ["effects"]));

    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
    const next = await nextPromise;
    expect(manager.list({ kind: "next" })[0]?.status).toBe("active");

    active.release();
    next.release();
  });

  it("releases once after the real task settles on success or failure", async () => {
    const manager = new RuntimeConcurrencyManager();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const successPromise = runWithRuntimeLease(
      manager,
      request("success", "write", ["effects"]),
      async () => {
        expect(manager.isBusy("effects")).toBe(true);
        await gate;
        return 42;
      }
    );
    await vi.waitFor(() => expect(manager.isBusy("effects")).toBe(true));
    finish();
    const success = await successPromise;
    expect(success).toBe(42);
    expect(manager.isBusy()).toBe(false);

    const manual = await acquireRuntimeLease(manager, request("manual", "write", ["effects"]));
    manual.release();
    manual.release();
    expect(manager.isBusy()).toBe(false);

    await expect(
      runWithRuntimeLease(manager, request("failure", "write", ["layers"]), async () => {
        throw new Error("task failed");
      })
    ).rejects.toThrow("task failed");
    expect(manager.isBusy()).toBe(false);
  });

  it("publishes synchronous write leases while the mutation is running", () => {
    const manager = new RuntimeConcurrencyManager();
    const changes: number[] = [];
    const removed = vi.fn();
    manager.on("change", () => {
      changes.push(getRuntimeConcurrencyCounts(manager).active);
    });
    manager.on("remove", removed);

    const result = runWithRuntimeWriteLease(
      manager,
      { kind: "overlays.clear", resources: ["overlays"] },
      (lease) => {
        expect(manager.list()).toEqual([
          expect.objectContaining({
            id: lease.id,
            kind: "overlays.clear",
            status: "active"
          })
        ]);
        expect(getRuntimeConcurrencyCounts(manager)).toEqual({
          active: 1,
          waiting: 0
        });
        return 42;
      }
    );

    expect(result).toBe(42);
    expect(changes).toEqual([1, 0]);
    expect(removed).toHaveBeenCalledOnce();
    expect(getRuntimeConcurrencyCounts(manager)).toEqual({ active: 0, waiting: 0 });
  });

  it("destroys idempotently, rejects queued and new leases, and stops events", async () => {
    const manager = new RuntimeConcurrencyManager();
    const listener = vi.fn();
    manager.on("change", listener);
    const active = await acquireRuntimeLease(manager, request("active", "write", ["layers"]));
    const queued = acquireRuntimeLease(manager, request("queued", "write", ["layers"]));
    const idle = manager.whenIdle();

    destroyRuntimeConcurrency(manager);
    destroyRuntimeConcurrency(manager);

    await expect(queued).rejects.toThrow("destroyed");
    let idleResolved = false;
    void idle.then(() => {
      idleResolved = true;
    });
    await Promise.resolve();
    expect(idleResolved).toBe(false);
    await expect(
      acquireRuntimeLease(manager, request("late", "write", ["layers"]))
    ).rejects.toThrow("destroyed");
    expect(manager.list()).toEqual([
      expect.objectContaining({ kind: "active", status: "active" })
    ]);
    const callCount = listener.mock.calls.length;
    active.release();
    await expect(idle).resolves.toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(callCount);
  });
});

function request(
  kind: string,
  mode: "write" | "exclusive",
  resources: Array<
    | "scene"
    | "layers"
    | "effects"
  >
) {
  return { kind, mode, resources } as const;
}
