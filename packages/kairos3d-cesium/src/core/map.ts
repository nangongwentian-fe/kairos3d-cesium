import type { Viewer } from "cesium";
import { AnalysisManager } from "../analysis/manager";
import { DrawManager } from "../draw/manager";
import { EffectManager } from "../effects";
import { HeightManager } from "../height";
import { LayerManager, type LayerConfig } from "../layers";
import { MaterialManager } from "../materials";
import { PerformanceManager } from "../performance";
import { PickingManager, SelectionManager } from "../picking";
import { PrimitiveOverlayManager } from "../primitives";
import { OverlayManager } from "../overlays";
import { OperationManager } from "../operations";
import { ResultManager } from "../results";
import { SceneStateManager } from "../scene";
import { StyleManager } from "../style";
import { ToolManager } from "../tools";
import { Evented } from "./events";
import { createViewer, destroyViewer, type ViewerContainer, type ViewerOptions } from "./viewer";

export interface CreateMapOptions {
  container: ViewerContainer;
  viewerOptions?: ViewerOptions;
  layers?: LayerConfig[];
}

export interface KairosMapEvents {
  destroy: undefined;
}

export class KairosMap extends Evented<KairosMapEvents> {
  readonly viewer: Viewer;
  readonly layers: LayerManager;
  readonly tools: ToolManager;
  readonly draw: DrawManager;
  readonly analysis: AnalysisManager;
  readonly sceneState: SceneStateManager;
  readonly picking: PickingManager;
  readonly selection: SelectionManager;
  readonly styles: StyleManager;
  readonly materials: MaterialManager;
  readonly effects: EffectManager;
  readonly height: HeightManager;
  readonly results: ResultManager;
  readonly performance: PerformanceManager;
  readonly primitives: PrimitiveOverlayManager;
  readonly overlays: OverlayManager;
  readonly operations: OperationManager;

  private destroyed = false;
  private destroyCompleted = false;

  constructor(viewer: Viewer) {
    super();
    this.viewer = viewer;
    this.operations = new OperationManager();
    this.styles = new StyleManager();
    this.materials = new MaterialManager();
    this.effects = new EffectManager(this);
    this.height = new HeightManager(this);
    this.layers = new LayerManager(this);
    this.tools = new ToolManager(this);
    this.draw = new DrawManager(this);
    this.analysis = new AnalysisManager(this);
    this.sceneState = new SceneStateManager(this);
    this.selection = new SelectionManager(this);
    this.picking = new PickingManager(this);
    this.results = new ResultManager(this);
    this.primitives = new PrimitiveOverlayManager(this);
    this.overlays = new OverlayManager(this);
    this.performance = new PerformanceManager(this);
  }

  isDestroyed(): boolean {
    return this.destroyed || this.viewer.isDestroyed();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.operations.destroy();
    const sceneCleanup = this.sceneState.destroyAndWait();
    if (sceneCleanup) {
      void sceneCleanup.then(
        () => this.finishDestroy(),
        () => this.finishDestroy()
      );
      return;
    }
    this.finishDestroy();
  }

  private finishDestroy(): void {
    if (this.destroyCompleted) {
      return;
    }
    this.destroyCompleted = true;
    this.effects.destroy();
    this.materials.destroy();
    this.primitives.destroy();
    this.overlays.destroy();
    this.performance.destroy();
    this.results.destroy();
    this.tools.destroy();
    this.draw.destroy();
    this.analysis.destroy();
    this.picking.destroy();
    this.selection.destroy();
    this.layers.destroy();
    destroyViewer(this.viewer);
    this.emit("destroy", undefined);
    this.off();
  }
}

export async function createMap(options: CreateMapOptions): Promise<KairosMap> {
  const viewer = createViewer(options.container, options.viewerOptions);
  const map = new KairosMap(viewer);

  if (options.layers?.length) {
    for (const layer of options.layers) {
      await map.layers.add(layer);
    }
  }

  return map;
}
