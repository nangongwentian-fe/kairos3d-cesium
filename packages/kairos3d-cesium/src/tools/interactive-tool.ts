import {
  Cartesian2,
  Cartesian3,
  defined,
  ScreenSpaceEventHandler,
  type Viewer
} from "cesium";
import type { KairosMap } from "../core";
import { Evented } from "../core";
import type { InteractiveToolEvents, Tool, ToolCompleteResult } from "./types";

export abstract class InteractiveTool<TOptions = unknown>
  extends Evented<InteractiveToolEvents>
  implements Tool<TOptions>
{
  protected handler?: ScreenSpaceEventHandler;
  protected started = false;
  private removeCancelListener?: () => void;

  constructor(
    protected readonly map: KairosMap,
    readonly id: string
  ) {
    super();
  }

  protected get viewer(): Viewer {
    return this.map.viewer;
  }

  start(_options?: TOptions): void | Promise<void> {
    this.stop();
    this.handler = new ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.bindEscapeCancel();
    this.started = true;
  }

  stop(): void {
    this.handler?.destroy();
    this.handler = undefined;
    this.removeCancelListener?.();
    this.removeCancelListener = undefined;
    this.started = false;
  }

  cancel(): void {
    if (!this.started) {
      return;
    }

    this.emit("cancel", { toolId: this.id });
    this.stop();
  }

  destroy(): void {
    this.stop();
    this.off();
  }

  protected notifyPointAdd(positions: Cartesian3[]): void {
    const data = { toolId: this.id, positions };
    this.emit("point-add", data);
    this.map.tools.emitPointAdd(data);
  }

  protected notifyComplete(result: ToolCompleteResult): void {
    this.emit("complete", result);
    this.map.tools.emitComplete(result);
  }

  protected pickPosition(windowPosition: Cartesian2): Cartesian3 | undefined {
    const scene = this.viewer.scene;

    if (scene.pickPositionSupported) {
      const picked = scene.pickPosition(windowPosition);
      if (defined(picked)) {
        return picked;
      }
    }

    const ellipsoid = scene.globe?.ellipsoid;
    if (!ellipsoid) {
      return undefined;
    }

    const picked = this.viewer.camera.pickEllipsoid(windowPosition, ellipsoid);
    return defined(picked) ? picked : undefined;
  }

  private bindEscapeCancel(): void {
    const canvas = this.viewer.scene.canvas;
    const target =
      canvas.ownerDocument ?? (typeof document !== "undefined" ? document : undefined);
    if (!target) {
      return;
    }

    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      this.map.tools.cancel();
    };

    target.addEventListener("keydown", listener);
    if (canvas.tabIndex < 0) {
      canvas.tabIndex = 0;
    }
    canvas.focus();
    this.removeCancelListener = () => target.removeEventListener("keydown", listener);
  }
}
