import type { KairosMap } from "@kairos3d/cesium/core";
import type { WidgetPlatform } from "@kairos3d/cesium-widget";
import { expectTypeOf, it } from "vitest";
import {
  defineReactWidget,
  type KairosMapProviderProps,
  type KairosMapState,
  type KairosPopup,
  type KairosPopupAnchor,
  type KairosWidgetTheme,
  type ReactWidgetModule,
  type ReactWidgetProps,
  type ReactWidgetToolbarOptions
} from "./index";

it("exposes stable M6 public types", () => {
  const module = defineReactWidget({
    id: "layers",
    name: "Layers",
    component: (_props: ReactWidgetProps) => null,
    toolbar: { label: "Layers", order: 1 } satisfies ReactWidgetToolbarOptions
  });

  expectTypeOf(module).toMatchTypeOf<ReactWidgetModule>();
  expectTypeOf<KairosMapProviderProps>().toMatchTypeOf<
    | { createOptions: object }
    | { map: KairosMap; platform?: WidgetPlatform }
  >();
  expectTypeOf<KairosMapState["status"]>().toEqualTypeOf<
    "idle" | "creating" | "ready" | "error"
  >();
  expectTypeOf<KairosWidgetTheme>().toEqualTypeOf<"light" | "dark">();
  expectTypeOf<KairosPopup["anchor"]>().toEqualTypeOf<KairosPopupAnchor>();
});
