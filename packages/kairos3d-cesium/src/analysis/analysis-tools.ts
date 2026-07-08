import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Entity,
  ScreenSpaceEventType
} from "cesium";
import type { KairosMap } from "../core";
import { lineStyleWithHeight } from "../height";
import type { ResultSymbolStyle } from "../style";
import { createLineGraphics, mergeSymbolStyles } from "../style";
import { InteractiveTool } from "../tools/interactive-tool";
import { registerTool } from "../tools/registry";
import type {
  ClippingPolygonDrawOptions,
  ContourDrawOptions,
  ProfileDrawOptions,
  VisibilityPickOptions
} from "./types";

export class VisibilityPickTool extends InteractiveTool<VisibilityPickOptions> {
  private startPosition?: Cartesian3;
  private previewPosition?: Cartesian3;
  private previewLine?: Entity;
  private options: VisibilityPickOptions = {};
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "analysis.visibility.pick");
  }

  override start(options: VisibilityPickOptions = {}): void {
    super.start(options);
    this.options = options;
    this.resetDraft();
    this.resolvedStyle = this.map.styles.resolveVisibilityStyle(
      mergeSymbolStyles(
        {
          visibleLine: { color: options.visibleColor },
          blockedLine: { color: options.blockedColor },
          point: { color: options.pointColor },
          blockedPoint: { color: options.blockedColor }
        },
        options.style
      )
    );

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      if (this.completed) {
        return;
      }

      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      if (!this.startPosition) {
        this.startPosition = Cartesian3.clone(position);
        this.notifyPointAdd([this.startPosition]);
        this.ensurePreviewLine();
        return;
      }

      if (Cartesian3.distance(this.startPosition, position) <= 0) {
        return;
      }

      void this.finish(Cartesian3.clone(position));
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (!this.startPosition || this.completed) {
        return;
      }

      const position = this.pickPosition(movement.endPosition);
      if (!position) {
        return;
      }

      this.previewPosition = Cartesian3.clone(position);
      this.ensurePreviewLine();
    }, ScreenSpaceEventType.MOUSE_MOVE);
  }

  override stop(): void {
    this.removePreviewLine();
    this.resetDraft();
    super.stop();
  }

  private async finish(end: Cartesian3): Promise<void> {
    if (!this.startPosition || this.completed) {
      return;
    }

    this.completed = true;
    const start = Cartesian3.clone(this.startPosition);
    this.removePreviewLine();
    const result = await this.map.analysis.visibility.compute({
      ...this.options,
      start,
      end
    });
    this.notifyComplete(result);
    this.map.tools.stop();
  }

  private ensurePreviewLine(): void {
    if (this.previewLine) {
      return;
    }

    this.previewLine = this.viewer.entities.add({
      polyline: createLineGraphics(
        new CallbackProperty(() => this.renderPreviewPositions(), false),
        lineStyleWithHeight(this.resolvedStyle?.visibleLine, this.options.height)
      )
    });
  }

  private renderPreviewPositions(): Cartesian3[] {
    if (!this.startPosition) {
      return [];
    }

    return this.previewPosition
      ? [this.startPosition, this.previewPosition]
      : [this.startPosition];
  }

  private removePreviewLine(): void {
    if (this.previewLine) {
      this.viewer.entities.remove(this.previewLine);
      this.previewLine = undefined;
    }
  }

  private resetDraft(): void {
    this.startPosition = undefined;
    this.previewPosition = undefined;
    this.previewLine = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }
}

export class ProfileDrawTool extends InteractiveTool<ProfileDrawOptions> {
  private positions: Cartesian3[] = [];
  private previewPosition?: Cartesian3;
  private previewLine?: Entity;
  private options: ProfileDrawOptions = {};
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "analysis.profile.draw");
  }

  override start(options: ProfileDrawOptions = {}): void {
    super.start(options);
    this.options = options;
    this.resetDraft();
    this.resolvedStyle = this.map.styles.resolveProfileStyle(
      mergeSymbolStyles(
        {
          line: { color: options.lineColor },
          point: { color: options.pointColor }
        },
        options.style
      )
    );

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      if (this.completed) {
        return;
      }

      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      this.positions.push(Cartesian3.clone(position));
      this.previewPosition = undefined;
      this.ensurePreviewLine();
      this.notifyPointAdd(clonePositions(this.positions));
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (this.positions.length === 0 || this.completed) {
        return;
      }

      const position = this.pickPosition(movement.endPosition);
      if (!position) {
        return;
      }

      this.previewPosition = Cartesian3.clone(position);
      this.ensurePreviewLine();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.handler?.setInputAction(() => {
      void this.finish();
    }, ScreenSpaceEventType.RIGHT_CLICK);
    this.handler?.setInputAction(() => {
      void this.finish();
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  override stop(): void {
    this.removePreviewLine();
    this.resetDraft();
    super.stop();
  }

  private async finish(): Promise<void> {
    if (this.positions.length < 2 || this.completed) {
      return;
    }

    this.completed = true;
    const positions = clonePositions(this.positions);
    this.removePreviewLine();
    const result = await this.map.analysis.profile.compute({
      ...this.options,
      positions
    });
    this.notifyComplete(result);
    this.map.tools.stop();
  }

  private ensurePreviewLine(): void {
    if (this.previewLine) {
      return;
    }

    this.previewLine = this.viewer.entities.add({
      polyline: createLineGraphics(
        new CallbackProperty(() => this.renderPreviewPositions(), false),
        lineStyleWithHeight(this.resolvedStyle?.line, this.options.height)
      )
    });
  }

  private renderPreviewPositions(): Cartesian3[] {
    return this.previewPosition
      ? [...this.positions, this.previewPosition]
      : this.positions;
  }

  private removePreviewLine(): void {
    if (this.previewLine) {
      this.viewer.entities.remove(this.previewLine);
      this.previewLine = undefined;
    }
  }

  private resetDraft(): void {
    this.positions = [];
    this.previewPosition = undefined;
    this.previewLine = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }
}

export class ClippingPolygonDrawTool extends InteractiveTool<ClippingPolygonDrawOptions> {
  private positions: Cartesian3[] = [];
  private previewPosition?: Cartesian3;
  private previewLine?: Entity;
  private options?: ClippingPolygonDrawOptions;
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "analysis.clipping.drawPolygon");
  }

  override start(options?: ClippingPolygonDrawOptions): void {
    super.start(options);
    this.resetDraft();
    this.options = options;
    this.resolvedStyle = this.map.styles.resolveClippingStyle(options?.style);

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      if (this.completed) {
        return;
      }

      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      this.positions.push(Cartesian3.clone(position));
      this.previewPosition = undefined;
      this.ensurePreviewLine();
      this.notifyPointAdd(clonePositions(this.positions));
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (this.positions.length === 0 || this.completed) {
        return;
      }

      const position = this.pickPosition(movement.endPosition);
      if (!position) {
        return;
      }

      this.previewPosition = Cartesian3.clone(position);
      this.ensurePreviewLine();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.handler?.setInputAction(() => {
      this.finish();
    }, ScreenSpaceEventType.RIGHT_CLICK);
    this.handler?.setInputAction(() => {
      this.finish();
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  override stop(): void {
    this.removePreviewLine();
    this.resetDraft();
    super.stop();
  }

  private finish(): void {
    if (!this.options || this.positions.length < 3 || this.completed) {
      return;
    }

    this.completed = true;
    const positions = clonePositions(this.positions);
    this.removePreviewLine();
    const result = this.map.analysis.clipping.addPolygon({
      ...this.options,
      positions
    });
    this.notifyComplete(result);
    this.map.tools.stop();
  }

  private ensurePreviewLine(): void {
    if (this.previewLine) {
      return;
    }

    this.previewLine = this.viewer.entities.add({
      polyline: createLineGraphics(
        new CallbackProperty(() => this.renderPreviewPositions(), false),
        this.resolvedStyle?.line
      )
    });
  }

  private renderPreviewPositions(): Cartesian3[] {
    const positions = this.previewPosition
      ? [...this.positions, this.previewPosition]
      : this.positions;

    if (positions.length < 2) {
      return positions;
    }

    return [...positions, positions[0]];
  }

  private removePreviewLine(): void {
    if (this.previewLine) {
      this.viewer.entities.remove(this.previewLine);
      this.previewLine = undefined;
    }
  }

  private resetDraft(): void {
    this.positions = [];
    this.previewPosition = undefined;
    this.previewLine = undefined;
    this.options = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }
}

export class TerrainContourDrawTool extends InteractiveTool<ContourDrawOptions> {
  private positions: Cartesian3[] = [];
  private previewPosition?: Cartesian3;
  private previewLine?: Entity;
  private options?: ContourDrawOptions;
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "analysis.terrain.drawContour");
  }

  override start(options?: ContourDrawOptions): void {
    super.start(options);
    this.resetDraft();
    this.options = options;
    this.resolvedStyle = this.map.styles.resolveTerrainStyle("contour", options?.style);

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      if (this.completed) {
        return;
      }

      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      this.positions.push(Cartesian3.clone(position));
      this.previewPosition = undefined;
      this.ensurePreviewLine();
      this.notifyPointAdd(clonePositions(this.positions));
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (this.positions.length === 0 || this.completed) {
        return;
      }

      const position = this.pickPosition(movement.endPosition);
      if (!position) {
        return;
      }

      this.previewPosition = Cartesian3.clone(position);
      this.ensurePreviewLine();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.handler?.setInputAction(() => {
      void this.finish();
    }, ScreenSpaceEventType.RIGHT_CLICK);
    this.handler?.setInputAction(() => {
      void this.finish();
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  override stop(): void {
    this.removePreviewLine();
    this.resetDraft();
    super.stop();
  }

  private async finish(): Promise<void> {
    if (!this.options || this.positions.length < 3 || this.completed) {
      return;
    }

    this.completed = true;
    const area = clonePositions(this.positions);
    this.removePreviewLine();
    const result = await this.map.analysis.terrain.contour({
      ...this.options,
      area
    });
    this.notifyComplete(result);
    this.map.tools.stop();
  }

  private ensurePreviewLine(): void {
    if (this.previewLine) {
      return;
    }

    this.previewLine = this.viewer.entities.add({
      polyline: createLineGraphics(
        new CallbackProperty(() => this.renderPreviewPositions(), false),
        this.resolvedStyle?.line
      )
    });
  }

  private renderPreviewPositions(): Cartesian3[] {
    const positions = this.previewPosition
      ? [...this.positions, this.previewPosition]
      : this.positions;

    if (positions.length < 2) {
      return positions;
    }

    return [...positions, positions[0]];
  }

  private removePreviewLine(): void {
    if (this.previewLine) {
      this.viewer.entities.remove(this.previewLine);
      this.previewLine = undefined;
    }
  }

  private resetDraft(): void {
    this.positions = [];
    this.previewPosition = undefined;
    this.previewLine = undefined;
    this.options = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }
}

export function registerDefaultAnalysisTools(): void {
  registerTool("analysis.visibility.pick", (map) => new VisibilityPickTool(map));
  registerTool("analysis.profile.draw", (map) => new ProfileDrawTool(map));
  registerTool("analysis.clipping.drawPolygon", (map) => new ClippingPolygonDrawTool(map));
  registerTool("analysis.terrain.drawContour", (map) => new TerrainContourDrawTool(map));
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}
