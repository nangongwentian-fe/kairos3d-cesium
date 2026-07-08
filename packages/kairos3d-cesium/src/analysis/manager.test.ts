import { Cartesian3, Entity } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { StyleManager } from "../style";
import { MeasureManager, ProfileManager, VisibilityManager } from "./manager";
import type { MeasureResult } from "./types";

function createMapMock() {
  return {
    viewer: {
      terrainProvider: {
        availability: undefined
      },
      entities: {
        add: vi.fn((options) => new Entity(options)),
        remove: vi.fn()
      }
    },
    height: {
      resolvePositions: vi.fn(async (positions: Cartesian3[]) =>
        positions.map((position) => Cartesian3.clone(position))
      )
    },
    tools: {
      start: vi.fn(),
      stop: vi.fn(),
      emitClear: vi.fn()
    },
    styles: new StyleManager()
  } as unknown as KairosMap;
}

function createResult(id: string): MeasureResult {
  const entities = [{ id: `${id}-line` }, { id: `${id}-label` }] as Entity[];
  return {
    id,
    type: "distance",
    positions: [
      Cartesian3.fromDegrees(114, 22, 10),
      Cartesian3.fromDegrees(114.01, 22.01, 20)
    ],
    value: 10,
    unit: "m",
    label: "10.00 m",
    entities,
    entityIds: entities.map((entity) => entity.id),
    createdAt: new Date()
  };
}

describe("MeasureManager", () => {
  it("starts measure tools through the shared tool manager", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);

    await manager.distance();
    await manager.area();
    await manager.height();

    expect(map.tools.start).toHaveBeenNthCalledWith(1, "measure.distance", undefined);
    expect(map.tools.start).toHaveBeenNthCalledWith(2, "measure.area", undefined);
    expect(map.tools.start).toHaveBeenNthCalledWith(3, "measure.height", undefined);
  });

  it("removes one measurement result and all related entities", () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    const result = createResult("measure-1");

    manager.addResult(result);

    expect(manager.remove("measure-1")).toBe(true);
    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(2);
    expect(map.tools.emitClear).toHaveBeenCalledWith({ source: "measure", ids: ["measure-1"] });
    expect(manager.get("measure-1")).toBeUndefined();
  });

  it("clears all measurement results", () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    manager.addResult(createResult("measure-1"));
    manager.addResult(createResult("measure-2"));

    manager.clear();

    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(4);
    expect(map.tools.emitClear).toHaveBeenCalledWith({
      source: "measure",
      ids: ["measure-1", "measure-2"]
    });
    expect(manager.list()).toEqual([]);
  });

  it("serializes and restores measurement results", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    const result = createResult("measure-1");
    result.height = { mode: "clampToGround" };
    result.mode = "surface";
    manager.addResult(result);

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: "measure-1",
      type: "distance",
      value: 10,
      unit: "m",
      height: { mode: "clampToGround" },
      mode: "surface"
    });
    expect(restored[0].id).toBe("measure-1");
    expect(restored[0].height).toEqual({ mode: "clampToGround" });
    expect(restored[0].mode).toBe("surface");
    expect(restored[0].positions).toHaveLength(2);
    expect(restored[0].entities.length).toBeGreaterThan(0);
    expect(manager.get("measure-1")).toBe(restored[0]);
  });

  it("updates and restores measurement style", async () => {
    const map = createMapMock();
    const manager = new MeasureManager(map);
    manager.addResult(createResult("measure-1"));

    manager.setStyle("measure-1", {
      line: { color: "#ff3b30", width: 5 },
      label: { color: "#ffffff" }
    });
    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0].style?.line?.width).toBe(5);
    expect(restored[0].style?.line?.width).toBe(5);
    expect(restored[0].entities.length).toBeGreaterThan(0);
  });
});

describe("VisibilityManager", () => {
  it("starts visibility pick through the shared tool manager", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);

    await manager.pick({ sampleCount: 16 });

    expect(map.tools.start).toHaveBeenCalledWith("analysis.visibility.pick", {
      sampleCount: 16
    });
  });

  it("computes and stores a visibility result with render entities", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const result = await manager.compute({
      start: Cartesian3.fromDegrees(114, 22, 100),
      end: Cartesian3.fromDegrees(114.01, 22, 100),
      sampleCount: 8
    });

    expect(result.type).toBe("visibility");
    expect(result.visible).toBe(true);
    expect(result.positions).toHaveLength(2);
    expect(result.entities.length).toBeGreaterThan(0);
    expect(manager.get(result.id)).toBe(result);
  });

  it("removes visibility result entities", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const result = await manager.compute({
      start: Cartesian3.fromDegrees(114, 22, 100),
      end: Cartesian3.fromDegrees(114.01, 22, 100),
      sampleCount: 8
    });

    expect(manager.remove(result.id)).toBe(true);
    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(result.entities.length);
    expect(map.tools.emitClear).toHaveBeenCalledWith({
      source: "visibility",
      ids: [result.id]
    });
  });

  it("serializes and restores visibility results", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const result = await manager.compute({
      start: Cartesian3.fromDegrees(114, 22, 100),
      end: Cartesian3.fromDegrees(114.01, 22, 100),
      sampleCount: 8
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: result.id,
      type: "visibility",
      visible: true
    });
    expect(restored[0].id).toBe(result.id);
    expect(restored[0].positions).toHaveLength(2);
    expect(restored[0].entities.length).toBeGreaterThan(0);
  });

  it("serializes and restores visibility style", async () => {
    const map = createMapMock();
    const manager = new VisibilityManager(map);
    const result = await manager.compute({
      start: Cartesian3.fromDegrees(114, 22, 100),
      end: Cartesian3.fromDegrees(114.01, 22, 100),
      sampleCount: 8,
      height: { mode: "clampToGround" },
      style: {
        visibleLine: { color: "#35d07f", width: 4 }
      }
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0].style?.visibleLine?.width).toBe(4);
    expect(snapshot[0].height).toEqual({ mode: "clampToGround" });
    expect(restored[0].id).toBe(result.id);
    expect(restored[0].style?.visibleLine?.width).toBe(4);
    expect(restored[0].height).toEqual({ mode: "clampToGround" });
  });
});

describe("ProfileManager", () => {
  it("starts profile draw through the shared tool manager", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);

    await manager.draw({ sampleCount: 16 });

    expect(map.tools.start).toHaveBeenCalledWith("analysis.profile.draw", {
      sampleCount: 16
    });
  });

  it("computes and stores a profile result", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    const result = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      sampleCount: 5
    });

    expect(result.type).toBe("profile");
    expect(result.samples).toHaveLength(5);
    expect(result.totalDistance).toBeGreaterThan(0);
    expect(result.minHeight).toBe(0);
    expect(result.maxHeight).toBe(0);
    expect(result.entities.length).toBe(3);
    expect(manager.get(result.id)).toBe(result);
  });

  it("clears profile result entities", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    const first = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      sampleCount: 3
    });
    const second = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(115, 22, 0),
        Cartesian3.fromDegrees(115.01, 22, 0)
      ],
      sampleCount: 3
    });

    manager.clear();

    expect(map.viewer.entities.remove).toHaveBeenCalledTimes(
      first.entities.length + second.entities.length
    );
    expect(map.tools.emitClear).toHaveBeenCalledWith({
      source: "profile",
      ids: [first.id, second.id]
    });
    expect(manager.list()).toEqual([]);
  });

  it("serializes and restores profile results", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    const result = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      sampleCount: 3,
      height: { mode: "relativeToGround", offset: 5 }
    });

    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0]).toMatchObject({
      id: result.id,
      type: "profile",
      totalDistance: result.totalDistance,
      height: { mode: "relativeToGround", offset: 5 }
    });
    expect(restored[0].id).toBe(result.id);
    expect(restored[0].height).toEqual({ mode: "relativeToGround", offset: 5 });
    expect(restored[0].samples).toHaveLength(3);
    expect(restored[0].entities.length).toBeGreaterThan(0);
  });

  it("updates and restores profile style", async () => {
    const map = createMapMock();
    const manager = new ProfileManager(map);
    const result = await manager.compute({
      positions: [
        Cartesian3.fromDegrees(114, 22, 0),
        Cartesian3.fromDegrees(114.01, 22, 0)
      ],
      sampleCount: 3
    });

    manager.setStyle(result.id, {
      line: { color: "#00d4ff", width: 6 },
      point: { pixelSize: 10 }
    });
    const snapshot = manager.toJSON();
    manager.clear();
    const restored = await manager.load(snapshot);

    expect(snapshot[0].style?.line?.width).toBe(6);
    expect(restored[0].style?.point?.pixelSize).toBe(10);
  });
});
