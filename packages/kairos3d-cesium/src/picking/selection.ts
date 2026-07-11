import { Color, type Entity } from "cesium";
import {
  runWithRuntimeWriteLease,
  type RuntimeLeaseOwnerToken
} from "../concurrency/lease";
import type { KairosMap } from "../core";
import { Evented } from "../core";
import type { SelectionSymbolStyle } from "../style";
import { createPointGraphics, parseColorLike } from "../style";
import type { PickResult, SelectionManagerEvents, SelectionState } from "./types";

export class SelectionManager extends Evented<SelectionManagerEvents> {
  private current?: PickResult;
  private marker?: Entity;
  private tileFeatureRestore?: () => void;
  private style?: SelectionSymbolStyle;

  constructor(private readonly map: KairosMap) {
    super();
  }

  select(result?: PickResult): SelectionState {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "selection.select", resources: ["selection"] },
      () => this.selectInternal(result)
    );
  }

  private selectInternal(result?: PickResult): SelectionState {
    this.resetSelection();

    if (!result) {
      return this.emitChange();
    }

    this.current = result;
    const markerHighlighted = this.highlightPosition(result);
    const tileHighlighted = this.highlightTileFeature(result);

    return this.emitChange({
      result,
      highlighted: markerHighlighted || tileHighlighted
    });
  }

  clear(): SelectionState {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "selection.clear", resources: ["selection"] },
      () => this.clearInternal()
    );
  }

  /** @internal */
  clearWithRuntimeLease(ownerToken: RuntimeLeaseOwnerToken): SelectionState {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "selection.clear", resources: ["selection"], ownerToken },
      () => this.clearInternal()
    );
  }

  private clearInternal(): SelectionState {
    this.resetSelection();
    return this.emitChange();
  }

  setStyle(style: SelectionSymbolStyle): SelectionState {
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "selection.set-style", resources: ["selection"] },
      () => this.setStyleInternal(style)
    );
  }

  private setStyleInternal(style: SelectionSymbolStyle): SelectionState {
    this.style = style;
    const current = this.current;
    if (!current) {
      return this.emitChange();
    }

    this.clearHighlight();
    this.current = current;
    const markerHighlighted = this.highlightPosition(current);
    const tileHighlighted = this.highlightTileFeature(current);
    return this.emitChange({
      result: current,
      highlighted: markerHighlighted || tileHighlighted
    });
  }

  private clearHighlight(): void {
    if (this.marker) {
      this.map.viewer.entities.remove(this.marker);
      this.marker = undefined;
    }

    this.tileFeatureRestore?.();
    this.tileFeatureRestore = undefined;
  }

  get(): SelectionState {
    return {
      result: this.current,
      highlighted: Boolean(this.current && (this.marker || this.tileFeatureRestore))
    };
  }

  destroy(): void {
    this.clearInternal();
    this.off();
  }

  private resetSelection(): void {
    this.clearHighlight();
    this.current = undefined;
  }

  private emitChange(state: SelectionState = this.get()): SelectionState {
    this.emit("change", state);
    return state;
  }

  private highlightPosition(result: PickResult): boolean {
    if (!result.entity || !result.position) {
      return false;
    }

    const style = this.map.styles.resolveSelectionStyle(this.style);
    this.marker = this.map.viewer.entities.add({
      id: `kairos-selection-${result.id}`,
      name: "Kairos selection",
      position: result.position,
      point: createPointGraphics(style.entity?.point)
    });
    return true;
  }

  private highlightTileFeature(result: PickResult): boolean {
    if (result.type !== "3dtiles" || !result.feature || !("color" in result.feature)) {
      return false;
    }

    const feature = result.feature;
    const style = this.map.styles.resolveSelectionStyle(this.style);
    const originalColor = Color.clone(feature.color);
    feature.color = style.tilesFeature?.color
      ? parseColorLike(style.tilesFeature.color, "selection.tilesFeature.color")
      : Color.YELLOW.withAlpha(0.75);
    this.tileFeatureRestore = () => {
      feature.color = originalColor;
    };
    return true;
  }
}
