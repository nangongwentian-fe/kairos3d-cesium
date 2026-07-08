import { Cartographic } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import type { LayerConfig } from "../layers";
import { CameraBookmarkManager, SceneStateManager } from "./manager";
import type { CameraBookmark, CameraView, SceneSnapshot } from "./types";

const cameraView: CameraView = {
  longitude: 114.2,
  latitude: 22.3,
  height: 1500,
  heading: 0.1,
  pitch: -0.8,
  roll: 0
};

const layerConfig: LayerConfig = {
  id: "osm",
  type: "xyz",
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
};

function createMapMock() {
  const camera = {
    positionCartographic: Cartographic.fromDegrees(
      cameraView.longitude,
      cameraView.latitude,
      cameraView.height
    ),
    heading: cameraView.heading,
    pitch: cameraView.pitch,
    roll: cameraView.roll,
    flyTo: vi.fn((options: { complete?: () => void }) => {
      options.complete?.();
    })
  };

  return {
    viewer: {
      camera
    },
    layers: {
      toJSON: vi.fn(() => [layerConfig]),
      load: vi.fn(async () => [])
    },
    draw: {
      toJSON: vi.fn(() => []),
      load: vi.fn(async () => []),
      clear: vi.fn()
    },
    analysis: {
      toJSON: vi.fn(() => ({
        measure: [],
        visibility: [],
        profile: [],
        clipping: [],
        terrain: []
      })),
      load: vi.fn(async () => undefined),
      measure: { clear: vi.fn() },
      visibility: { clear: vi.fn() },
      profile: { clear: vi.fn() },
      clipping: { clear: vi.fn() },
      terrain: { clear: vi.fn() }
    }
  } as unknown as KairosMap;
}

describe("CameraBookmarkManager", () => {
  it("adds, lists, gets, removes, and clears bookmarks", () => {
    const manager = new CameraBookmarkManager();
    const bookmark = manager.add({
      id: "home",
      name: "Home",
      view: cameraView
    });

    expect(bookmark.createdAt).toEqual(expect.any(String));
    expect(manager.get("home")).toMatchObject({ id: "home", name: "Home" });
    expect(manager.list()).toHaveLength(1);
    expect(manager.remove("home")).toBe(true);
    expect(manager.list()).toEqual([]);

    manager.add({ id: "home", view: cameraView });
    manager.clear();
    expect(manager.list()).toEqual([]);
  });

  it("clones bookmark views when storing and returning data", () => {
    const manager = new CameraBookmarkManager();
    const bookmark = manager.add({ id: "home", view: cameraView });
    bookmark.view.height = 1;

    expect(manager.get("home")?.view.height).toBe(1500);
  });

  it("replaces bookmarks", () => {
    const manager = new CameraBookmarkManager();
    const bookmarks: CameraBookmark[] = [
      {
        id: "home",
        view: cameraView,
        createdAt: "2026-07-07T00:00:00.000Z"
      }
    ];

    manager.add({ id: "old", view: cameraView });
    manager.replace(bookmarks);

    expect(manager.list().map((bookmark) => bookmark.id)).toEqual(["home"]);
  });
});

describe("SceneStateManager", () => {
  it("captures the current camera", () => {
    const manager = new SceneStateManager(createMapMock());

    expect(manager.captureCamera()).toMatchObject(cameraView);
  });

  it("flies to a camera view", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);

    await expect(manager.flyToCamera(cameraView, { duration: 0 })).resolves.toBe(true);

    expect(map.viewer.camera.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 0,
        orientation: {
          heading: cameraView.heading,
          pitch: cameraView.pitch,
          roll: cameraView.roll
        }
      })
    );
  });

  it("exports a scene snapshot", () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    manager.bookmarks.add({ id: "home", view: cameraView });

    const snapshot = manager.toJSON();

    expect(snapshot).toMatchObject({
      version: 1,
      camera: cameraView,
      layers: [layerConfig],
      bookmarks: [expect.objectContaining({ id: "home" })],
      createdAt: expect.any(String)
    });
  });

  it("exports runtime results when requested", () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);

    const snapshot = manager.toJSON({ includeResults: true });

    expect(snapshot.results).toEqual({
      draw: [],
      measure: [],
      visibility: [],
      profile: [],
      clipping: [],
      terrain: []
    });
    expect(map.draw.toJSON).toHaveBeenCalledOnce();
    expect(map.analysis.toJSON).toHaveBeenCalledOnce();
  });

  it("loads snapshot layers, bookmarks, and camera by default", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    const snapshot: SceneSnapshot = {
      version: 1,
      camera: cameraView,
      layers: [layerConfig],
      bookmarks: [
        {
          id: "home",
          view: cameraView,
          createdAt: "2026-07-07T00:00:00.000Z"
        }
      ],
      createdAt: "2026-07-07T00:00:00.000Z"
    };

    await manager.load(snapshot);

    expect(map.layers.load).toHaveBeenCalledWith([layerConfig], {
      clear: true,
      flyTo: false
    });
    expect(map.viewer.camera.flyTo).toHaveBeenCalledOnce();
    expect(manager.bookmarks.list().map((bookmark) => bookmark.id)).toEqual(["home"]);
  });

  it("can load a snapshot without clearing layers or moving the camera", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [layerConfig],
      bookmarks: [],
      createdAt: "2026-07-07T00:00:00.000Z"
    };

    await manager.load(snapshot, { clearLayers: false, flyToCamera: false });

    expect(map.layers.load).toHaveBeenCalledWith([layerConfig], {
      clear: false,
      flyTo: false
    });
    expect(map.viewer.camera.flyTo).not.toHaveBeenCalled();
  });

  it("restores runtime results when requested", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [layerConfig],
      bookmarks: [],
      results: {
        draw: [],
        measure: [],
        visibility: [],
        profile: [],
        clipping: [],
        terrain: []
      },
      createdAt: "2026-07-07T00:00:00.000Z"
    };

    await manager.load(snapshot, { restoreResults: true, flyToCamera: false });

    expect(map.draw.clear).toHaveBeenCalledOnce();
    expect(map.analysis.measure.clear).toHaveBeenCalledOnce();
    expect(map.draw.load).toHaveBeenCalledWith([], { clear: false });
    expect(map.analysis.load).toHaveBeenCalledWith(
      {
        measure: [],
        visibility: [],
        profile: [],
        clipping: [],
        terrain: []
      },
      { clear: false }
    );
  });
});
