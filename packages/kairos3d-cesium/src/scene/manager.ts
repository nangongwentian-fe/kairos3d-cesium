import type { KairosMap } from "../core";
import {
  createOperationScope,
  runOrReuseOperation,
  withOperationContext,
  type OperationContext
} from "../operations/manager";
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
    if (options.includePrimitives) {
      snapshot.primitives = this.map.primitives.toJSON();
    }
    if (options.includeOverlays) {
      snapshot.overlays = this.map.overlays.toJSON();
    }
    if (options.includeEffects) {
      snapshot.effects = this.map.effects.toJSON();
    }

    return snapshot;
  }

  async load(snapshot: SceneSnapshot, options: SceneStateLoadOptions = {}): Promise<void> {
    return runOrReuseOperation(
      this.map.operations,
      { kind: "scene.load", label: "Load scene" },
      options,
      (context) => this.loadSnapshot(snapshot, options, context)
    );
  }

  private async loadSnapshot(
    snapshot: SceneSnapshot,
    options: SceneStateLoadOptions,
    context: OperationContext
  ): Promise<void> {
    const restoreOverlays = options.restoreOverlays ?? false;
    const restoreEffects = options.restoreEffects ?? false;
    context.throwIfAborted();
    context.reportProgress(0, "validate");
    if (restoreOverlays && snapshot.overlays) {
      this.map.overlays.validateSnapshots(snapshot.overlays);
    }
    if (restoreEffects) {
      this.map.effects.validateSnapshots(snapshot.effects ?? []);
    }
    context.throwIfAborted();

    const restoreResults = options.restoreResults ?? false;
    const clearResults = options.clearResults ?? restoreResults;
    const restorePrimitives = options.restorePrimitives ?? false;
    const clearPrimitives = options.clearPrimitives ?? restorePrimitives;
    const clearOverlays = options.clearOverlays ?? restoreOverlays;
    const clearEffects = options.clearEffects ?? restoreEffects;

    const stages: SceneLoadStage[] = [
      {
        phase: "layers",
        run: (scope) =>
          this.map.layers.load(
            snapshot.layers,
            withOperationContext(
              {
                clear: options.clearLayers ?? true,
                flyTo: false
              },
              scope
            )
          )
      },
      {
        phase: "bookmarks",
        run: () => this.bookmarks.replace(snapshot.bookmarks)
      }
    ];

    if (clearResults || restoreResults) {
      stages.push({
        phase: "results",
        run: async (scope) => {
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
            scope.throwIfAborted();
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
            scope.throwIfAborted();
          }
        }
      });
    }

    if (clearPrimitives || restorePrimitives) {
      stages.push({
        phase: "primitives",
        run: () => {
          if (clearPrimitives) {
            this.map.primitives.clear();
          }
          if (restorePrimitives && snapshot.primitives) {
            this.map.primitives.load(snapshot.primitives, { clear: false });
          }
        }
      });
    }

    if (clearOverlays || restoreOverlays) {
      stages.push({
        phase: "overlays",
        run: async (scope) => {
          if (clearOverlays) {
            this.map.overlays.clear();
          }
          if (restoreOverlays && snapshot.overlays) {
            await this.map.overlays.load(snapshot.overlays, { clear: false });
            scope.throwIfAborted();
          }
        }
      });
    }

    if (clearEffects || restoreEffects) {
      stages.push({
        phase: "effects",
        run: (scope) => {
          if (restoreEffects) {
            return this.map.effects.load(
              snapshot.effects ?? [],
              withOperationContext({ clear: clearEffects }, scope)
            );
          }
          this.map.effects.clear();
        }
      });
    }

    if ((options.flyToCamera ?? true) && snapshot.camera) {
      stages.push({
        phase: "camera",
        run: (scope) => this.flyToCameraWithOperation(snapshot.camera!, scope)
      });
    }

    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      const scope = createOperationScope(
        context,
        index / stages.length,
        (index + 1) / stages.length,
        stage.phase
      );
      scope.throwIfAborted();
      await stage.run(scope);
      scope.throwIfAborted();
      scope.reportProgress(1);
    }
  }

  private async flyToCameraWithOperation(
    view: CameraView,
    context: OperationContext
  ): Promise<boolean> {
    const camera = this.map.viewer.camera;
    const cancelFlight = () => camera.cancelFlight();
    context.signal.addEventListener("abort", cancelFlight, { once: true });
    try {
      context.throwIfAborted();
      const completed = await this.flyToCamera(view);
      context.throwIfAborted();
      return completed;
    } finally {
      context.signal.removeEventListener("abort", cancelFlight);
    }
  }

  destroy(): void {
    this.bookmarks.clear();
  }
}

interface SceneLoadStage {
  phase: string;
  run(context: OperationContext): void | Promise<unknown>;
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
