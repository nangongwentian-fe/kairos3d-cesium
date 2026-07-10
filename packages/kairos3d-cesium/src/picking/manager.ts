import {
  Cartesian2,
  Cartesian3,
  type Cartographic,
  defined,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType
} from "cesium";
import type { KairosMap } from "../core";
import { Evented } from "../core";
import type { Overlay } from "../overlays";
import { getImageryFeature, getPickedEntity, getPrimitive, getTileFeature, normalizePickedObject } from "./normalize";
import type { PickOptions, PickResult, PickingClickOptions, PickingManagerEvents } from "./types";

type PickingEventHandler = Pick<ScreenSpaceEventHandler, "destroy" | "setInputAction">;
type PickingEventHandlerFactory = (canvas: HTMLCanvasElement) => PickingEventHandler;

export class PickingManager extends Evented<PickingManagerEvents> {
  private clickHandler?: PickingEventHandler;

  constructor(
    private readonly map: KairosMap,
    private readonly createHandler: PickingEventHandlerFactory = (canvas) =>
      new ScreenSpaceEventHandler(canvas)
  ) {
    super();
  }

  async pick(windowPosition: Cartesian2, options: PickOptions = {}): Promise<PickResult | undefined> {
    const results = await this.drillPick(windowPosition, { ...options, limit: options.limit ?? 1 });
    const result = results[0];
    this.emit("pick", {
      result,
      results,
      windowPosition: Cartesian2.clone(windowPosition)
    });
    return result;
  }

  async drillPick(windowPosition: Cartesian2, options: PickOptions = {}): Promise<PickResult[]> {
    const scene = this.map.viewer.scene;
    const rawPicks = scene.drillPick(
      windowPosition,
      options.limit,
      options.width,
      options.height
    );
    const position = this.pickPosition(windowPosition);
    const cartographic = position
      ? scene.globe?.ellipsoid.cartesianToCartographic(position)
      : undefined;
    const results: PickResult[] = [];

    for (const picked of rawPicks) {
      const overlay = this.findOverlayForPickedObject(picked);
      const layer = overlay ? undefined : this.findLayerForPickedObject(picked);
      const result = normalizePickedObject({
        picked,
        layer,
        overlay,
        position,
        cartographic,
        windowPosition
      });
      if (result) {
        results.push(result);
      }
    }

    if (options.includeImagery) {
      results.push(...(await this.pickImageryFeatures(windowPosition, position, cartographic)));
    }

    if (!results.some((result) => result.source === "overlay")) {
      const overlay = this.findOverlayByScreenDistance(windowPosition, options);
      if (overlay) {
        const overlayPosition = overlay.positions[0] ?? position;
        const result = normalizePickedObject({
          picked: overlay.entity,
          overlay,
          position: overlayPosition,
          cartographic: overlayPosition
            ? scene.globe?.ellipsoid.cartesianToCartographic(overlayPosition)
            : cartographic,
          windowPosition
        });
        if (result) {
          results.unshift(result);
        }
      }
    }

    return dedupeResults(results).slice(0, options.limit ?? results.length);
  }

  enableClick(options: PickingClickOptions = {}): void {
    this.disableClick();

    this.clickHandler = this.createHandler(this.map.viewer.scene.canvas);
    this.clickHandler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
      void this.handleClick(movement.position, options);
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  isClickEnabled(): boolean {
    return Boolean(this.clickHandler);
  }

  disableClick(): void {
    this.clickHandler?.destroy();
    this.clickHandler = undefined;
  }

  destroy(): void {
    this.disableClick();
    this.off();
  }

  private async handleClick(
    windowPosition: Cartesian2,
    options: PickingClickOptions
  ): Promise<void> {
    const result = await this.pick(windowPosition, options);
    if (options.select ?? true) {
      this.map.selection.select(result);
    }
  }

  private async pickImageryFeatures(
    windowPosition: Cartesian2,
    position?: Cartesian3,
    cartographic?: Cartographic
  ): Promise<PickResult[]> {
    const ray = this.map.viewer.camera.getPickRay(windowPosition);
    if (!ray) {
      return [];
    }

    const featurePromise = this.map.viewer.imageryLayers.pickImageryLayerFeatures(
      ray,
      this.map.viewer.scene
    );
    const features = featurePromise ? await featurePromise : [];

    return features
      .map((feature) =>
        normalizePickedObject({
          picked: feature,
          layer: this.findLayerForPickedObject(feature),
          position,
          cartographic,
          windowPosition
        })
      )
      .filter((result): result is PickResult => Boolean(result));
  }

  private pickPosition(windowPosition: Cartesian2): Cartesian3 | undefined {
    const scene = this.map.viewer.scene;
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

    const picked = this.map.viewer.camera.pickEllipsoid(windowPosition, ellipsoid);
    return defined(picked) ? picked : undefined;
  }

  private findLayerForPickedObject(picked: unknown) {
    const candidates = [
      getImageryFeature(picked),
      getTileFeature(picked),
      getPickedEntity(picked),
      getPrimitive(picked),
      picked
    ];

    for (const candidate of candidates) {
      if (candidate) {
        const layer = this.map.layers.findByRuntimeObject(candidate);
        if (layer) {
          return layer;
        }
      }
    }

    return undefined;
  }

  private findOverlayForPickedObject(picked: unknown) {
    const entity = getPickedEntity(picked);
    return entity ? this.map.overlays.findByEntity(entity) : undefined;
  }

  private findOverlayByScreenDistance(
    windowPosition: Cartesian2,
    options: PickOptions
  ): Overlay | undefined {
    const pickRadius = Math.max(options.width ?? 1, options.height ?? 1, 12) / 2;
    let nearest: { overlay: Overlay; distance: number } | undefined;

    for (const overlay of this.map.overlays.list()) {
      if (!overlay.show || overlay.positions.length === 0) {
        continue;
      }

      const screenPosition = SceneTransforms.worldToWindowCoordinates(
        this.map.viewer.scene,
        overlay.positions[0]
      );
      if (!screenPosition) {
        continue;
      }

      const radius = Math.max(pickRadius, overlayPickRadius(overlay));
      const distance = Cartesian2.distance(windowPosition, screenPosition);
      if (distance > radius) {
        continue;
      }
      if (!nearest || distance < nearest.distance) {
        nearest = { overlay, distance };
      }
    }

    return nearest?.overlay;
  }
}

function dedupeResults(results: PickResult[]): PickResult[] {
  const ids = new Set<string>();
  const next: PickResult[] = [];

  for (const result of results) {
    if (ids.has(result.id)) {
      continue;
    }
    ids.add(result.id);
    next.push(result);
  }

  return next;
}

function overlayPickRadius(overlay: Overlay): number {
  if (overlay.type === "point") {
    return (overlay.style?.point?.pixelSize ?? 8) / 2 + 6;
  }
  if (overlay.type === "billboard") {
    return Math.max(overlay.style?.billboard?.width ?? 24, overlay.style?.billboard?.height ?? 24) / 2 + 6;
  }
  if (overlay.type === "label") {
    return 24;
  }
  if (overlay.type === "model") {
    return overlay.data?.minimumPixelSize ?? 24;
  }
  return 12;
}
