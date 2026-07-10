import { Cartographic } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import type { EffectLoadOptions, EffectSnapshot } from "../effects";
import type { LayerConfig, LayerLoadOptions } from "../layers";
import { OperationCanceledError, OperationManager } from "../operations";
import { runOrReuseOperation } from "../operations/manager";
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

interface CameraFlightCallbacks {
  complete?: () => void;
  cancel?: () => void;
}

function createMapMock() {
  const operations = new OperationManager();
  const camera = {
    positionCartographic: Cartographic.fromDegrees(
      cameraView.longitude,
      cameraView.latitude,
      cameraView.height
    ),
    heading: cameraView.heading,
    pitch: cameraView.pitch,
    roll: cameraView.roll,
    flyTo: vi.fn((options: CameraFlightCallbacks) => {
      options.complete?.();
    }),
    cancelFlight: vi.fn()
  };

  return {
    operations,
    viewer: {
      camera
    },
    layers: {
      toJSON: vi.fn(() => [layerConfig]),
      load: vi.fn((_configs: LayerConfig[], options: LayerLoadOptions = {}) =>
        runOrReuseOperation(
          operations,
          { kind: "layers.load" },
          options,
          async (context) => {
            context.reportProgress(1, "layers");
            return [];
          }
        )
      )
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
    },
    primitives: {
      toJSON: vi.fn(() => []),
      load: vi.fn(() => []),
      clear: vi.fn()
    },
    overlays: {
      toJSON: vi.fn(() => []),
      load: vi.fn(async () => []),
      clear: vi.fn(),
      validateSnapshots: vi.fn()
    },
    effects: {
      toJSON: vi.fn(() => []),
      load: vi.fn((_snapshots: EffectSnapshot[], options: EffectLoadOptions = {}) =>
        runOrReuseOperation(
          operations,
          { kind: "effects.load" },
          options,
          async (context) => {
            context.reportProgress(1, "effects");
            return [];
          }
        )
      ),
      clear: vi.fn(),
      validateSnapshots: vi.fn()
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
    expect(snapshot.effects).toBeUndefined();
    expect(map.effects.toJSON).not.toHaveBeenCalled();
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

  it("exports primitive overlays when requested", () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);

    const snapshot = manager.toJSON({ includePrimitives: true });

    expect(snapshot.primitives).toEqual([]);
    expect(map.primitives.toJSON).toHaveBeenCalledOnce();
  });

  it("exports entity overlays when requested", () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);

    const snapshot = manager.toJSON({ includeOverlays: true });

    expect(snapshot.overlays).toEqual([]);
    expect(map.overlays.toJSON).toHaveBeenCalledOnce();
  });

  it("exports effects when requested", () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);

    const snapshot = manager.toJSON({ includeEffects: true });

    expect(snapshot.effects).toEqual([]);
    expect(map.effects.toJSON).toHaveBeenCalledOnce();
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

    await manager.load(snapshot, { mode: "progressive" });

    expect(map.layers.load).toHaveBeenCalledWith(
      [layerConfig],
      expect.objectContaining({ clear: true, flyTo: false })
    );
    expect(map.viewer.camera.flyTo).toHaveBeenCalledOnce();
    expect(manager.bookmarks.list().map((bookmark) => bookmark.id)).toEqual(["home"]);
    expect(map.effects.validateSnapshots).not.toHaveBeenCalled();
    expect(map.effects.load).not.toHaveBeenCalled();
    expect(map.effects.clear).not.toHaveBeenCalled();
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

    await manager.load(snapshot, {
      mode: "progressive",
      clearLayers: false,
      flyToCamera: false
    });

    expect(map.layers.load).toHaveBeenCalledWith(
      [layerConfig],
      expect.objectContaining({ clear: false, flyTo: false })
    );
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

    await manager.load(snapshot, {
      mode: "progressive",
      restoreResults: true,
      flyToCamera: false
    });

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

  it("restores primitive overlays when requested", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [layerConfig],
      bookmarks: [],
      primitives: [],
      createdAt: "2026-07-07T00:00:00.000Z"
    };

    await manager.load(snapshot, {
      mode: "progressive",
      restorePrimitives: true,
      flyToCamera: false
    });

    expect(map.primitives.clear).toHaveBeenCalledOnce();
    expect(map.primitives.load).toHaveBeenCalledWith([], { clear: false });
  });

  it("restores entity overlays when requested", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [layerConfig],
      bookmarks: [],
      overlays: [],
      createdAt: "2026-07-07T00:00:00.000Z"
    };

    await manager.load(snapshot, {
      mode: "progressive",
      restoreOverlays: true,
      flyToCamera: false
    });

    expect(map.overlays.validateSnapshots).toHaveBeenCalledWith([]);
    expect(map.overlays.clear).toHaveBeenCalledOnce();
    expect(map.overlays.load).toHaveBeenCalledWith([], { clear: false });
  });

  it("validates entity overlays before clearing existing overlays", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    vi.mocked(map.overlays.validateSnapshots).mockImplementation(() => {
      throw new Error("invalid overlay");
    });
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [layerConfig],
      bookmarks: [],
      overlays: [],
      createdAt: "2026-07-07T00:00:00.000Z"
    };

    await expect(
      manager.load(snapshot, {
        mode: "progressive",
        restoreOverlays: true,
        flyToCamera: false
      })
    ).rejects.toThrow("invalid overlay");

    expect(map.overlays.clear).not.toHaveBeenCalled();
    expect(map.layers.load).not.toHaveBeenCalled();
  });

  it("restores effects after validating the complete effect snapshot", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [layerConfig],
      bookmarks: [],
      effects: [],
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    await manager.load(snapshot, {
      mode: "progressive",
      restoreEffects: true,
      flyToCamera: false
    });

    expect(map.effects.validateSnapshots).toHaveBeenCalledWith([]);
    expect(map.effects.load).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ clear: true })
    );
    expect(map.effects.clear).not.toHaveBeenCalled();
  });

  it("validates effects before modifying any scene state", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    vi.mocked(map.effects.validateSnapshots).mockImplementation(() => {
      throw new Error("invalid effect");
    });
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [layerConfig],
      bookmarks: [],
      effects: [],
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    await expect(
      manager.load(snapshot, {
        mode: "progressive",
        restoreEffects: true,
        flyToCamera: false
      })
    ).rejects.toThrow("invalid effect");

    expect(map.layers.load).not.toHaveBeenCalled();
    expect(map.effects.load).not.toHaveBeenCalled();
    expect(map.effects.clear).not.toHaveBeenCalled();
  });

  it("can clear effects without restoring a snapshot", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [layerConfig],
      bookmarks: [],
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    await manager.load(snapshot, {
      mode: "progressive",
      clearEffects: true,
      flyToCamera: false
    });

    expect(map.effects.clear).toHaveBeenCalledOnce();
    expect(map.effects.validateSnapshots).not.toHaveBeenCalled();
    expect(map.effects.load).not.toHaveBeenCalled();
  });

  it("tracks scene loading as one operation with scoped stage progress", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    const progress: Array<{ progress?: number; phase?: string }> = [];
    map.operations.on("change", (event) => {
      if (event.data.id === "scene-load") {
        progress.push(event.data);
      }
    });
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [layerConfig],
      bookmarks: [],
      effects: [],
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    await manager.load(snapshot, {
      mode: "progressive",
      restoreEffects: true,
      flyToCamera: false,
      operationId: "scene-load"
    });

    expect(map.operations.list().map((operation) => operation.kind)).toEqual(["scene.load"]);
    expect(map.operations.get("scene-load")).toMatchObject({
      status: "succeeded",
      progress: 1
    });
    expect(progress.map((state) => state.phase)).toEqual(
      expect.arrayContaining(["validate", "layers", "bookmarks", "effects"])
    );
    const values = progress
      .map((state) => state.progress)
      .filter((value): value is number => value !== undefined);
    expect(values).toEqual([...values].sort((left, right) => left - right));
  });

  it("stops remaining scene stages after cancellation", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    let release!: () => void;
    const pendingLayers = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markLayersSettled!: () => void;
    const layersSettled = new Promise<void>((resolve) => {
      markLayersSettled = resolve;
    });
    vi.mocked(map.layers.load).mockImplementation((_configs, options = {}) =>
      runOrReuseOperation(
        map.operations,
        { kind: "layers.load" },
        options,
        async (context) => {
          try {
            await pendingLayers;
            context.throwIfAborted();
            return [];
          } finally {
            markLayersSettled();
          }
        }
      )
    );
    const snapshot: SceneSnapshot = {
      version: 1,
      camera: cameraView,
      layers: [layerConfig],
      bookmarks: [
        {
          id: "home",
          view: cameraView,
          createdAt: "2026-07-10T00:00:00.000Z"
        }
      ],
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    const loading = manager.load(snapshot, {
      mode: "progressive",
      operationId: "cancel-scene"
    });
    await vi.waitFor(() => expect(map.layers.load).toHaveBeenCalledOnce());
    expect(map.operations.cancel("cancel-scene")).toBe(true);
    await expect(loading).rejects.toBeInstanceOf(OperationCanceledError);
    release();
    await layersSettled;

    expect(manager.bookmarks.list()).toEqual([]);
    expect(map.viewer.camera.flyTo).not.toHaveBeenCalled();
    expect(map.operations.list().map((operation) => operation.kind)).toEqual(["scene.load"]);
    expect(map.operations.get("cancel-scene")?.status).toBe("canceled");
  });

  it("does not restore analysis after draw loading cancels the scene operation", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    vi.mocked(map.draw.load).mockImplementation(async () => {
      map.operations.cancel("cancel-results");
      return [];
    });
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [],
      bookmarks: [],
      results: {
        draw: [],
        measure: [],
        visibility: [],
        profile: [],
        clipping: [],
        terrain: []
      },
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    await expect(
      manager.load(snapshot, {
        mode: "progressive",
        restoreResults: true,
        flyToCamera: false,
        operationId: "cancel-results"
      })
    ).rejects.toBeInstanceOf(OperationCanceledError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(map.draw.load).toHaveBeenCalledOnce();
    expect(map.analysis.load).not.toHaveBeenCalled();
  });

  it("does not start effects after overlay loading cancels the scene operation", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    vi.mocked(map.overlays.load).mockImplementation(async () => {
      map.operations.cancel("cancel-overlays");
      return [];
    });
    const snapshot: SceneSnapshot = {
      version: 1,
      layers: [],
      bookmarks: [],
      overlays: [],
      effects: [],
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    await expect(
      manager.load(snapshot, {
        mode: "progressive",
        restoreOverlays: true,
        restoreEffects: true,
        flyToCamera: false,
        operationId: "cancel-overlays"
      })
    ).rejects.toBeInstanceOf(OperationCanceledError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(map.overlays.load).toHaveBeenCalledOnce();
    expect(map.effects.load).not.toHaveBeenCalled();
  });

  it("cancels an active camera flight with the scene operation", async () => {
    const map = createMapMock();
    const manager = new SceneStateManager(map);
    let cancelFlight: (() => void) | undefined;
    vi.mocked(map.viewer.camera.flyTo).mockImplementation((options) => {
      cancelFlight = options.cancel;
    });
    vi.mocked(map.viewer.camera.cancelFlight).mockImplementation(() => {
      cancelFlight?.();
    });
    const snapshot: SceneSnapshot = {
      version: 1,
      camera: cameraView,
      layers: [],
      bookmarks: [],
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    const loading = manager.load(snapshot, {
      mode: "progressive",
      operationId: "cancel-camera"
    });
    await vi.waitFor(() => expect(map.viewer.camera.flyTo).toHaveBeenCalledOnce());
    expect(map.operations.cancel("cancel-camera")).toBe(true);
    await expect(loading).rejects.toBeInstanceOf(OperationCanceledError);

    expect(map.viewer.camera.cancelFlight).toHaveBeenCalledOnce();
    expect(map.operations.get("cancel-camera")?.status).toBe("canceled");
  });
});
