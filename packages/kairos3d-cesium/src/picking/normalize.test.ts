import { Cartesian2, Cartesian3, Entity, ImageryLayerFeatureInfo } from "cesium";
import { describe, expect, it } from "vitest";
import { normalizePickedObject } from "./normalize";

const windowPosition = new Cartesian2(10, 20);
const position = Cartesian3.fromDegrees(114, 22, 100);

describe("normalizePickedObject", () => {
  it("normalizes Entity picks", () => {
    const entity = new Entity({
      id: "entity-1",
      name: "GeoJSON feature",
      properties: { kind: "station" }
    });

    const result = normalizePickedObject({
      picked: { id: entity, primitive: {} },
      windowPosition,
      position
    });

    expect(result).toMatchObject({
      id: "entity-1",
      type: "entity",
      name: "GeoJSON feature",
      entity,
      position,
      properties: {
        id: "entity-1",
        name: "GeoJSON feature",
        kind: "station"
      }
    });
    expect(result?.windowPosition).not.toBe(windowPosition);
  });

  it("normalizes 3D Tiles feature picks", () => {
    const feature = {
      featureId: 3,
      getPropertyIds: () => ["name"],
      getProperty: () => "Building"
    };

    const result = normalizePickedObject({
      picked: feature,
      windowPosition
    });

    expect(result).toMatchObject({
      type: "3dtiles",
      name: "Building",
      feature,
      properties: {
        featureId: 3,
        name: "Building"
      }
    });
  });

  it("normalizes imagery feature picks", () => {
    const feature = new ImageryLayerFeatureInfo();
    feature.name = "Imagery feature";
    feature.data = { id: "img-1" };

    const result = normalizePickedObject({
      picked: feature,
      windowPosition
    });

    expect(result).toMatchObject({
      type: "imagery",
      name: "Imagery feature",
      feature,
      properties: {
        id: "img-1",
        name: "Imagery feature"
      }
    });
  });
});
