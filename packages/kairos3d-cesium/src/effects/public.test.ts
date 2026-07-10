import { expectTypeOf, test } from "vitest";
import type { MaterialDefinition } from "../materials";
import type { AsyncOperationOptions } from "../operations";
import {
  EffectManager,
  type EffectConfig,
  type EffectInstance,
  type EffectSnapshot,
  type EffectType,
  type EffectUpdateOptions
} from "./index";

test("exports stable effects public types", () => {
  expectTypeOf<EffectType>().toEqualTypeOf<
    | "flow-line"
    | "flow-wall"
    | "pulse-circle"
    | "radar-scan"
    | "water-surface"
    | "particle"
    | "rain"
    | "snow"
    | "fog"
  >();
  expectTypeOf<EffectManager["add"]>().parameter(0).toEqualTypeOf<EffectConfig>();
  expectTypeOf<EffectManager["add"]>()
    .parameter(1)
    .toEqualTypeOf<AsyncOperationOptions | undefined>();
  expectTypeOf<EffectManager["update"]>()
    .parameter(2)
    .toEqualTypeOf<AsyncOperationOptions | undefined>();
  expectTypeOf<EffectManager["add"]>().returns.resolves.toEqualTypeOf<EffectInstance>();
  expectTypeOf<EffectManager["toJSON"]>().returns.toEqualTypeOf<EffectSnapshot[]>();

  const flowPatch: EffectUpdateOptions = {
    material: { type: "flow", color: "#35d07f", speed: 2 }
  };
  const weatherPatch: EffectUpdateOptions = { intensity: 0.5 };
  expectTypeOf(flowPatch).toMatchTypeOf<EffectUpdateOptions>();
  expectTypeOf(weatherPatch).toMatchTypeOf<EffectUpdateOptions>();

  const custom: MaterialDefinition = {
    type: "custom-effect-material",
    targets: ["primitive"],
    createMaterial: () => ({}) as never
  };
  expectTypeOf(custom).toMatchTypeOf<MaterialDefinition>();
});
