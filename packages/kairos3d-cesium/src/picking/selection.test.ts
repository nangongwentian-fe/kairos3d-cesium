import { Cartesian2, Cartesian3, Color, Entity } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { StyleManager } from "../style";
import { SelectionManager } from "./selection";
import type { PickResult } from "./types";

function createMapMock() {
  const marker = new Entity({ id: "marker" });
  return {
    marker,
    map: {
      viewer: {
        entities: {
          add: vi.fn(() => marker),
          remove: vi.fn(() => true)
        }
      },
      styles: new StyleManager()
    } as unknown as KairosMap
  };
}

describe("SelectionManager", () => {
  it("emits one change event for each public selection mutation", () => {
    const { map } = createMapMock();
    const manager = new SelectionManager(map);
    const listener = vi.fn();
    const entity = new Entity({ id: "event-entity" });
    const result: PickResult = {
      id: "event-entity",
      type: "entity",
      object: entity,
      entity,
      position: Cartesian3.fromDegrees(114, 22, 10),
      windowPosition: new Cartesian2(1, 2),
      properties: {}
    };
    manager.on("change", listener);

    manager.select(result);
    manager.setStyle({ entity: { point: { color: "#35d07f" } } });
    manager.clear();

    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls.map(([event]) => event.data.result?.id)).toEqual([
      "event-entity",
      "event-entity",
      undefined
    ]);
  });

  it("selects and clears Entity picks with a temporary marker", () => {
    const { map, marker } = createMapMock();
    const manager = new SelectionManager(map);
    const entity = new Entity({ id: "entity-1" });
    const result: PickResult = {
      id: "entity-1",
      type: "entity",
      object: entity,
      entity,
      position: Cartesian3.fromDegrees(114, 22, 10),
      windowPosition: new Cartesian2(1, 2),
      properties: {}
    };

    expect(manager.select(result)).toMatchObject({ result, highlighted: true });
    expect(map.viewer.entities.add).toHaveBeenCalledOnce();
    expect(manager.get()).toMatchObject({ result, highlighted: true });

    manager.clear();
    expect(map.viewer.entities.remove).toHaveBeenCalledWith(marker);
    expect(manager.get()).toEqual({ result: undefined, highlighted: false });
  });

  it("restores 3D Tiles feature color when clearing selection", () => {
    const { map } = createMapMock();
    const manager = new SelectionManager(map);
    const feature = {
      color: Color.WHITE.clone(),
      featureId: 1,
      getPropertyIds: () => [],
      getProperty: () => undefined
    };
    const result: PickResult = {
      id: "3dtiles-1",
      type: "3dtiles",
      object: feature,
      feature: feature as never,
      windowPosition: new Cartesian2(1, 2),
      properties: {}
    };

    expect(manager.select(result).highlighted).toBe(true);
    expect(feature.color.equals(Color.WHITE)).toBe(false);

    manager.clear();
    expect(feature.color.equals(Color.WHITE)).toBe(true);
  });

  it("updates current 3D Tiles highlight when selection style changes", () => {
    const { map } = createMapMock();
    const manager = new SelectionManager(map);
    const feature = {
      color: Color.WHITE.clone(),
      featureId: 1,
      getPropertyIds: () => [],
      getProperty: () => undefined
    };
    const result: PickResult = {
      id: "3dtiles-1",
      type: "3dtiles",
      object: feature,
      feature: feature as never,
      windowPosition: new Cartesian2(1, 2),
      properties: {}
    };

    manager.select(result);
    manager.setStyle({ tilesFeature: { color: "#35d07f" } });

    expect(feature.color.green).toBeCloseTo(0.8157, 3);
    expect(manager.get()).toMatchObject({ result, highlighted: true });

    manager.clear();
    expect(feature.color.equals(Color.WHITE)).toBe(true);
  });
});
