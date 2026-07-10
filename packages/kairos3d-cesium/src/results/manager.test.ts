import { Cartesian3, Entity } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { Evented } from "../core/events";
import { ResultManager } from "./manager";
import type { SDKManagedResult } from "./types";

interface StoreEvents<R extends SDKManagedResult> {
  add: R;
  remove: R;
  clear: R[];
}

class ResultStoreMock<R extends SDKManagedResult> extends Evented<StoreEvents<R>> {
  private readonly results = new Map<string, R>();

  add(result: R): R {
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): R | undefined {
    return this.results.get(id);
  }

  list(): R[] {
    return [...this.results.values()];
  }

  remove(id: string): boolean {
    const result = this.results.get(id);
    if (!result) {
      return false;
    }

    this.results.delete(id);
    this.emit("remove", result);
    return true;
  }

  clear(): void {
    const removed = this.list();
    this.results.clear();
    this.emit("clear", removed);
  }
}

function createResult(id: string, type: SDKManagedResult["type"]): SDKManagedResult {
  return {
    id,
    type,
    createdAt: new Date("2026-07-08T00:00:00.000Z")
  } as SDKManagedResult;
}

function createMapMock() {
  const stores = {
    draw: new ResultStoreMock<SDKManagedResult>(),
    measure: new ResultStoreMock<SDKManagedResult>(),
    visibility: new ResultStoreMock<SDKManagedResult>(),
    profile: new ResultStoreMock<SDKManagedResult>(),
    clipping: new ResultStoreMock<SDKManagedResult>(),
    terrain: new ResultStoreMock<SDKManagedResult>()
  };
  const map = {
    viewer: {
      entities: {
        contains: vi.fn(() => false)
      },
      flyTo: vi.fn(async () => true),
      camera: {
        flyToBoundingSphere: vi.fn((_sphere, options) => options.complete?.())
      }
    },
    draw: stores.draw,
    analysis: {
      measure: stores.measure,
      visibility: stores.visibility,
      profile: stores.profile,
      clipping: stores.clipping,
      terrain: stores.terrain
    }
  } as unknown as KairosMap;

  return { map, stores };
}

describe("ResultManager", () => {
  it("lists SDK-managed results across sources", () => {
    const { map, stores } = createMapMock();
    const manager = new ResultManager(map);
    stores.draw.add(createResult("draw-1", "polyline"));
    stores.measure.add(createResult("measure-1", "distance"));
    stores.terrain.add(createResult("terrain-1", "flood"));

    expect(manager.count()).toBe(3);
    expect(manager.list({ source: "terrain" })).toMatchObject([
      { id: "terrain-1", source: "terrain", type: "flood" }
    ]);
    expect(manager.list({ type: ["polyline", "distance"] }).map((record) => record.id)).toEqual([
      "draw-1",
      "measure-1"
    ]);
  });

  it("gets and removes results by id with optional source narrowing", () => {
    const { map, stores } = createMapMock();
    const manager = new ResultManager(map);
    stores.draw.add(createResult("shared", "polygon"));
    stores.measure.add(createResult("measure-1", "area"));

    expect(manager.get("shared")).toMatchObject({ source: "draw", type: "polygon" });
    expect(manager.get("shared", "measure")).toBeUndefined();
    expect(manager.remove("measure-1")).toBe(true);
    expect(stores.measure.list()).toEqual([]);
    expect(manager.remove("missing")).toBe(false);
  });

  it("clears by source or result type", () => {
    const { map, stores } = createMapMock();
    const manager = new ResultManager(map);
    stores.draw.add(createResult("draw-1", "point"));
    stores.draw.add(createResult("draw-2", "polyline"));
    stores.measure.add(createResult("measure-1", "distance"));
    stores.visibility.add(createResult("visibility-1", "visibility"));

    const removedDraw = manager.clear({ source: "draw" });
    const removedDistance = manager.clear({ type: "distance" });

    expect(removedDraw).toHaveLength(2);
    expect(removedDistance).toHaveLength(1);
    expect(manager.list().map((record) => record.id)).toEqual(["visibility-1"]);
  });

  it("flies to attached result entities before using coordinates", async () => {
    const { map, stores } = createMapMock();
    const manager = new ResultManager(map);
    const entity = new Entity({ id: "draw-entity" });
    vi.mocked(map.viewer.entities.contains).mockReturnValue(true);
    stores.draw.add({
      ...createResult("draw-entity", "point"),
      entity,
      positions: [Cartesian3.fromDegrees(114, 22)]
    } as SDKManagedResult);

    await expect(manager.flyTo("draw-entity", { source: "draw", duration: 1 })).resolves.toBe(
      true
    );
    expect(map.viewer.flyTo).toHaveBeenCalledWith(entity, {
      duration: 1,
      offset: undefined
    });
    expect(map.viewer.camera.flyToBoundingSphere).not.toHaveBeenCalled();
  });

  it("falls back to a position bounding sphere and returns false without a target", async () => {
    const { map, stores } = createMapMock();
    const manager = new ResultManager(map);
    stores.measure.add({
      ...createResult("distance-1", "distance"),
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.01, 22.01)
      ]
    } as SDKManagedResult);
    stores.clipping.add(createResult("plane-1", "plane"));

    await expect(manager.flyTo("distance-1")).resolves.toBe(true);
    await expect(manager.flyTo("plane-1")).resolves.toBe(false);
    await expect(manager.flyTo("missing")).resolves.toBe(false);
    expect(map.viewer.camera.flyToBoundingSphere).toHaveBeenCalledOnce();
  });

  it("emits aggregate add, remove, and clear events", () => {
    const { map, stores } = createMapMock();
    const manager = new ResultManager(map);
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClear = vi.fn();
    manager.on("add", onAdd);
    manager.on("remove", onRemove);
    manager.on("clear", onClear);

    stores.profile.add(createResult("profile-1", "profile"));
    stores.profile.remove("profile-1");
    stores.terrain.add(createResult("terrain-1", "volume"));
    stores.terrain.clear();

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: "profile-1", source: "profile" })
    }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: "profile-1", source: "profile" })
    }));
    expect(onClear).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ id: "terrain-1", source: "terrain" })]
    }));
  });

  it("removes aggregate listeners on destroy", () => {
    const { map, stores } = createMapMock();
    const manager = new ResultManager(map);
    const onAdd = vi.fn();
    manager.on("add", onAdd);

    manager.destroy();
    stores.draw.add(createResult("draw-1", "point"));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
