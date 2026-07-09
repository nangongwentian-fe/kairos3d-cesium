import { Cartesian3, Entity } from "cesium";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { StyleManager } from "../style";
import { OverlayManager } from "./manager";

beforeAll(() => {
  vi.stubGlobal("HTMLCanvasElement", class HTMLCanvasElementMock {});
  vi.stubGlobal("HTMLImageElement", class HTMLImageElementMock {});
  vi.stubGlobal("HTMLVideoElement", class HTMLVideoElementMock {});
  vi.stubGlobal("ImageBitmap", class ImageBitmapMock {});
  vi.stubGlobal("OffscreenCanvas", class OffscreenCanvasMock {});
});

function createMapMock() {
  return {
    viewer: {
      entities: {
        add: vi.fn((options) => new Entity(options)),
        remove: vi.fn()
      }
    },
    styles: new StyleManager()
  } as unknown as KairosMap;
}

function position(longitude: number, latitude: number, height = 0): Cartesian3 {
  return Cartesian3.fromDegrees(longitude, latitude, height);
}

describe("OverlayManager", () => {
  it("creates entity overlays for supported types", () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);

    const point = manager.addPoint({ id: "point", position: position(114, 22) });
    const polyline = manager.addPolyline({
      id: "line",
      positions: [position(114, 22), position(114.01, 22.01)]
    });
    const polygon = manager.addPolygon({
      id: "polygon",
      positions: [position(114, 22), position(114.01, 22), position(114.01, 22.01)]
    });
    const circle = manager.addCircle({
      id: "circle",
      center: position(114, 22),
      radius: 120
    });
    const rectangle = manager.addRectangle({
      id: "rectangle",
      positions: [position(114, 22), position(114.02, 22.02)]
    });
    const billboard = manager.addBillboard({
      id: "billboard",
      position: position(114, 22),
      image: "/marker.png",
      scale: 1.5
    });
    const label = manager.addLabel({
      id: "label",
      position: position(114, 22),
      text: "Kairos"
    });
    const model = manager.addModel({
      id: "model",
      position: position(114, 22),
      uri: "/model.glb",
      minimumPixelSize: 32,
      heading: 0.2,
      pitch: 0.1,
      roll: 0.05
    });

    expect(point.entity.point).toBeDefined();
    expect(polyline.entity.polyline).toBeDefined();
    expect(polygon.entity.polygon).toBeDefined();
    expect(circle.entity.ellipse?.semiMajorAxis?.getValue()).toBe(120);
    expect(rectangle.entity.rectangle).toBeDefined();
    expect(billboard.entity.billboard?.image?.getValue()).toBe("/marker.png");
    expect(billboard.data?.scale).toBe(1.5);
    expect(label.entity.label?.text?.getValue()).toBe("Kairos");
    expect(model.entity.model?.uri?.getValue()).toBe("/model.glb");
    expect(model.entity.orientation).toBeDefined();
    expect(model.data).toMatchObject({ heading: 0.2, pitch: 0.1, roll: 0.05 });
    expect(manager.list()).toHaveLength(8);
  });

  it("updates overlay data by recreating managed entity", () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    const overlay = manager.addCircle({
      id: "circle",
      center: position(114, 22),
      radius: 100
    });
    const firstEntity = overlay.entity;

    const updated = manager.update("circle", {
      center: position(114.01, 22.01),
      radius: 240,
      style: { polygon: { fillColor: "#35d07f" } }
    });

    expect(updated).toBe(overlay);
    expect(updated.entity).not.toBe(firstEntity);
    expect(updated.positions[0]).toEqual(position(114.01, 22.01));
    expect(updated.data?.radius).toBe(240);
    expect(updated.updatedAt).toBeInstanceOf(Date);
    expect(map.viewer.entities.remove).toHaveBeenCalledWith(firstEntity);
  });

  it("serializes and restores overlay snapshots", async () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    manager.addLabel({
      id: "label",
      position: position(114, 22, 10),
      text: "Snapshot",
      height: { mode: "clampToGround" },
      style: { label: { color: "#ffffff", outlineColor: "#000000" } },
      metadata: { source: "test" }
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: "label",
      type: "label",
      data: { text: "Snapshot" },
      height: { mode: "clampToGround" },
      show: true,
      metadata: { source: "test" }
    });
    expect(restored[0].id).toBe("label");
    expect(restored[0].data?.text).toBe("Snapshot");
    expect(restored[0].entity.label?.text?.getValue()).toBe("Snapshot");
    expect(manager.get("label")).toBe(restored[0]);
  });

  it("keeps model orientation data through snapshots", async () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    manager.addModel({
      id: "model",
      position: position(114, 22, 10),
      uri: "/model.glb",
      heading: 0.3,
      pitch: 0.2,
      roll: 0.1
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0].data).toMatchObject({
      uri: "/model.glb",
      heading: 0.3,
      pitch: 0.2,
      roll: 0.1
    });
    expect(restored[0].data).toMatchObject({ heading: 0.3, pitch: 0.2, roll: 0.1 });
    expect(restored[0].entity.orientation).toBeDefined();
  });

  it("rejects invalid snapshots before clearing existing overlays", async () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    const existing = manager.addPoint({
      id: "existing",
      position: position(114, 22)
    });

    await expect(
      manager.load(
        [
          {
            id: "bad-circle",
            type: "circle",
            positions: [{ longitude: 114, latitude: 22, height: 0 }],
            createdAt: "2026-07-08T00:00:00.000Z",
            show: true
          }
        ],
        { clear: true }
      )
    ).rejects.toThrow('Overlay "bad-circle" radius must be a positive finite number.');

    expect(manager.list()).toEqual([existing]);
    expect(manager.get("existing")).toBe(existing);
  });

  it("replaces duplicate ids and clears managed entities", () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    const first = manager.addPoint({ id: "same", position: position(114, 22) });
    const second = manager.addLabel({
      id: "same",
      position: position(114, 22),
      text: "Second"
    });

    expect(map.viewer.entities.remove).toHaveBeenCalledWith(first.entity);
    expect(manager.get("same")).toBe(second);

    manager.clear();
    manager.clear();

    expect(manager.list()).toEqual([]);
    expect(map.viewer.entities.remove).toHaveBeenCalledWith(second.entity);
  });
});
