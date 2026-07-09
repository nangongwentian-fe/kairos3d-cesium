import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  Cartographic,
  Entity,
  SceneTransforms,
  ScreenSpaceEventType
} from "cesium";
import type { KairosMap } from "../core";
import { InteractiveTool } from "../tools/interactive-tool";
import { registerTool } from "../tools/registry";
import {
  canDeletePosition,
  clonePositions,
  isWithinHandleScreenDistance,
  midpoint
} from "./geometry";
import type {
  DrawEditHandleStyle,
  DrawEditOptions,
  DrawEditStartOptions,
  DrawResult
} from "./types";

type HandleKind = "vertex" | "midpoint" | "circle-edge";

interface EditHandle {
  entity: Entity;
  kind: HandleKind;
  index: number;
  insertIndex?: number;
  position: Cartesian3;
  pixelSize: number;
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
  private data?: DrawResult["data"];
  private originalData?: DrawResult["data"];
  private handles: EditHandle[] = [];
  private selectedIndex?: number;
  private selectedKind?: HandleKind;
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
    this.data = cloneData(result.data);
    this.originalData = cloneData(result.data);
    this.selectedIndex = undefined;
    this.selectedKind = undefined;
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
      this.map.draw.update(this.result.id, {
        positions: this.originalPositions,
        data: this.originalData
      });
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
      this.selectedKind = "vertex";
      this.map.draw.update(this.result.id, this.positions, "insert");
      this.rebuildHandles(this.selectedIndex);
    } else {
      this.selectedIndex = handle.index;
      this.selectedKind = handle.kind;
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

    if (this.selectedKind === "circle-edge") {
      this.data = {
        ...this.data,
        radius: Cartesian3.distance(this.positions[0], position)
      };
      this.map.draw.update(this.result.id, { data: this.data }, "drag");
    } else {
      this.positions[this.selectedIndex] = Cartesian3.clone(position);
      this.map.draw.update(this.result.id, {
        positions: this.positions,
        data: this.data
      }, "drag");
    }

    const handle = this.handles.find(
      (candidate) =>
        candidate.kind === this.selectedKind && candidate.index === this.selectedIndex
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
    this.selectedKind = undefined;
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
    this.map.draw.update(this.result.id, {
      positions: this.positions,
      data: this.data
    }, "delete");
    this.rebuildHandles(nextSelected);
  }

  private rebuildHandles(selectedIndex?: number): void {
    this.cleanupHandles();
    if (!this.result) {
      return;
    }

    this.selectedIndex = selectedIndex;

    if (this.result.type === "circle") {
      this.handles.push(
        this.createHandle("vertex", 0, this.positions[0], selectedIndex === 0)
      );
      this.handles.push(
        this.createHandle(
          "circle-edge",
          0,
          circleEdgePosition(this.positions[0], this.data?.radius ?? 1),
          false
        )
      );
      return;
    }

    for (let index = 0; index < this.positions.length; index += 1) {
      this.handles.push(
        this.createHandle("vertex", index, this.positions[index], selectedIndex === index)
      );
    }

    if (
      this.result.type === "point" ||
      this.result.type === "rectangle" ||
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
    const pixelSize = kind === "midpoint" ? Math.max(6, style.pixelSize - 3) : style.pixelSize;
    const entity = this.viewer.entities.add({
      id: `draw-edit-${kind}-${Math.random().toString(36).slice(2, 10)}`,
      position,
      point: {
        color,
        pixelSize,
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
      position: Cartesian3.clone(position),
      pixelSize
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
    if (pickedEntity) {
      const pickedHandle = this.handles.find((handle) => handle.entity === pickedEntity);
      if (pickedHandle) {
        return pickedHandle;
      }
    }

    return this.pickNearestHandle(windowPosition);
  }

  private pickNearestHandle(windowPosition: Cartesian2): EditHandle | undefined {
    let nearest: { handle: EditHandle; distance: number } | undefined;
    for (const handle of this.handles) {
      const screenPosition = SceneTransforms.worldToWindowCoordinates(
        this.viewer.scene,
        handle.position
      );
      if (!isWithinHandleScreenDistance(windowPosition, screenPosition, handle.pixelSize)) {
        continue;
      }

      const distance = Cartesian2.distance(windowPosition, screenPosition);
      if (!nearest || distance < nearest.distance) {
        nearest = { handle, distance };
      }
    }

    return nearest?.handle;
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

function cloneData(data: DrawResult["data"]): DrawResult["data"] {
  return data ? { ...data } : undefined;
}

function circleEdgePosition(center: Cartesian3, radius: number): Cartesian3 {
  const cartographic = Cartographic.fromCartesian(center);
  if (!cartographic || !Number.isFinite(radius) || radius <= 0) {
    return Cartesian3.clone(center);
  }

  const earthRadius = 6378137;
  const longitudeDelta =
    radius / (earthRadius * Math.max(Math.abs(Math.cos(cartographic.latitude)), 0.01));
  return Cartesian3.fromRadians(
    cartographic.longitude + longitudeDelta,
    cartographic.latitude,
    cartographic.height
  );
}
