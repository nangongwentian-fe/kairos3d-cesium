import { createWidgetPlatform } from "@kairos3d/cesium-widget";
import { lazy } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineReactWidget, ReactWidgetRegistry } from "./registry";
import { createFakeMap } from "./test/fakes";

const EmptyWidget = () => null;

describe("ReactWidgetRegistry", () => {
  it("registers React metadata and delegates lifecycle definitions", async () => {
    const { map } = createFakeMap();
    const platform = createWidgetPlatform({ map });
    const registry = new ReactWidgetRegistry(platform);
    const listener = vi.fn();
    registry.subscribe(listener);

    const module = defineReactWidget({
      id: "layers",
      name: "图层",
      defaultPlacement: { region: "left", width: 320 },
      component: EmptyWidget
    });
    expect(registry.register(module)).toBe(module);
    expect(registry.get("layers")).toBe(module);
    expect(platform.get("layers")?.placement).toEqual({ region: "left", width: 320 });
    expect(listener).toHaveBeenCalledTimes(1);

    await platform.activate("layers");
    expect(platform.get("layers")?.active).toBe(true);
    await registry.unregister("layers");
    expect(platform.get("layers")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("attaches UI metadata without owning an existing platform definition", async () => {
    const { map } = createFakeMap();
    const platform = createWidgetPlatform({ map });
    platform.register({
      id: "existing",
      name: "Existing",
      create: () => ({ activate() {}, deactivate() {}, destroy() {} })
    });
    const registry = new ReactWidgetRegistry(platform);
    registry.register({ id: "existing", name: "Existing", component: EmptyWidget });

    await registry.destroy();
    expect(platform.getDefinition("existing")).toBeDefined();
  });

  it("rejects duplicate ids and accepts React.lazy components", () => {
    const { map } = createFakeMap();
    const registry = new ReactWidgetRegistry(createWidgetPlatform({ map }));
    const component = lazy(async () => ({ default: EmptyWidget }));
    registry.register({ id: "lazy", name: "Lazy", component });

    expect(registry.get("lazy")?.component).toBe(component);
    expect(() =>
      registry.register({ id: "lazy", name: "Again", component: EmptyWidget })
    ).toThrow("already registered");
  });
});
