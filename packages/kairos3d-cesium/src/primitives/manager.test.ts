import { Cartesian3, PolylineCollection } from "cesium";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RuntimeConcurrencyManager } from "../concurrency";
import {
  acquireRuntimeLease,
  withRuntimeLeaseOwner
} from "../concurrency/lease";
import type { KairosMap } from "../core";
import { PrimitiveOverlayManager } from "./manager";
import type { PrimitivePolylineSnapshot } from "./types";

beforeAll(() => {
  vi.stubGlobal("HTMLCanvasElement", class HTMLCanvasElementMock {});
  vi.stubGlobal("HTMLImageElement", class HTMLImageElementMock {});
  vi.stubGlobal("HTMLVideoElement", class HTMLVideoElementMock {});
  vi.stubGlobal("ImageBitmap", class ImageBitmapMock {});
  vi.stubGlobal("OffscreenCanvas", class OffscreenCanvasMock {});
});

function createMapMock() {
  const collections: PolylineCollection[] = [];
  return {
    collections,
    map: {
      concurrency: new RuntimeConcurrencyManager(),
      viewer: {
        scene: {
          primitives: {
            destroyPrimitives: true,
            add: vi.fn((collection: PolylineCollection) => {
              collections.push(collection);
              return collection;
            }),
            remove: vi.fn((collection: PolylineCollection) => {
              const index = collections.indexOf(collection);
              if (index >= 0) {
                collections.splice(index, 1);
              }
              return true;
            })
          }
        }
      }
    } as unknown as KairosMap
  };
}

function createPositions(): Cartesian3[] {
  return [
    Cartesian3.fromDegrees(114, 22, 10),
    Cartesian3.fromDegrees(114.01, 22.01, 20)
  ];
}

describe("PrimitiveOverlayManager", () => {
  it("rejects ordinary mutations while primitives are leased", async () => {
    const { map } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);
    const lease = await acquireRuntimeLease(map.concurrency, {
      kind: "scene.load",
      mode: "exclusive",
      resources: ["scene"]
    });

    expect(() =>
      manager.addPolyline({ id: "blocked", positions: createPositions() })
    ).toThrow("Runtime resource");
    expect(() => manager.load([], { clear: true })).toThrow("Runtime resource");
    expect(
      manager.load(
        [],
        withRuntimeLeaseOwner({ clear: true }, lease.ownerToken)
      )
    ).toEqual([]);
    expect(() => manager.clear()).toThrow("Runtime resource");
    expect(() => manager.clearWithRuntimeLease(lease.ownerToken)).not.toThrow();

    lease.release();
  });

  it("adds, lists, and toggles primitive polyline overlays", () => {
    const { map, collections } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);

    const overlay = manager.addPolyline({
      id: "primitive-line",
      positions: createPositions(),
      color: "#00d4ff",
      width: 4,
      metadata: { kind: "demo" }
    });
    const hidden = manager.setShow("primitive-line", false);

    expect(collections).toHaveLength(1);
    expect(overlay.polyline.width).toBe(4);
    expect(overlay.collection.length).toBe(1);
    expect(manager.list()).toEqual([overlay]);
    expect(hidden.show).toBe(false);
    expect(overlay.polyline.show).toBe(false);
  });

  it("serializes and restores primitive overlays without runtime objects", () => {
    const { map } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);
    const overlay = manager.addPolyline({
      id: "primitive-line",
      positions: createPositions(),
      show: false,
      loop: true
    });
    const snapshot = manager.toJSON();
    const restoredMap = createMapMock();
    const restoredManager = new PrimitiveOverlayManager(restoredMap.map);

    const restored = restoredManager.load(snapshot, { clear: true });

    expect(snapshot[0]).toMatchObject({
      id: overlay.id,
      type: "polyline",
      show: false,
      loop: true
    });
    expect("polyline" in snapshot[0]).toBe(false);
    expect(restored[0]).toMatchObject({
      id: overlay.id,
      type: "polyline",
      show: false,
      loop: true
    });
  });

  it("removes overlays and destroys empty collections", () => {
    const { map, collections } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);
    manager.addPolyline({ id: "primitive-line", positions: createPositions() });

    expect(manager.remove("primitive-line")).toBe(true);
    expect(collections).toHaveLength(0);
    expect(manager.remove("missing")).toBe(false);
  });

  it("rejects invalid primitive polyline input and duplicate ids", () => {
    const { map } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);
    manager.addPolyline({ id: "primitive-line", positions: createPositions() });

    expect(() =>
      manager.addPolyline({ positions: [Cartesian3.fromDegrees(114, 22, 0)] })
    ).toThrow("Primitive polyline overlay requires at least two positions.");
    expect(() =>
      manager.addPolyline({ id: "primitive-line", positions: createPositions() })
    ).toThrow('Primitive overlay "primitive-line" already exists.');
    expect(() =>
      manager.addPolyline({ positions: createPositions(), width: Number.NaN })
    ).toThrow("Primitive polyline width must be a positive finite number.");
  });

  it("loads primitive snapshots with clear", () => {
    const { map } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);
    manager.addPolyline({ id: "old", positions: createPositions() });
    const snapshot: PrimitivePolylineSnapshot = {
      id: "new",
      type: "polyline",
      positions: [
        { longitude: 114, latitude: 22, height: 10 },
        { longitude: 114.01, latitude: 22.01, height: 20 }
      ],
      color: { red: 0, green: 1, blue: 1, alpha: 1 },
      width: 2,
      show: true,
      loop: false,
      createdAt: "2026-07-08T00:00:00.000Z"
    };

    manager.load([snapshot], { clear: true });

    expect(manager.list().map((overlay) => overlay.id)).toEqual(["new"]);
  });

  it("validates primitive snapshots before mutating existing overlays", () => {
    const { map } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);
    manager.addPolyline({ id: "old", positions: createPositions() });
    const invalidSnapshot: PrimitivePolylineSnapshot = {
      id: "new",
      type: "polyline",
      positions: [
        { longitude: 114, latitude: 22, height: 10 },
        { longitude: 114.01, latitude: 22.01, height: 20 }
      ],
      color: { red: 0, green: 1, blue: 1, alpha: 1 },
      width: 0,
      show: true,
      loop: false,
      createdAt: "2026-07-08T00:00:00.000Z"
    };

    expect(() => manager.load([invalidSnapshot], { clear: true })).toThrow(
      "Primitive polyline width must be a positive finite number."
    );
    expect(manager.list().map((overlay) => overlay.id)).toEqual(["old"]);
  });

  it("rejects duplicate primitive snapshot ids before restoring", () => {
    const { map } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);
    const snapshot: PrimitivePolylineSnapshot = {
      id: "line",
      type: "polyline",
      positions: [
        { longitude: 114, latitude: 22, height: 10 },
        { longitude: 114.01, latitude: 22.01, height: 20 }
      ],
      color: { red: 0, green: 1, blue: 1, alpha: 1 },
      width: 2,
      show: true,
      loop: false,
      createdAt: "2026-07-08T00:00:00.000Z"
    };

    expect(() => manager.load([snapshot, snapshot])).toThrow(
      'Primitive overlay snapshot id "line" is duplicated.'
    );
    expect(manager.list()).toEqual([]);
  });

  it("stages primitive runtime and restores the original collection on rollback", async () => {
    const { map, collections } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);
    const original = manager.addPolyline({ id: "old", positions: createPositions() });
    const originalCollection = original.collection;
    const snapshot: PrimitivePolylineSnapshot = {
      id: "new",
      type: "polyline",
      positions: [
        { longitude: 114, latitude: 22, height: 10 },
        { longitude: 114.01, latitude: 22.01, height: 20 }
      ],
      color: { red: 0, green: 1, blue: 1, alpha: 1 },
      width: 3,
      show: true,
      loop: false,
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    const stage = await manager.prepareSceneLoad([snapshot], { clear: true });
    expect(collections).toEqual([originalCollection]);

    await stage.commit();
    expect(manager.list().map((overlay) => overlay.id)).toEqual(["new"]);
    expect(collections).toHaveLength(1);
    expect(collections[0]).not.toBe(originalCollection);

    await stage.rollback();
    expect(manager.get("old")).toBe(original);
    expect(manager.get("old")?.collection).toBe(originalCollection);
    expect(collections).toEqual([originalCollection]);
    await stage.dispose();
  });

  it("consumes the exact primitive preflight token without reparsing input", async () => {
    const { map } = createMapMock();
    const manager = new PrimitiveOverlayManager(map);
    const snapshot: PrimitivePolylineSnapshot = {
      id: "token-line",
      type: "polyline",
      positions: [
        { longitude: 114, latitude: 22, height: 10 },
        { longitude: 114.01, latitude: 22.01, height: 20 }
      ],
      color: { red: 0, green: 1, blue: 1, alpha: 1 },
      width: 3,
      show: true,
      loop: false,
      createdAt: "2026-07-10T00:00:00.000Z"
    };
    const token = manager.preflightSceneLoad([snapshot], { clear: true });
    snapshot.positions.length = 0;

    const stage = await manager.prepareSceneLoad(
      [snapshot],
      { clear: true },
      token
    );
    await stage.dispose();
    await expect(
      manager.prepareSceneLoad([snapshot], { clear: true }, token)
    ).rejects.toThrow("invalid or stale");
  });
});
