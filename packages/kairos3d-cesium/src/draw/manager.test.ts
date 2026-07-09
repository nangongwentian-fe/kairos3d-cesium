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
    createdAt: new Date()
  };
}

describe("DrawManager", () => {
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

    expect(circle.entity.ellipse?.semiMajorAxis?.getValue()).toBe(80);
    expect(rectangle.entity.rectangle).toBeDefined();
    expect(billboard.entity.billboard?.image?.getValue()).toBe("/marker.png");
    expect(billboard.data?.scale).toBe(2);
    expect(label.entity.label?.text?.getValue()).toBe("Kairos");
    expect(model.entity.model?.uri?.getValue()).toBe("/model.glb");
    expect(model.entity.orientation).toBeDefined();
    expect(model.data).toMatchObject({ heading: 0.3, pitch: 0.2, roll: 0.1 });
    expect(manager.list()).toEqual([circle, rectangle, billboard, label, model]);
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
});
