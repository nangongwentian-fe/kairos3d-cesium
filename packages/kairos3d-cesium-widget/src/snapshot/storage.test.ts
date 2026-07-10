import { describe, expect, it } from "vitest";
import { createMemoryWidgetSnapshotStorage } from "./storage";
import type { KairosPlatformSnapshot } from "../types";

describe("memory widget snapshot storage", () => {
  it("saves cloned snapshots and maintains records", async () => {
    const storage = createMemoryWidgetSnapshotStorage();
    const snapshot = createSnapshot();

    await storage.save("workspace", snapshot, { name: "Workspace" });
    snapshot.workspace.activeWidgetIds.push("changed-outside");

    const loaded = await storage.load("workspace");
    expect(loaded?.workspace.activeWidgetIds).toEqual(["layers"]);
    loaded?.workspace.activeWidgetIds.push("changed-loaded-copy");
    expect((await storage.load("workspace"))?.workspace.activeWidgetIds).toEqual(["layers"]);
    expect(await storage.list()).toMatchObject([
      { id: "workspace", name: "Workspace", updatedAt: undefined }
    ]);

    await storage.save("workspace", createSnapshot());
    expect((await storage.list())[0]?.updatedAt).toBeDefined();
    expect(await storage.remove("workspace")).toBe(true);
    expect(await storage.load("workspace")).toBeUndefined();
  });
});

function createSnapshot(): KairosPlatformSnapshot {
  return {
    version: 1,
    scene: {
      version: 1,
      layers: [],
      bookmarks: [],
      createdAt: "2026-07-10T00:00:00.000Z"
    },
    workspace: {
      version: 1,
      activeWidgetIds: ["layers"],
      placements: {},
      states: {},
      createdAt: "2026-07-10T00:00:00.000Z"
    },
    createdAt: "2026-07-10T00:00:00.000Z"
  };
}
