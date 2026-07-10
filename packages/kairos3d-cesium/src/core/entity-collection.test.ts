import { Entity, type EntityCollection } from "cesium";
import { describe, expect, it, vi } from "vitest";
import {
  removeEntityIfOwned,
  removeEntityIfOwnedTracked
} from "./entity-collection";

describe("removeEntityIfOwned", () => {
  it("does not remove a different entity that has the same id", () => {
    const current = new Entity({ id: "shared" });
    const staged = new Entity({ id: "shared" });
    const remove = vi.fn(() => true);
    const collection = {
      getById: vi.fn(() => current),
      remove
    } as unknown as EntityCollection;

    expect(removeEntityIfOwned(collection, staged)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes the exact entity instance", () => {
    const entity = new Entity({ id: "owned" });
    const remove = vi.fn(() => true);
    const collection = {
      getById: vi.fn(() => entity),
      remove
    } as unknown as EntityCollection;

    expect(removeEntityIfOwned(collection, entity)).toBe(true);
    expect(remove).toHaveBeenCalledWith(entity);
  });

  it("tracks only entities that were actually detached when remove throws", () => {
    const first = new Entity({ id: "first" });
    const second = new Entity({ id: "second" });
    const current = new Map([
      [first.id, first],
      [second.id, second]
    ]);
    const collection = {
      getById: vi.fn((id: string) => current.get(id)),
      remove: vi.fn((entity: Entity) => {
        if (entity === second) {
          throw new Error("remove failed");
        }
        current.delete(entity.id);
        return true;
      })
    } as unknown as EntityCollection;
    const detached: Entity[] = [];

    removeEntityIfOwnedTracked(collection, first, detached);
    expect(() => removeEntityIfOwnedTracked(collection, second, detached)).toThrow(
      "remove failed"
    );

    expect(detached).toEqual([first]);
  });
});
