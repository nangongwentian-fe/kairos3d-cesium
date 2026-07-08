import type { KairosMap } from "../core";
import { cameraViewFromCartographic, cameraViewToCartesian, cloneCameraView } from "./camera";
import type {
  CameraBookmark,
  CameraBookmarkInput,
  CameraFlightOptions,
  CameraView,
  SceneSnapshot,
  SceneStateSnapshotOptions,
  SceneStateLoadOptions
} from "./types";

export class SceneStateManager {
  readonly bookmarks = new CameraBookmarkManager();

  constructor(private readonly map: KairosMap) {}

  captureCamera(): CameraView {
    const camera = this.map.viewer.camera;
    return cameraViewFromCartographic(
      camera.positionCartographic,
      camera.heading,
      camera.pitch,
      camera.roll
    );
  }

  flyToCamera(view: CameraView, options: CameraFlightOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
      this.map.viewer.camera.flyTo({
        ...options,
        destination: cameraViewToCartesian(view),
        orientation: {
          heading: view.heading,
          pitch: view.pitch,
          roll: view.roll
        },
        complete: () => resolve(true),
        cancel: () => resolve(false)
      });
    });
  }

  toJSON(options: SceneStateSnapshotOptions = {}): SceneSnapshot {
    const snapshot: SceneSnapshot = {
      version: 1,
      camera: this.captureCamera(),
      layers: this.map.layers.toJSON(),
      bookmarks: this.bookmarks.list(),
      createdAt: new Date().toISOString()
    };

    if (options.includeResults) {
      snapshot.results = {
        draw: this.map.draw.toJSON(),
        ...this.map.analysis.toJSON()
      };
    }

    return snapshot;
  }

  async load(snapshot: SceneSnapshot, options: SceneStateLoadOptions = {}): Promise<void> {
    await this.map.layers.load(snapshot.layers, {
      clear: options.clearLayers ?? true,
      flyTo: false
    });

    this.bookmarks.replace(snapshot.bookmarks);

    const restoreResults = options.restoreResults ?? false;
    const clearResults = options.clearResults ?? restoreResults;
    if (clearResults) {
      this.map.draw.clear();
      this.map.analysis.measure.clear();
      this.map.analysis.visibility.clear();
      this.map.analysis.profile.clear();
      this.map.analysis.clipping.clear();
      this.map.analysis.terrain.clear();
    }
    if (restoreResults && snapshot.results) {
      await this.map.draw.load(snapshot.results.draw, { clear: false });
      await this.map.analysis.load(
        {
          measure: snapshot.results.measure,
          visibility: snapshot.results.visibility,
          profile: snapshot.results.profile,
          clipping: snapshot.results.clipping,
          terrain: snapshot.results.terrain ?? []
        },
        { clear: false }
      );
    }

    if ((options.flyToCamera ?? true) && snapshot.camera) {
      await this.flyToCamera(snapshot.camera);
    }
  }

  destroy(): void {
    this.bookmarks.clear();
  }
}

export class CameraBookmarkManager {
  private readonly items = new Map<string, CameraBookmark>();

  add(bookmark: CameraBookmarkInput): CameraBookmark {
    const next: CameraBookmark = {
      ...bookmark,
      view: cloneCameraView(bookmark.view),
      createdAt: bookmark.createdAt ?? new Date().toISOString()
    };

    this.items.set(next.id, next);
    return cloneBookmark(next);
  }

  get(id: string): CameraBookmark | undefined {
    const bookmark = this.items.get(id);
    return bookmark ? cloneBookmark(bookmark) : undefined;
  }

  list(): CameraBookmark[] {
    return [...this.items.values()].map(cloneBookmark);
  }

  remove(id: string): boolean {
    return this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }

  replace(bookmarks: CameraBookmark[]): void {
    this.clear();
    for (const bookmark of bookmarks) {
      this.add(bookmark);
    }
  }
}

function cloneBookmark(bookmark: CameraBookmark): CameraBookmark {
  return {
    ...bookmark,
    view: cloneCameraView(bookmark.view)
  };
}
