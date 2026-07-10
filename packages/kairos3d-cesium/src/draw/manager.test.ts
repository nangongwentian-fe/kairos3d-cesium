import { Cartesian3, Entity } from "cesium";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { StyleManager } from "../style";
import { DrawManager } from "./manager";
import type { DrawResult } from "./types";

beforeAll(() => {
  vi.stubGlobal("HTMLCanvasElement", class HTMLCanvasElementMock {});
  vi.stubGlobal("HTMLImageElement", class HTMLImageElementMock {});
  vi.stubGlobal("HTMLVideoElement", class HTMLVideoElementMock {});
  vi.stubGlobal("ImageBitmap", class ImageBitmapMock {});
  vi.stubGlobal("OffscreenCanvas", class OffscreenCanvasMock {});
});

function createMapMock() {
  const active = { id: "draw.edit" };
  return {
    viewer: {
      scene: {
        primitives: {
          destroyPrimitives: true,
          add: vi.fn((primitive) => primitive),
          remove: vi.fn(() => true)
        }
      },
      entities: {
        add: vi.fn((options) => new Entity(options)),
        remove: vi.fn()
      }
    },
    tools: {
      active,
      start: vi.fn(async () => active),
      stop: vi.fn(),
      cancel: vi.fn(),
      emitClear: vi.fn(),
      on: vi.fn(() => vi.fn())
    },
    styles: new StyleManager()
  } as unknown as KairosMap;
}

function createResult(id: string): DrawResult {
  const positions = [
    Cartesian3.fromDegrees(114, 22, 10),
    Cartesian3.fromDegrees(114.01, 22.01, 20)
  ];
  return {
    id,
    type: "polyline",
    entity: new Entity({
      id: `${id}-entity`,
      polyline: {
        positions
      }
    }),
    positions,
    show: true,
    locked: false,
    editable: true,
    createdAt: new Date()
  };
}

describe("DrawManager", () => {
  it("emits update for every public result mutation", () => {
    const manager = new DrawManager(createMapMock());
    const result = manager.addResult(createResult("draw-events"));
    const listener = vi.fn();
    manager.on("update", listener);

    manager.setProperties(result.id, { owner: "ops" });
    manager.setMetadata(result.id, { source: "test" });
    manager.setStyle(result.id, { line: { color: "#35d07f", width: 3 } });
    manager.setShow(result.id, false);
    manager.setLocked(result.id, true);
    manager.setEditable(result.id, false);
    manager.setGroup(result.id, "reviewed");
    manager.update(result.id, result.positions);

    expect(listener).toHaveBeenCalledTimes(8);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: result.id }) })
    );
  });

  it("creates programmatic draw results for overlay-like types", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);

    const circle = manager.circle({
      id: "draw-circle",
      center: Cartesian3.fromDegrees(114, 22),
      radius: 80
    });
    const rectangle = manager.rectangle({
      id: "draw-rectangle",
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.02, 22.02)
      ]
    });
    const billboard = manager.billboard({
      id: "draw-billboard",
      position: Cartesian3.fromDegrees(114, 22),
      image: "/marker.png",
      scale: 2
    });
    const label = manager.label({
      id: "draw-label",
      position: Cartesian3.fromDegrees(114, 22),
      text: "Kairos"
    });
    const model = manager.model({
      id: "draw-model",
      position: Cartesian3.fromDegrees(114, 22),
      uri: "/model.glb",
      minimumPixelSize: 24,
      heading: 0.3,
      pitch: 0.2,
      roll: 0.1
    });
    const ellipse = manager.ellipse({
      id: "draw-ellipse",
      center: Cartesian3.fromDegrees(114, 22),
      semiMajorAxis: 200,
      semiMinorAxis: 120
    });
    const wall = manager.wall({
      id: "draw-wall",
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.01, 22.01)
      ],
      maximumHeights: [80, 90]
    });
    const corridor = manager.corridor({
      id: "draw-corridor",
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.01, 22.01)
      ],
      width: 30
    });
    const box = manager.box({
      id: "draw-box",
      position: Cartesian3.fromDegrees(114, 22),
      dimensions: [10, 20, 30]
    });
    const cylinder = manager.cylinder({
      id: "draw-cylinder",
      position: Cartesian3.fromDegrees(114, 22),
      length: 40,
      topRadius: 8,
      bottomRadius: 12
    });
    const plot = manager.plot({
      id: "draw-plot",
      type: "fine-arrow",
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.02, 22.02)
      ],
      plot: { steps: 16 }
    });

    expect(circle.entity.ellipse?.semiMajorAxis?.getValue()).toBe(80);
    expect(rectangle.entity.rectangle).toBeDefined();
    expect(billboard.entity.billboard?.image?.getValue()).toBe("/marker.png");
    expect(billboard.data?.scale).toBe(2);
    expect(label.entity.label?.text?.getValue()).toBe("Kairos");
    expect(model.entity.model?.uri?.getValue()).toBe("/model.glb");
    expect(model.entity.orientation).toBeDefined();
    expect(model.data).toMatchObject({ heading: 0.3, pitch: 0.2, roll: 0.1 });
    expect(ellipse.entity.ellipse?.semiMajorAxis?.getValue()).toBe(200);
    expect(wall.entity.wall).toBeDefined();
    expect(corridor.entity.corridor?.width?.getValue()).toBe(30);
    expect(box.entity.box?.dimensions?.getValue()).toEqual(new Cartesian3(10, 20, 30));
    expect(cylinder.entity.cylinder?.length?.getValue()).toBe(40);
    expect(plot.entity.polygon).toBeDefined();
    expect(plot.data?.plot).toEqual({ steps: 16 });
    expect(manager.list()).toEqual([
      circle,
      rectangle,
      billboard,
      label,
      model,
      ellipse,
      wall,
      corridor,
      box,
      cylinder,
      plot
    ]);
  });

  it("manages draw result state, filtered lists, and groups", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const first = manager.circle({
      id: "draw-first",
      center: Cartesian3.fromDegrees(114, 22),
      radius: 100,
      group: "draft",
      properties: { name: "first" },
      metadata: { source: "unit" }
    });
    const second = manager.label({
      id: "draw-second",
      position: Cartesian3.fromDegrees(114.01, 22.01),
      text: "Second",
      group: "draft"
    });

    manager.setShow("draw-first", false);
    manager.setLocked("draw-first", true);
    manager.setEditable("draw-first", false);
    manager.setGroup("draw-second", "published");

    expect(first.entity.show).toBe(false);
    expect(manager.list({ visible: false })).toEqual([first]);
    expect(manager.list({ locked: true, editable: false })).toEqual([first]);
    expect(manager.list({ group: "published" })).toEqual([second]);
    expect(manager.toJSON()[0]).toMatchObject({
      id: "draw-first",
      group: "draft",
      properties: { name: "first" },
      metadata: { source: "unit" },
      show: false,
      locked: true,
      editable: false
    });

    expect(manager.clearGroup("draft")).toBe(1);
    expect(manager.get("draw-first")).toBeUndefined();
    expect(manager.get("draw-second")).toBe(second);
  });

  it("manages draw result properties and metadata through cloned records", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const listener = vi.fn();
    manager.circle({
      id: "draw-first",
      center: Cartesian3.fromDegrees(114, 22),
      radius: 100,
      properties: { name: "first" },
      metadata: { source: "unit" }
    });
    manager.on("edit-change", listener);

    const properties = manager.getProperties("draw-first");
    properties!.name = "mutated";
    expect(manager.getProperties("draw-first")).toEqual({ name: "first" });

    const updated = manager.mergeProperties("draw-first", { status: "ready" });
    manager.setMetadata("draw-first", { source: "api" });
    const metadata = manager.getMetadata("draw-first");
    metadata!.source = "mutated";
    manager.mergeMetadata("draw-first", { reviewer: "kairos" });

    expect(updated.properties).toEqual({ name: "first", status: "ready" });
    expect(manager.getMetadata("draw-first")).toEqual({
      source: "api",
      reviewer: "kairos"
    });
    expect(updated.updatedAt).toBeInstanceOf(Date);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "programmatic",
          result: updated
        })
      })
    );
  });

  it("applies draw styles by ids and query filters", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    manager.circle({
      id: "draw-a",
      center: Cartesian3.fromDegrees(114, 22),
      radius: 100,
      group: "draft"
    });
    manager.circle({
      id: "draw-b",
      center: Cartesian3.fromDegrees(114.01, 22.01),
      radius: 120,
      group: "draft",
      locked: true
    });
    manager.label({
      id: "draw-c",
      position: Cartesian3.fromDegrees(114.02, 22.02),
      text: "Done",
      group: "done"
    });

    const styledById = manager.setStyleMany(["draw-a", "draw-c"], {
      line: { color: "#35d07f", width: 4 },
      label: { color: "#ffffff" }
    });
    const styledByQuery = manager.setStyleWhere({ group: "draft", locked: true }, {
      line: { color: "#ff3b30", width: 6 }
    });

    expect(styledById.map((result) => result.id)).toEqual(["draw-a", "draw-c"]);
    expect(styledByQuery.map((result) => result.id)).toEqual(["draw-b"]);
    expect(manager.get("draw-a")?.style?.line?.width).toBe(4);
    expect(manager.get("draw-b")?.style?.line?.width).toBe(6);
    expect(manager.get("draw-c")?.style?.label?.color).toBeDefined();
  });

  it("validates all draw ids before applying batch styles", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const result = manager.circle({
      id: "draw-a",
      center: Cartesian3.fromDegrees(114, 22),
      radius: 100
    });

    expect(() =>
      manager.setStyleMany(["draw-a", "missing"], {
        line: { color: "#35d07f", width: 4 }
      })
    ).toThrow('Draw result "missing" does not exist.');
    expect(result.style?.line?.width).not.toBe(4);
  });

  it("keeps completed results when tools stop elsewhere", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const result = createResult("draw-1");

    manager.addResult(result);

    expect(manager.get("draw-1")).toBe(result);
    expect(manager.list()).toEqual([result]);
  });

  it("updates result positions and entity geometry", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const result = createResult("draw-1");
    const nextPositions = [new Cartesian3(7, 8, 9), new Cartesian3(10, 11, 12)];
    const listener = vi.fn();

    manager.addResult(result);
    manager.on("edit-change", listener);
    const updated = manager.update("draw-1", nextPositions);

    expect(updated).toBe(result);
    expect(updated.positions).not.toBe(nextPositions);
    expect(updated.positions[0]).toEqual(nextPositions[0]);
    expect(updated.updatedAt).toBeInstanceOf(Date);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "programmatic",
          result
        })
      })
    );
  });

  it("updates programmatic draw result data", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const result = manager.label({
      id: "draw-label",
      position: Cartesian3.fromDegrees(114, 22),
      text: "Before"
    });
    const firstEntity = result.entity;

    const updated = manager.update("draw-label", {
      position: Cartesian3.fromDegrees(114.01, 22.01),
      text: "After",
      style: { label: { color: "#ffffff" } }
    });

    expect(updated).toBe(result);
    expect(updated.entity).not.toBe(firstEntity);
    expect(updated.data?.text).toBe("After");
    expect(updated.entity.label?.text?.getValue()).toBe("After");
    expect(map.viewer.entities.remove).toHaveBeenCalledWith(firstEntity);
  });

  it("updates circle radius and rectangle positions for edit workflows", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const circle = manager.circle({
      id: "draw-circle",
      center: Cartesian3.fromDegrees(114, 22),
      radius: 100
    });
    const rectangle = manager.rectangle({
      id: "draw-rectangle",
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.01, 22.01)
      ]
    });

    const updatedCircle = manager.update("draw-circle", { radius: 250 });
    const updatedRectangle = manager.update("draw-rectangle", {
      positions: [
        Cartesian3.fromDegrees(114.02, 22.02),
        Cartesian3.fromDegrees(114.03, 22.03)
      ]
    });

    expect(updatedCircle).toBe(circle);
    expect(updatedCircle.data?.radius).toBe(250);
    expect(updatedCircle.entity.ellipse?.semiMajorAxis?.getValue()).toBe(250);
    expect(updatedRectangle).toBe(rectangle);
    expect(updatedRectangle.positions[0]).toEqual(Cartesian3.fromDegrees(114.02, 22.02));
    expect(updatedRectangle.entity.rectangle).toBeDefined();
  });

  it("updates extended draw geometry data for edit workflows", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const ellipse = manager.ellipse({
      id: "draw-ellipse",
      center: Cartesian3.fromDegrees(114, 22),
      semiMajorAxis: 100,
      semiMinorAxis: 50
    });
    const corridor = manager.corridor({
      id: "draw-corridor",
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.01, 22.01)
      ],
      width: 20
    });
    const box = manager.box({
      id: "draw-box",
      position: Cartesian3.fromDegrees(114, 22),
      dimensions: [10, 20, 30]
    });
    const cylinder = manager.cylinder({
      id: "draw-cylinder",
      position: Cartesian3.fromDegrees(114, 22),
      length: 40,
      topRadius: 8,
      bottomRadius: 12
    });

    manager.update("draw-ellipse", { semiMajorAxis: 180, semiMinorAxis: 90 });
    manager.update("draw-corridor", { width: 35 });
    manager.update("draw-box", {
      position: Cartesian3.fromDegrees(114.02, 22.02),
      dimensions: [20, 30, 40]
    });
    manager.update("draw-cylinder", { length: 80, topRadius: 16, bottomRadius: 20 });

    expect(ellipse.data).toMatchObject({ semiMajorAxis: 180, semiMinorAxis: 90 });
    expect(ellipse.entity.ellipse?.semiMajorAxis?.getValue()).toBe(180);
    expect(corridor.data?.width).toBe(35);
    expect(corridor.entity.corridor?.width?.getValue()).toBe(35);
    expect(box.positions[0]).toEqual(Cartesian3.fromDegrees(114.02, 22.02));
    expect(box.entity.box?.dimensions?.getValue()).toEqual(new Cartesian3(20, 30, 40));
    expect(cylinder.data).toMatchObject({ length: 80, topRadius: 16, bottomRadius: 20 });
    expect(cylinder.entity.cylinder?.length?.getValue()).toBe(80);
  });

  it("updates plot draw control points and algorithm data", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const plot = manager.plot({
      id: "draw-plot",
      type: "attack-arrow",
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.01, 22.01),
        Cartesian3.fromDegrees(114.03, 22.015)
      ],
      plot: { steps: 12 }
    });
    const firstEntity = plot.entity;

    const updated = manager.update("draw-plot", {
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.02, 22.015),
        Cartesian3.fromDegrees(114.04, 22.01)
      ],
      plot: { steps: 20 },
      style: { polygon: { fillColor: "#35d07f" } }
    });

    expect(updated).toBe(plot);
    expect(updated.entity).not.toBe(firstEntity);
    expect(updated.positions[1]).toEqual(Cartesian3.fromDegrees(114.02, 22.015));
    expect(updated.data?.plot).toEqual({ steps: 20 });
    expect(updated.entity.polygon).toBeDefined();
    expect(map.viewer.entities.remove).toHaveBeenCalledWith(firstEntity);
  });

  it("starts and stops edit through the shared tool manager", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    manager.addResult(createResult("draw-1"));

    await manager.edit("draw-1", { allowDelete: false });
    manager.stopEdit();
    manager.cancelEdit();

    expect(map.tools.start).toHaveBeenCalledWith("draw.edit", {
      resultId: "draw-1",
      allowDelete: false
    });
    expect(map.tools.stop).toHaveBeenCalledOnce();
    expect(map.tools.cancel).toHaveBeenCalledOnce();
  });

  it("rejects editing locked or non-editable draw results", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const locked = createResult("draw-locked");
    const readonly = createResult("draw-readonly");
    locked.locked = true;
    readonly.editable = false;
    manager.addResult(locked);
    manager.addResult(readonly);

    await expect(manager.edit("draw-locked")).rejects.toThrow(
      'Draw result "draw-locked" is locked and cannot be edited.'
    );
    await expect(manager.edit("draw-readonly")).rejects.toThrow(
      'Draw result "draw-readonly" is not editable.'
    );
    expect(map.tools.start).not.toHaveBeenCalled();
  });

  it("serializes and restores draw results", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const result = createResult("draw-1");
    result.updatedAt = new Date("2026-01-01T00:00:00.000Z");
    result.height = { mode: "clampToGround" };
    manager.addResult(result);

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: "draw-1",
      type: "polyline",
      createdAt: result.createdAt.toISOString(),
      updatedAt: "2026-01-01T00:00:00.000Z",
      height: { mode: "clampToGround" }
    });
    expect(restored[0].id).toBe("draw-1");
    expect(restored[0].height).toEqual({ mode: "clampToGround" });
    expect(restored[0].entity.polyline?.clampToGround?.getValue()).toBe(true);
    expect(restored[0].updatedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(map.viewer.entities.add).toHaveBeenCalled();
    expect(manager.get("draw-1")).toBe(restored[0]);
  });

  it("serializes and restores new draw result data", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    manager.model({
      id: "draw-model",
      position: Cartesian3.fromDegrees(114, 22, 10),
      uri: "/model.glb",
      scale: 1.5,
      heading: 0.4,
      pitch: 0.2,
      roll: 0.1,
      style: { model: { minimumPixelSize: 32 } },
      height: { mode: "relativeToGround", offset: 10 }
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: "draw-model",
      type: "model",
      data: {
        uri: "/model.glb",
        scale: 1.5,
        heading: 0.4,
        pitch: 0.2,
        roll: 0.1
      },
      height: { mode: "relativeToGround", offset: 10 }
    });
    expect(restored[0].data?.uri).toBe("/model.glb");
    expect(restored[0].data).toMatchObject({ heading: 0.4, pitch: 0.2, roll: 0.1 });
    expect(restored[0].entity.model?.uri?.getValue()).toBe("/model.glb");
    expect(restored[0].entity.orientation).toBeDefined();
  });

  it("serializes and restores plot draw result data", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    manager.plot({
      id: "draw-plot",
      type: "double-arrow",
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.01, 22.012),
        Cartesian3.fromDegrees(114.025, 22.002)
      ],
      plot: { steps: 18 },
      group: "plot",
      properties: { label: "double-arrow" },
      style: { polygon: { fillColor: "#35d07f" } }
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: "draw-plot",
      type: "double-arrow",
      data: { plot: { steps: 18 } },
      group: "plot",
      properties: { label: "double-arrow" }
    });
    expect(restored[0]).toMatchObject({
      id: "draw-plot",
      type: "double-arrow",
      group: "plot",
      properties: { label: "double-arrow" }
    });
    expect(restored[0].entity.polygon).toBeDefined();
  });

  it("roundtrips draw results through Kairos JSON and GeoJSON", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const polygon = manager.addResult({
      id: "draw-polygon",
      type: "polygon",
      entity: new Entity({ id: "draw-polygon" }),
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.01, 22),
        Cartesian3.fromDegrees(114.01, 22.01)
      ],
      group: "geo",
      properties: { label: "polygon" },
      show: true,
      locked: false,
      editable: true,
      createdAt: new Date()
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
      id: polygon.id,
      type: "polygon",
      group: "geo",
      properties: { label: "polygon" }
    });

    manager.clear();
    const restoredFromKairos = await manager.loadKairosJSON(kairos);
    expect(restoredFromKairos[0].id).toBe("draw-polygon");
    expect(restoredFromKairos[0].entity.polygon).toBeDefined();
  });

  it("exports plain GeoJSON without full Kairos snapshots", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    manager.model({
      id: "draw-model",
      position: Cartesian3.fromDegrees(114, 22),
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
      id: "draw-model",
      type: "point",
      properties: { name: "business-model" }
    });
    expect(restored[0].properties).not.toHaveProperty("kairos");
  });

  it("exports visible plot draw geometry to GeoJSON and restores plot semantics from snapshots", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    manager.plot({
      id: "draw-plot",
      type: "curve",
      positions: [
        Cartesian3.fromDegrees(114, 22),
        Cartesian3.fromDegrees(114.01, 22.012),
        Cartesian3.fromDegrees(114.03, 22.01)
      ],
      plot: { steps: 12 },
      properties: { label: "curve" }
    });

    const geojson = manager.toGeoJSON();
    const plain = manager.toGeoJSON({ includeSnapshot: false });
    manager.clear();
    const restoredFromSnapshot = await manager.loadGeoJSON(geojson);
    manager.clear();
    const restoredPlain = await manager.loadGeoJSON(plain);

    expect(geojson.features[0].geometry.type).toBe("LineString");
    expect(geojson.features[0].properties.kairos).toMatchObject({
      version: 1,
      type: "curve"
    });
    expect(restoredFromSnapshot[0].type).toBe("curve");
    expect(restoredFromSnapshot[0].data?.plot).toEqual({ steps: 12 });
    expect(restoredPlain[0].type).toBe("polyline");
    expect(restoredPlain[0].properties).toEqual({ label: "curve" });
  });

  it("validates draw snapshots before clearing existing results", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const existing = createResult("draw-existing");
    manager.addResult(existing);

    await expect(
      manager.load(
        [
          {
            id: "draw-bad",
            type: "polyline",
            positions: [{ longitude: 114, latitude: 22, height: 10 }],
            createdAt: "2026-07-08T00:00:00.000Z"
          }
        ],
        { clear: true }
      )
    ).rejects.toThrow('Draw result "draw-bad" requires at least 2 positions.');

    expect(manager.list()).toEqual([existing]);
    expect(map.viewer.entities.remove).not.toHaveBeenCalled();
  });

  it("rejects invalid new draw snapshots before clearing existing results", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const existing = createResult("draw-existing");
    manager.addResult(existing);

    await expect(
      manager.load(
        [
          {
            id: "draw-bad-circle",
            type: "circle",
            positions: [{ longitude: 114, latitude: 22, height: 10 }],
            createdAt: "2026-07-08T00:00:00.000Z"
          }
        ],
        { clear: true }
      )
    ).rejects.toThrow(
      'Overlay "draw-bad-circle" radius must be a positive finite number.'
    );

    expect(manager.list()).toEqual([existing]);
    expect(map.viewer.entities.remove).not.toHaveBeenCalled();
  });

  it("rejects duplicate draw snapshot ids before restoring", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const snapshot = {
      id: "draw-duplicate",
      type: "polyline" as const,
      positions: [
        { longitude: 114, latitude: 22, height: 10 },
        { longitude: 114.01, latitude: 22.01, height: 20 }
      ],
      createdAt: "2026-07-08T00:00:00.000Z"
    };

    await expect(manager.load([snapshot, snapshot])).rejects.toThrow(
      'Draw result snapshot id "draw-duplicate" is duplicated.'
    );
    expect(manager.list()).toEqual([]);
  });

  it("restores primitive draw results and cleans up primitive runtime", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);

    const restored = await manager.load([
      {
        id: "draw-primitive",
        type: "polyline",
        positions: [
          { longitude: 114, latitude: 22, height: 10 },
          { longitude: 114.01, latitude: 22.01, height: 20 }
        ],
        createdAt: "2026-07-08T00:00:00.000Z",
        renderMode: "primitive",
        style: {
          line: { color: { red: 0, green: 1, blue: 1, alpha: 1 }, width: 4 }
        }
      }
    ]);

    expect(restored[0]).toMatchObject({
      id: "draw-primitive",
      renderMode: "primitive"
    });
    expect(restored[0].primitives).toHaveLength(1);
    expect(manager.toJSON()[0].renderMode).toBe("primitive");
    expect(map.viewer.scene.primitives.add).toHaveBeenCalled();

    manager.setShow("draw-primitive", false);
    const runtime = manager.get("draw-primitive")?.primitives?.[0];
    expect(manager.get("draw-primitive")?.entity.show).toBe(false);
    if (runtime?.type === "polyline") {
      expect(runtime.polyline.show).toBe(false);
    }

    manager.setStyle("draw-primitive", {
      line: { color: "#35d07f", width: 6 }
    });
    expect(manager.get("draw-primitive")?.primitives).toHaveLength(1);

    expect(manager.remove("draw-primitive")).toBe(true);
    expect(map.viewer.scene.primitives.remove).toHaveBeenCalled();
  });

  it("updates and serializes draw result style", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const result = createResult("draw-1");
    manager.addResult(result);

    const styled = manager.setStyle("draw-1", {
      line: { color: "#35d07f", width: 4 }
    });

    expect(styled.style?.line?.width).toBe(4);
    expect(styled.updatedAt).toBeInstanceOf(Date);
    const color = manager.toJSON()[0].style?.line?.color;
    expect(color?.red).toBeCloseTo(0.2078, 3);
    expect(color?.green).toBeCloseTo(0.8157, 3);
    expect(color?.blue).toBeCloseTo(0.498, 3);
    expect(color?.alpha).toBe(1);
  });

  it("removes one result and its entity", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const result = createResult("draw-1");

    manager.addResult(result);

    expect(manager.remove("draw-1")).toBe(true);
    expect(map.viewer.entities.remove).toHaveBeenCalledWith(result.entity);
    expect(map.tools.emitClear).toHaveBeenCalledWith({ source: "draw", ids: ["draw-1"] });
    expect(manager.get("draw-1")).toBeUndefined();
  });

  it("replaces duplicate result ids without leaking the previous entity", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const first = createResult("draw-1");
    const second = createResult("draw-1");

    manager.addResult(first);
    manager.addResult(first);
    manager.addResult(second);

    expect(map.viewer.entities.remove).toHaveBeenCalledWith(first.entity);
    expect(manager.list()).toEqual([second]);
  });

  it("clears all draw results", () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    manager.addResult(createResult("draw-1"));
    manager.addResult(createResult("draw-2"));

    manager.clear();

    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(2);
    expect(map.tools.emitClear).toHaveBeenCalledWith({
      source: "draw",
      ids: ["draw-1", "draw-2"]
    });
    expect(manager.list()).toEqual([]);
  });

  it("stages primitive results without viewer mutation and restores runtime identity", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const positions = [
      { longitude: 114, latitude: 22, height: 10 },
      { longitude: 114.01, latitude: 22.01, height: 20 }
    ];
    await manager.load([
      {
        id: "draw-old",
        type: "polyline",
        positions,
        createdAt: "2026-07-10T00:00:00.000Z",
        renderMode: "primitive"
      }
    ]);
    const oldResult = manager.get("draw-old")!;
    const oldPrimitive = oldResult.primitives![0];
    vi.mocked(map.viewer.scene.primitives.add).mockClear();

    const stage = await manager.prepareSceneLoad(
      [
        {
          id: "draw-new",
          type: "polyline",
          positions,
          createdAt: "2026-07-10T01:00:00.000Z",
          renderMode: "primitive"
        }
      ],
      { clear: true }
    );

    expect(map.viewer.scene.primitives.add).not.toHaveBeenCalled();
    expect(manager.get("draw-old")).toBe(oldResult);

    await stage.commit();
    const stagedResult = manager.get("draw-new")!;
    const stagedPrimitive = stagedResult.primitives![0];
    await stage.rollback();
    await stage.dispose();

    expect(manager.get("draw-old")).toBe(oldResult);
    expect(oldResult.primitives![0]).toBe(oldPrimitive);
    expect(oldPrimitive.type === "polyline" && oldPrimitive.collection.isDestroyed()).toBe(false);
    expect(
      stagedPrimitive.type === "polyline" && stagedPrimitive.collection.isDestroyed()
    ).toBe(true);
  });

  it("rolls back only old entities that were actually detached", async () => {
    const map = createMapMock();
    const manager = new DrawManager(map);
    const first = manager.addResult(createResult("draw-old-1"));
    const second = manager.addResult(createResult("draw-old-2"));
    const current = new Map([
      [first.entity.id, first.entity],
      [second.entity.id, second.entity]
    ]);
    const add = vi.mocked(map.viewer.entities.add).mockImplementation((entity) => {
      const value = entity as Entity;
      if (current.has(value.id)) {
        throw new Error(`duplicate ${value.id}`);
      }
      current.set(value.id, value);
      return value;
    });
    vi.mocked(map.viewer.entities.remove).mockImplementation((entity) => {
      if (entity === second.entity) {
        throw new Error("detach failed");
      }
      return current.delete(entity.id);
    });
    Object.assign(map.viewer.entities, {
      getById: (id: string) => current.get(id)
    });
    const stage = await manager.prepareSceneLoad(
      [
        {
          id: "draw-new",
          type: "polyline",
          positions: [
            { longitude: 114, latitude: 22, height: 10 },
            { longitude: 114.01, latitude: 22.01, height: 20 }
          ],
          createdAt: "2026-07-10T01:00:00.000Z"
        }
      ],
      { clear: true }
    );

    expect(() => stage.commit()).toThrow("detach failed");
    expect(() => stage.rollback()).not.toThrow();
    await stage.dispose();

    expect(current.get(first.entity.id)).toBe(first.entity);
    expect(current.get(second.entity.id)).toBe(second.entity);
    expect(add).toHaveBeenCalledTimes(1);
  });
});
