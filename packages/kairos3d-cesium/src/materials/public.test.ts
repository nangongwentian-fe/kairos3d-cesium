import type { Material, MaterialProperty } from "cesium";
import { describe, expectTypeOf, it } from "vitest";
import type {
  BuiltInEntityMaterialDescriptor,
  BuiltInPrimitiveMaterialDescriptor,
  EntityMaterialDescriptor,
  FlowMaterialDescriptor,
  MaterialColor,
  MaterialDefinition,
  MaterialDefinitionInfo,
  MaterialDescriptor,
  MaterialTarget,
  PrimitiveMaterialDescriptor,
  RadarScanMaterialDescriptor,
  RadialWaveMaterialDescriptor,
  WaterMaterialDescriptor
} from "./index";
import { MaterialManager } from "./index";

describe("materials public types", () => {
  it("keeps descriptors data-only and target-aware", () => {
    expectTypeOf<MaterialTarget>().toEqualTypeOf<"entity" | "primitive">();
    expectTypeOf<MaterialColor>().toEqualTypeOf<
      | string
      | { red: number; green: number; blue: number; alpha: number }
    >();
    expectTypeOf<BuiltInEntityMaterialDescriptor>().toMatchTypeOf<
      EntityMaterialDescriptor
    >();
    expectTypeOf<BuiltInPrimitiveMaterialDescriptor>().toMatchTypeOf<
      PrimitiveMaterialDescriptor
    >();
    expectTypeOf<FlowMaterialDescriptor>().toMatchTypeOf<MaterialDescriptor>();
    expectTypeOf<RadialWaveMaterialDescriptor>().toMatchTypeOf<MaterialDescriptor>();
    expectTypeOf<RadarScanMaterialDescriptor>().toMatchTypeOf<MaterialDescriptor>();
    expectTypeOf<WaterMaterialDescriptor>().toMatchTypeOf<MaterialDescriptor>();
  });

  it("exposes the stable manager and definition contracts", () => {
    expectTypeOf(MaterialManager.prototype.register).parameter(0).toEqualTypeOf<
      MaterialDefinition
    >();
    expectTypeOf(MaterialManager.prototype.list).returns.toEqualTypeOf<
      MaterialDefinitionInfo[]
    >();
    expectTypeOf(MaterialManager.prototype.createProperty).returns.toEqualTypeOf<
      MaterialProperty
    >();
    expectTypeOf(MaterialManager.prototype.createMaterial).returns.toEqualTypeOf<
      Promise<Material>
    >();
  });
});
