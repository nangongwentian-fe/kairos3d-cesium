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
    const ellipse = manager.addEllipse({
      id: "ellipse",
      center: position(114, 22),
      semiMajorAxis: 200,
      semiMinorAxis: 120
    });
    const wall = manager.addWall({
      id: "wall",
      positions: [position(114, 22), position(114.01, 22.01)],
      maximumHeights: [80, 90]
    });
    const corridor = manager.addCorridor({
      id: "corridor",
      positions: [position(114, 22), position(114.01, 22.01)],
      width: 30
    });
    const box = manager.addBox({
      id: "box",
      position: position(114, 22),
      dimensions: [10, 20, 30]
    });
    const cylinder = manager.addCylinder({
      id: "cylinder",
      position: position(114, 22),
      length: 40,
      topRadius: 8,
      bottomRadius: 12
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
    expect(ellipse.entity.ellipse?.semiMajorAxis?.getValue()).toBe(200);
    expect(ellipse.entity.ellipse?.semiMinorAxis?.getValue()).toBe(120);
    expect(wall.entity.wall).toBeDefined();
    expect(corridor.entity.corridor?.width?.getValue()).toBe(30);
    expect(box.entity.box?.dimensions?.getValue()).toEqual(new Cartesian3(10, 20, 30));
    expect(cylinder.entity.cylinder?.length?.getValue()).toBe(40);
    expect(manager.list()).toHaveLength(13);
  });

  it("manages overlay state, filtered lists, and groups", () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    const first = manager.addPoint({
      id: "first",
      position: position(114, 22),
      group: "draft",
      properties: { name: "first" },
      metadata: { source: "unit" }
    });
    const second = manager.addPoint({
      id: "second",
      position: position(114.01, 22.01),
      group: "draft"
    });

    manager.setShow("first", false);
    manager.setLocked("first", true);
    manager.setEditable("first", false);
    manager.setGroup("second", "published");

    expect(first.entity.show).toBe(false);
    expect(manager.list({ visible: false })).toEqual([first]);
    expect(manager.list({ locked: true, editable: false })).toEqual([first]);
    expect(manager.list({ group: "published" })).toEqual([second]);
    expect(manager.toJSON()[0]).toMatchObject({
      id: "first",
      group: "draft",
      properties: { name: "first" },
      metadata: { source: "unit" },
      show: false,
      locked: true,
      editable: false
    });

    expect(manager.removeGroup("draft")).toBe(1);
    expect(manager.get("first")).toBeUndefined();
    expect(manager.get("second")).toBe(second);
  });

  it("manages overlay properties and metadata through cloned records", () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    const listener = vi.fn();
    const overlay = manager.addPoint({
      id: "first",
      position: position(114, 22),
      properties: { name: "first" },
      metadata: { source: "unit" }
    });
    manager.on("update", listener);

    const properties = manager.getProperties("first");
    properties!.name = "mutated";
    expect(manager.getProperties("first")).toEqual({ name: "first" });

    manager.mergeProperties("first", { status: "ready" });
    manager.setMetadata("first", { source: "api" });
    const metadata = manager.getMetadata("first");
    metadata!.source = "mutated";
    manager.mergeMetadata("first", { reviewer: "kairos" });

    expect(overlay.properties).toEqual({ name: "first", status: "ready" });
    expect(manager.getMetadata("first")).toEqual({
      source: "api",
      reviewer: "kairos"
    });
    expect(overlay.updatedAt).toBeInstanceOf(Date);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ data: overlay }));
  });

  it("applies overlay styles by ids and query filters", () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    manager.addCircle({
      id: "overlay-a",
      center: position(114, 22),
      radius: 100,
      group: "draft"
    });
    manager.addCircle({
      id: "overlay-b",
      center: position(114.01, 22.01),
      radius: 120,
      group: "draft",
      locked: true
    });
    manager.addLabel({
      id: "overlay-c",
      position: position(114.02, 22.02),
      text: "Done",
      group: "done"
    });

    const styledById = manager.setStyleMany(["overlay-a", "overlay-c"], {
      line: { color: "#35d07f", width: 4 },
      label: { color: "#ffffff" }
    });
    const styledByQuery = manager.setStyleWhere({ group: "draft", locked: true }, {
      line: { color: "#ff3b30", width: 6 }
    });

    expect(styledById.map((overlay) => overlay.id)).toEqual(["overlay-a", "overlay-c"]);
    expect(styledByQuery.map((overlay) => overlay.id)).toEqual(["overlay-b"]);
    expect(manager.get("overlay-a")?.style?.line?.width).toBe(4);
    expect(manager.get("overlay-b")?.style?.line?.width).toBe(6);
    expect(manager.get("overlay-c")?.style?.label?.color).toBeDefined();
  });

  it("validates all overlay ids before applying batch styles", () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    const overlay = manager.addCircle({
      id: "overlay-a",
      center: position(114, 22),
      radius: 100
    });

    expect(() =>
      manager.setStyleMany(["overlay-a", "missing"], {
        line: { color: "#35d07f", width: 4 }
      })
    ).toThrow('Overlay "missing" does not exist.');
    expect(overlay.style?.line?.width).not.toBe(4);
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

  it("roundtrips overlays through Kairos JSON and GeoJSON", async () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    manager.addPolygon({
      id: "polygon",
      positions: [position(114, 22), position(114.01, 22), position(114.01, 22.01)],
      group: "geo",
      properties: { label: "polygon" }
    });

    const kairos = manager.toKairosJSON();
    const geojson = manager.toGeoJSON();
    manager.clear();
    const restoredFromGeoJson = await manager.loadGeoJSON(geojson);

    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features[0].geometry.type).toBe("Polygon");
    expect(geojson.features[0].properties.kairos).toMatchObject({
      version: 1,
      type: "polygon"
    });
    expect(restoredFromGeoJson[0]).toMatchObject({
      id: "polygon",
      type: "polygon",
      group: "geo",
      properties: { label: "polygon" }
    });

    manager.clear();
    const restoredFromKairos = await manager.loadKairosJSON(kairos);
    expect(restoredFromKairos[0].id).toBe("polygon");
    expect(restoredFromKairos[0].entity.polygon).toBeDefined();
  });

  it("exports plain overlay GeoJSON without full Kairos snapshots", async () => {
    const map = createMapMock();
    const manager = new OverlayManager(map);
    manager.addModel({
      id: "model",
      position: position(114, 22),
      uri: "/model.glb",
      properties: { name: "business-model", kairos: "business-value" }
    });

    const geojson = manager.toGeoJSON({ includeSnapshot: false });
    manager.clear();
    const restored = await manager.loadGeoJSON(geojson);

    expect(geojson.features[0].geometry.type).toBe("Point");
    expect(geojson.features[0].properties).toEqual({
      name: "business-model",
      kairos: "business-value"
    });
    expect(restored[0]).toMatchObject({
      id: "model",
      type: "point",
      properties: { name: "business-model" }
    });
    expect(restored[0].properties).not.toHaveProperty("kairos");
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
