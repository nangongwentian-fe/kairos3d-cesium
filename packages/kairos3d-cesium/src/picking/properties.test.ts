import { Entity, ImageryLayerFeatureInfo } from "cesium";
import { describe, expect, it } from "vitest";
import {
  extractEntityProperties,
  extractImageryFeatureProperties,
  extractTileFeatureProperties
} from "./properties";

describe("picking property extraction", () => {
  it("extracts Entity properties with id and name", () => {
    const entity = new Entity({
      id: "entity-1",
      name: "Test entity",
      properties: {
        code: "A001",
        height: 120
      }
    });

    expect(extractEntityProperties(entity)).toMatchObject({
      id: "entity-1",
      name: "Test entity",
      code: "A001",
      height: 120
    });
  });

  it("extracts 3D Tiles feature properties", () => {
    const feature = {
      featureId: 7,
      getPropertyIds: () => ["name", "floor"],
      getProperty: (id: string) => (id === "name" ? "Tower" : 42)
    };

    expect(extractTileFeatureProperties(feature as never)).toEqual({
      featureId: 7,
      name: "Tower",
      floor: 42
    });
  });

  it("extracts imagery feature data", () => {
    const feature = new ImageryLayerFeatureInfo();
    feature.name = "Parcel";
    feature.description = "<table></table>";
    feature.data = { parcelId: "P-1" };

    expect(extractImageryFeatureProperties(feature)).toEqual({
      parcelId: "P-1",
      name: "Parcel",
      description: "<table></table>"
    });
  });
});
