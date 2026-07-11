import type { Viewer } from "cesium";
import { describe, expect, it, vi } from "vitest";
import { acquireRuntimeLease } from "../concurrency/lease";
import { KairosMap } from "./map";

function createViewerMock(destroyed = false): Viewer {
  return {
    isDestroyed: vi.fn(() => destroyed),
    destroy: vi.fn()
  } as unknown as Viewer;
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function spyOnManagerDestroy(
  map: KairosMap,
  destroyScene: () => void | Promise<void>
) {
  return [
    vi.spyOn(map.operations, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.sceneState, "destroyAndWait").mockImplementation(destroyScene),
    vi.spyOn(map.effects, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.materials, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.primitives, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.overlays, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.performance, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.results, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.tools, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.draw, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.analysis, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.picking, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.selection, "destroy").mockImplementation(() => undefined),
    vi.spyOn(map.layers, "destroy").mockImplementation(() => undefined)
  ];
}

describe("KairosMap", () => {
  it("waits for scene transaction cleanup before destroying downstream managers", async () => {
    const viewer = createViewerMock(true);
    const map = new KairosMap(viewer);
    const destroyListener = vi.fn();
    const sceneCleanup = createDeferred();
    const managerDestroySpies = spyOnManagerDestroy(map, () => sceneCleanup.promise);
    map.on("destroy", destroyListener);

    map.destroy();
    map.destroy();

    expect(map.isDestroyed()).toBe(true);
    expect(managerDestroySpies[0]).toHaveBeenCalledOnce();
    expect(managerDestroySpies[1]).toHaveBeenCalledOnce();
    expect(managerDestroySpies[2]).not.toHaveBeenCalled();
    expect(destroyListener).not.toHaveBeenCalled();

    sceneCleanup.resolve();
    await sceneCleanup.promise;
    await vi.waitFor(() => expect(managerDestroySpies[2]).toHaveBeenCalledOnce());

    for (const spy of managerDestroySpies) {
      expect(spy).toHaveBeenCalledOnce();
    }
    expect(viewer.destroy).not.toHaveBeenCalled();
    expect(destroyListener).toHaveBeenCalledOnce();

    const [
      operationsDestroy,
      sceneStateDestroy,
      effectsDestroy,
      materialsDestroy,
      primitivesDestroy
    ] = managerDestroySpies;
    expect(operationsDestroy.mock.invocationCallOrder[0]).toBeLessThan(
      sceneStateDestroy.mock.invocationCallOrder[0]
    );
    expect(sceneStateDestroy.mock.invocationCallOrder[0]).toBeLessThan(
      effectsDestroy.mock.invocationCallOrder[0]
    );
    expect(effectsDestroy.mock.invocationCallOrder[0]).toBeLessThan(
      materialsDestroy.mock.invocationCallOrder[0]
    );
    expect(materialsDestroy.mock.invocationCallOrder[0]).toBeLessThan(
      primitivesDestroy.mock.invocationCallOrder[0]
    );
  });

  it("destroys downstream managers synchronously when no scene transaction is active", () => {
    const viewer = createViewerMock(true);
    const map = new KairosMap(viewer);
    const destroyListener = vi.fn();
    const managerDestroySpies = spyOnManagerDestroy(map, () => undefined);
    map.on("destroy", destroyListener);

    map.destroy();

    for (const spy of managerDestroySpies) {
      expect(spy).toHaveBeenCalledOnce();
    }
    expect(destroyListener).toHaveBeenCalledOnce();
  });

  it("waits for active mutation work after preventing new leases", async () => {
    const viewer = createViewerMock(true);
    const map = new KairosMap(viewer);
    const lease = await acquireRuntimeLease(map.concurrency, {
      kind: "late-work",
      mode: "write",
      resources: ["effects"]
    });
    const managerDestroySpies = spyOnManagerDestroy(map, () => undefined);

    map.destroy();

    await expect(
      acquireRuntimeLease(map.concurrency, {
        kind: "too-late",
        mode: "write",
        resources: ["effects"]
      })
    ).rejects.toThrow("destroyed");
    expect(managerDestroySpies[2]).not.toHaveBeenCalled();
    lease.release();
    await vi.waitFor(() => expect(managerDestroySpies[2]).toHaveBeenCalledOnce());
  });
});
