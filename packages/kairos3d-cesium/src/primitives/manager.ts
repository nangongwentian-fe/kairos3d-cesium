import {
  Cartesian3,
  Material,
  PolylineCollection
} from "cesium";
import type { KairosMap } from "../core";
import {
  deserializePositions,
  parseSnapshotDate,
  serializePositions
} from "../core/serialization";
import {
  parseColorLike,
  serializeColor
} from "../style";
import type {
  PrimitiveOverlay,
  PrimitiveOverlaySnapshot,
  PrimitivePolylineOptions,
  PrimitivePolylineOverlay,
  PrimitivePolylineSnapshot
} from "./types";

interface PreparedPrimitivePolylineSnapshot {
  options: Required<Pick<
    PrimitivePolylineOptions,
    "id" | "positions" | "color" | "width" | "show" | "loop"
  >> & Pick<PrimitivePolylineOptions, "metadata">;
  createdAt: Date;
}

export class PrimitiveOverlayManager {
  private readonly overlays = new Map<string, PrimitiveOverlay>();
  private polylineCollection?: PolylineCollection;

  constructor(private readonly map: KairosMap) {}

  addPolyline(options: PrimitivePolylineOptions): PrimitivePolylineOverlay {
    validatePositions(options.positions);
    const width = normalizePolylineWidth(options.width);
    const id = options.id ?? createPrimitiveOverlayId("polyline");
    if (this.overlays.has(id)) {
      throw new Error(`Primitive overlay "${id}" already exists.`);
    }

    const collection = this.getPolylineCollection();
    const color = serializeColor(options.color ?? "#00d4ff");
    const polyline = collection.add({
      positions: clonePositions(options.positions),
      material: Material.fromType("Color", {
        color: parseColorLike(color, "primitive.polyline.color")
      }),
      width,
      show: options.show ?? true,
      loop: options.loop ?? false,
      id
    });
    const overlay: PrimitivePolylineOverlay = {
      id,
      type: "polyline",
      positions: clonePositions(options.positions),
      color,
      width,
      show: options.show ?? true,
      loop: options.loop ?? false,
      polyline,
      collection,
      metadata: options.metadata,
      createdAt: new Date()
    };
    this.overlays.set(id, overlay);
    return overlay;
  }

  get(id: string): PrimitiveOverlay | undefined {
    return this.overlays.get(id);
  }

  list(): PrimitiveOverlay[] {
    return [...this.overlays.values()];
  }

  setShow(id: string, show: boolean): PrimitiveOverlay {
    const overlay = this.requireOverlay(id);
    overlay.show = show;
    if (overlay.type === "polyline") {
      overlay.polyline.show = show;
    }
    return overlay;
  }

  remove(id: string): boolean {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      return false;
    }

    if (overlay.type === "polyline") {
      overlay.collection.remove(overlay.polyline);
    }
    this.overlays.delete(id);
    this.destroyEmptyCollections();
    return true;
  }

  clear(): void {
    this.overlays.clear();
    this.polylineCollection?.removeAll();
    this.destroyEmptyCollections();
  }

  toJSON(): PrimitiveOverlaySnapshot[] {
    return this.list().map((overlay) => polylineToSnapshot(overlay));
  }

  load(
    snapshots: PrimitiveOverlaySnapshot[],
    options: { clear?: boolean } = {}
  ): PrimitiveOverlay[] {
    const prepared = preparePrimitiveSnapshots(snapshots);
    if (options.clear) {
      this.clear();
    }
    return prepared.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  destroy(): void {
    this.clear();
  }

  private restoreSnapshot(snapshot: PreparedPrimitivePolylineSnapshot): PrimitiveOverlay {
    if (this.overlays.has(snapshot.options.id)) {
      this.remove(snapshot.options.id);
    }

    const overlay = this.addPolyline(snapshot.options);
    overlay.createdAt = snapshot.createdAt;
    return overlay;
  }

  private requireOverlay(id: string): PrimitiveOverlay {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      throw new Error(`Primitive overlay "${id}" does not exist.`);
    }
    return overlay;
  }

  private getPolylineCollection(): PolylineCollection {
    if (!this.polylineCollection || this.polylineCollection.isDestroyed()) {
      this.polylineCollection = new PolylineCollection();
      this.map.viewer.scene.primitives.add(this.polylineCollection);
    }
    return this.polylineCollection;
  }

  private destroyEmptyCollections(): void {
    if (this.polylineCollection && this.polylineCollection.length === 0) {
      this.map.viewer.scene.primitives.remove(this.polylineCollection);
      if (!this.polylineCollection.isDestroyed()) {
        this.polylineCollection.destroy();
      }
      this.polylineCollection = undefined;
    }
  }
}

function polylineToSnapshot(overlay: PrimitivePolylineOverlay): PrimitivePolylineSnapshot {
  return {
    id: overlay.id,
    type: "polyline",
    positions: serializePositions(overlay.positions),
    color: overlay.color,
    width: overlay.width,
    show: overlay.show,
    loop: overlay.loop,
    metadata: overlay.metadata,
    createdAt: overlay.createdAt.toISOString()
  };
}

function validatePositions(positions: Cartesian3[]): void {
  if (positions.length < 2) {
    throw new Error("Primitive polyline overlay requires at least two positions.");
  }
}

function normalizePolylineWidth(width = 2): number {
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error("Primitive polyline width must be a positive finite number.");
  }

  return width;
}

function preparePrimitiveSnapshots(
  snapshots: PrimitiveOverlaySnapshot[]
): PreparedPrimitivePolylineSnapshot[] {
  const ids = new Set<string>();
  return snapshots.map((snapshot) => {
    if (ids.has(snapshot.id)) {
      throw new Error(`Primitive overlay snapshot id "${snapshot.id}" is duplicated.`);
    }
    ids.add(snapshot.id);

    const positions = deserializePositions(snapshot.positions);
    validatePositions(positions);
    const width = normalizePolylineWidth(snapshot.width);

    return {
      options: {
        id: snapshot.id,
        positions,
        color: snapshot.color,
        width,
        show: snapshot.show,
        loop: snapshot.loop,
        metadata: snapshot.metadata
      },
      createdAt: parseSnapshotDate(snapshot.createdAt, "Primitive overlay createdAt")
    };
  });
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function createPrimitiveOverlayId(type: PrimitiveOverlay["type"]): string {
  return `primitive-${type}-${Math.random().toString(36).slice(2, 10)}`;
}
