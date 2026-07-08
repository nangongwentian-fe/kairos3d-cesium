import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  Entity,
  ScreenSpaceEventType
} from "cesium";
import type { KairosMap } from "../core";
import { InteractiveTool } from "../tools/interactive-tool";
import { registerTool } from "../tools/registry";
import {
  canDeletePosition,
  clonePositions,
  midpoint
} from "./geometry";
import type {
  DrawEditHandleStyle,
  DrawEditOptions,
  DrawEditStartOptions,
  DrawResult
} from "./types";

type HandleKind = "vertex" | "midpoint";

interface EditHandle {
  entity: Entity;
  kind: HandleKind;
  index: number;
  insertIndex?: number;
  position: Cartesian3;
}

const defaultHandleStyle = {
  vertexColor: Color.ORANGE,
  midpointColor: Color.CYAN,
  selectedColor: Color.LIME,
  pixelSize: 10
};

export class DrawEditTool extends InteractiveTool<DrawEditStartOptions> {
  private result?: DrawResult;
  private positions: Cartesian3[] = [];
  private originalPositions: Cartesian3[] = [];
  private handles: EditHandle[] = [];
  private selectedIndex?: number;
  private dragging = false;
  private options: Required<Omit<DrawEditOptions, "handleStyle">> & {
    handleStyle: Required<DrawEditHandleStyle>;
  } = {
    allowInsert: true,
    allowDelete: true,
    showMidpoints: true,
    handleStyle: defaultHandleStyle
  };
  private removeDeleteListener?: () => void;

  constructor(map: KairosMap) {
    super(map, "draw.edit");
  }

  override start(options: DrawEditStartOptions): void {
    super.start(options);
    const result = this.map.draw.get(options.resultId);
    if (!result) {
      throw new Error(`Draw result "${options.resultId}" does not exist.`);
    }

    this.result = result;
    this.positions = clonePositions(result.positions);
    this.originalPositions = clonePositions(result.positions);
    this.selectedIndex = undefined;
    this.dragging = false;
    this.options = normalizeOptions(options);
    this.bindDeleteKey();
    this.rebuildHandles();

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      this.beginDrag(movement.position);
    }, ScreenSpaceEventType.LEFT_DOWN);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      this.drag(movement.endPosition);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.handler?.setInputAction(() => {
      this.endDrag();
    }, ScreenSpaceEventType.LEFT_UP);
  }

  override stop(): void {
    this.cleanupHandles();
    this.removeDeleteListener?.();
    this.removeDeleteListener = undefined;
    this.dragging = false;
    super.stop();
  }

  override cancel(): void {
    if (this.result) {
      this.map.draw.update(this.result.id, this.originalPositions);
    }
    super.cancel();
  }

  private beginDrag(windowPosition: Cartesian2): void {
    const handle = this.pickHandle(windowPosition);
    if (!handle || !this.result) {
      return;
    }

    if (handle.kind === "midpoint") {
      if (!this.options.allowInsert || handle.insertIndex === undefined) {
        return;
      }

      const position = this.pickPosition(windowPosition) ?? handle.position;
      this.positions.splice(handle.insertIndex, 0, Cartesian3.clone(position));
      this.selectedIndex = handle.insertIndex;
      this.map.draw.update(this.result.id, this.positions, "insert");
      this.rebuildHandles(this.selectedIndex);
    } else {
      this.selectedIndex = handle.index;
      this.rebuildHandles(this.selectedIndex);
    }

    this.dragging = true;
  }

  private drag(windowPosition: Cartesian2): void {
    if (!this.dragging || this.selectedIndex === undefined || !this.result) {
      return;
    }

    const position = this.pickPosition(windowPosition);
    if (!position) {
      return;
    }

    this.positions[this.selectedIndex] = Cartesian3.clone(position);
    this.map.draw.update(this.result.id, this.positions, "drag");
    const handle = this.handles.find(
      (candidate) => candidate.kind === "vertex" && candidate.index === this.selectedIndex
    );
    if (handle) {
      this.setHandlePosition(handle, position);
    }
  }

  private endDrag(): void {
    if (!this.dragging) {
      return;
    }

    this.dragging = false;
    this.rebuildHandles(this.selectedIndex);
  }

  private deleteSelected(): void {
    if (
      this.selectedIndex === undefined ||
      !this.result ||
      !this.options.allowDelete ||
      !canDeletePosition(this.result.type, this.positions.length)
    ) {
      return;
    }

    this.positions.splice(this.selectedIndex, 1);
    const nextSelected =
      this.positions.length === 0
        ? undefined
        : Math.min(this.selectedIndex, this.positions.length - 1);
    this.selectedIndex = nextSelected;
    this.map.draw.update(this.result.id, this.positions, "delete");
    this.rebuildHandles(nextSelected);
  }

  private rebuildHandles(selectedIndex?: number): void {
    this.cleanupHandles();
    if (!this.result) {
      return;
    }

    this.selectedIndex = selectedIndex;

    for (let index = 0; index < this.positions.length; index += 1) {
      this.handles.push(
        this.createHandle("vertex", index, this.positions[index], selectedIndex === index)
      );
    }

    if (
      this.result.type === "point" ||
      !this.options.allowInsert ||
      !this.options.showMidpoints
    ) {
      return;
    }

    const lastSegmentIndex =
      this.result.type === "polygon" ? this.positions.length : this.positions.length - 1;
    for (let index = 0; index < lastSegmentIndex; index += 1) {
      const nextIndex = (index + 1) % this.positions.length;
      this.handles.push(
        this.createHandle(
          "midpoint",
          index,
          midpoint(this.positions[index], this.positions[nextIndex]),
          false,
          index + 1
        )
      );
    }
  }

  private createHandle(
    kind: HandleKind,
    index: number,
    position: Cartesian3,
    selected: boolean,
    insertIndex?: number
  ): EditHandle {
    const style = this.options.handleStyle;
    const color = selected
      ? style.selectedColor
      : kind === "vertex"
        ? style.vertexColor
        : style.midpointColor;
    const entity = this.viewer.entities.add({
      id: `draw-edit-${kind}-${Math.random().toString(36).slice(2, 10)}`,
      position,
      point: {
        color,
        pixelSize: kind === "vertex" ? style.pixelSize : Math.max(6, style.pixelSize - 3),
        outlineColor: Color.BLACK,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    return {
      entity,
      kind,
      index,
      insertIndex,
      position: Cartesian3.clone(position)
    };
  }

  private cleanupHandles(): void {
    for (const handle of this.handles) {
      this.viewer.entities.remove(handle.entity);
    }
    this.handles = [];
  }

  private pickHandle(windowPosition: Cartesian2): EditHandle | undefined {
    const picked = this.viewer.scene.pick(windowPosition);
    const pickedEntity = picked?.id;
    if (!pickedEntity) {
      return undefined;
    }

    return this.handles.find((handle) => handle.entity === pickedEntity);
  }

  private setHandlePosition(handle: EditHandle, position: Cartesian3): void {
    handle.position = Cartesian3.clone(position);
    handle.entity.position = new ConstantPositionProperty(handle.position);
  }

  private bindDeleteKey(): void {
    const canvas = this.viewer.scene.canvas;
    const target =
      canvas.ownerDocument ?? (typeof document !== "undefined" ? document : undefined);
    if (!target) {
      return;
    }

    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      event.preventDefault();
      this.deleteSelected();
    };

    target.addEventListener("keydown", listener);
    this.removeDeleteListener = () => target.removeEventListener("keydown", listener);
  }
}

export function registerDefaultDrawEditTool(): void {
  registerTool("draw.edit", (map) => new DrawEditTool(map));
}

function normalizeOptions(
  options: DrawEditStartOptions
): Required<Omit<DrawEditOptions, "handleStyle">> & {
  handleStyle: Required<DrawEditHandleStyle>;
} {
  return {
    allowInsert: options.allowInsert ?? true,
    allowDelete: options.allowDelete ?? true,
    showMidpoints: options.showMidpoints ?? true,
    handleStyle: {
      ...defaultHandleStyle,
      ...options.handleStyle
    }
  };
}
