import { Cartesian3, Entity } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { StyleManager } from "../style";
import { DrawManager } from "./manager";
import type { DrawResult } from "./types";

function createMapMock() {
  const active = { id: "draw.edit" };
  return {
    viewer: {
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
