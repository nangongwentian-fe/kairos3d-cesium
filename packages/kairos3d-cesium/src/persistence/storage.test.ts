import { describe, expect, it } from "vitest";
import type { SceneSnapshot } from "../scene";
import {
  createLocalStorageSnapshotStorage,
  createMemorySnapshotStorage
} from "./storage";

const snapshot: SceneSnapshot = {
  version: 1,
  layers: [],
  bookmarks: [],
  createdAt: "2026-07-07T00:00:00.000Z"
};

describe("snapshot storage adapters", () => {
  it("saves, loads, lists, and removes snapshots in memory", async () => {
    const storage = createMemorySnapshotStorage();

    await storage.save("demo", snapshot, { name: "Demo" });
    const loaded = await storage.load("demo");
    loaded?.layers.push({ id: "osm", type: "xyz", url: "https://example.com/{z}/{x}/{y}.png" });

    expect(await storage.load("demo")).toEqual(snapshot);
    expect(await storage.list()).toMatchObject([{ id: "demo", name: "Demo" }]);
    await storage.save("demo", snapshot);
    expect((await storage.list())[0].updatedAt).toEqual(expect.any(String));
    await expect(storage.remove("demo")).resolves.toBe(true);
    await expect(storage.load("demo")).resolves.toBeUndefined();
  });

  it("persists snapshots through a provided localStorage-like object", async () => {
    const values = new Map<string, string>();
    const storage = createLocalStorageSnapshotStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    });

    await storage.save("scene", snapshot, { name: "Scene" });

    expect(await storage.load("scene")).toEqual(snapshot);
    expect(await storage.list()).toMatchObject([{ id: "scene", name: "Scene" }]);
    await expect(storage.remove("scene")).resolves.toBe(true);
    await expect(storage.list()).resolves.toEqual([]);
  });

  it("validates snapshots before saving them", async () => {
    const storage = createMemorySnapshotStorage();
    const invalid = { ...snapshot, createdAt: "invalid" } as SceneSnapshot;

    await expect(storage.save("invalid", invalid)).rejects.toThrow(/createdAt/i);
    await expect(storage.list()).resolves.toEqual([]);
  });

  it("validates localStorage data when loading it", async () => {
    const values = new Map<string, string>([
      ["kairos3d:scene-snapshot:invalid", JSON.stringify({ ...snapshot, version: 2 })]
    ]);
    const storage = createLocalStorageSnapshotStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    });

    await expect(storage.load("invalid")).rejects.toThrow(/version must be 1/i);
  });
});
