import type { PickResult } from "@kairos3d/cesium/picking";
import type { ResultRecord } from "@kairos3d/cesium/results";
import {
  createMemoryWidgetSnapshotStorage,
  createWidgetPlatform,
  type WidgetPlatform
} from "@kairos3d/cesium-widget";
import { Cartesian3, Cartographic } from "cesium";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { ReactWidgetRegistry } from "../registry";
import { createWidgetMap } from "../test/widget-map";
import type { ReactWidgetProps } from "../types";
import { AnalysisResultsWidget } from "./analysis-results";
import { DrawManagerWidget } from "./draw-manager";
import { FeatureInspectorWidget } from "./feature-inspector";
import {
  featureInspectorWidget,
  standardWidgets
} from "./index";
import { LayerManagerWidget } from "./layer-manager";
import { MeasureWidget } from "./measure";
import { SceneSnapshotWidget } from "./scene-snapshot";

describe("standard widgets", () => {
  it("exports stable ids, placements, and exclusive groups", () => {
    expect(standardWidgets.map((module) => module.id)).toEqual([
      "layers",
      "draw",
      "measure",
      "feature-inspector",
      "analysis-results",
      "scene-snapshot"
    ]);
    expect(standardWidgets.slice(0, 3).every((module) => module.exclusiveGroup === "left-panel")).toBe(true);
    expect(standardWidgets.slice(3).every((module) => module.exclusiveGroup === "right-panel")).toBe(true);
  });

  it("manages layer visibility, ordering, opacity, flyTo, and confirmed removal", async () => {
    const user = userEvent.setup();
    const fixture = createWidgetMap();
    fixture.setLayers([
      { id: "base", type: "xyz", name: "底图", group: "基础", show: true, order: 0, opacity: 1 },
      { id: "labels", type: "geojson", name: "标注", group: "业务", show: true, order: 1, opacity: 0.8 }
    ]);
    const view = renderWidget(LayerManagerWidget, fixture.map);

    await user.click(screen.getByRole("button", { name: "上移 标注" }));
    expect(fixture.layers.move).toHaveBeenCalled();
    fireEvent.change(screen.getAllByRole("slider")[0], { target: { value: "0.5" } });
    expect(fixture.layers.setOpacity).toHaveBeenCalledWith("base", 0.5);
    await user.click(screen.getByRole("button", { name: "定位 标注" }));
    expect(fixture.layers.flyTo).toHaveBeenCalledWith("labels");

    await user.click(screen.getByRole("button", { name: "删除 标注" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(fixture.layers.remove).toHaveBeenCalledWith("labels");
    view.unmount();
    expect(fixture.layers.listenerCount("update")).toBe(0);
  });

  it("inspects selection properties and preserves externally owned picking", async () => {
    const user = userEvent.setup();
    const fixture = createWidgetMap();
    const result: PickResult = {
      id: "feature-1",
      type: "entity",
      object: {},
      name: "建筑 A",
      layerId: "buildings",
      cartographic: new Cartographic(1, 0.5, 42),
      windowPosition: { x: 1, y: 2 } as never,
      properties: { floors: 12, owner: "Kairos" }
    };
    fixture.setSelection({ result, highlighted: true });
    const view = renderWidget(FeatureInspectorWidget, fixture.map);

    expect(screen.getByText("建筑 A")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "清空选择" }));
    expect(fixture.selection.clear).toHaveBeenCalled();
    view.unmount();
    expect(fixture.selection.listenerCount("change")).toBe(0);

    const platform = createWidgetPlatform({ map: fixture.map });
    const controller = await featureInspectorWidget.create?.(
      { map: fixture.map, platform, signal: new AbortController().signal },
      undefined
    );
    await controller?.activate();
    expect(fixture.picking.enableClick).toHaveBeenCalledOnce();
    await controller?.deactivate();
    expect(fixture.picking.disableClick).toHaveBeenCalledOnce();

    fixture.picking.enableClick.mockClear();
    fixture.picking.disableClick.mockClear();
    fixture.setPickingEnabled(true);
    const externalController = await featureInspectorWidget.create?.(
      { map: fixture.map, platform, signal: new AbortController().signal },
      undefined
    );
    await externalController?.activate();
    await externalController?.deactivate();
    expect(fixture.picking.enableClick).not.toHaveBeenCalled();
    expect(fixture.picking.disableClick).not.toHaveBeenCalled();
  });

  it("starts draw tools and validates properties JSON", async () => {
    const user = userEvent.setup();
    const fixture = createWidgetMap();
    fixture.setDraw([{
      id: "draw-1",
      type: "polyline",
      show: true,
      locked: false,
      editable: true,
      properties: { owner: "ops" },
      createdAt: new Date()
    }]);
    renderWidget(DrawManagerWidget, fixture.map);

    await user.selectOptions(screen.getByLabelText("类型"), "circle");
    await user.click(screen.getByRole("button", { name: "开始绘制" }));
    expect(fixture.tools.start).toHaveBeenCalledWith("draw.circle");

    await user.click(screen.getByText("draw-1").closest("button")!);
    await user.click(screen.getByRole("button", { name: /锁定/ }));
    expect(fixture.draw.setLocked).toHaveBeenCalledWith("draw-1", true);

    const textarea = screen.getByLabelText("Properties JSON");
    fireEvent.change(textarea, { target: { value: "[]" } });
    await user.click(screen.getByRole("button", { name: "保存属性" }));
    expect(await screen.findByRole("alert")).toBeDefined();

    fireEvent.change(textarea, { target: { value: '{"status":"ready"}' } });
    await user.click(screen.getByRole("button", { name: "保存属性" }));
    expect(fixture.draw.setProperties).toHaveBeenCalledWith("draw-1", { status: "ready" });
  });

  it("starts surface measurement and manages result actions", async () => {
    const user = userEvent.setup();
    const fixture = createWidgetMap();
    fixture.setMeasures([{
      id: "measure-1",
      type: "distance",
      value: 1200,
      unit: "m",
      createdAt: new Date()
    }]);
    renderWidget(MeasureWidget, fixture.map);

    await user.click(screen.getByRole("button", { name: "贴地" }));
    await user.click(screen.getByRole("button", { name: /距离/ }));
    expect(fixture.measure.distance).toHaveBeenCalledWith({ mode: "surface" });
    await user.click(screen.getByRole("button", { name: "定位 measure-1" }));
    expect(fixture.results.flyTo).toHaveBeenCalledWith("measure-1", { source: "measure" });
  });

  it("renders profile data and removes aggregate results", async () => {
    const user = userEvent.setup();
    const fixture = createWidgetMap();
    const profile = {
      id: "profile-1",
      type: "profile" as const,
      positions: [new Cartesian3(1, 0, 0), new Cartesian3(2, 0, 0)],
      samples: [
        { position: new Cartesian3(1, 0, 0), distance: 0, height: 10 },
        { position: new Cartesian3(2, 0, 0), distance: 100, height: 35 }
      ],
      totalDistance: 100,
      minHeight: 10,
      maxHeight: 35,
      entities: [],
      createdAt: new Date()
    };
    fixture.setResults([{
      id: profile.id,
      source: "profile",
      type: "profile",
      result: profile,
      createdAt: profile.createdAt
    } as ResultRecord]);
    renderWidget(AnalysisResultsWidget, fixture.map);

    await user.click(screen.getByRole("button", { name: /剖面 · profile/ }));
    expect(screen.getByRole("img", { name: "高程剖面图" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "定位 profile-1" }));
    expect(fixture.results.flyTo).toHaveBeenCalledWith("profile-1", { source: "profile" });
    await user.click(screen.getByRole("button", { name: "删除 profile-1" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(fixture.results.remove).toHaveBeenCalledWith("profile-1", "profile");
  });

  it("saves and deletes workspace snapshots through configured storage", async () => {
    const user = userEvent.setup();
    const fixture = createWidgetMap();
    const platform = createWidgetPlatform({
      map: fixture.map,
      snapshotStorage: createMemoryWidgetSnapshotStorage()
    });
    renderWidget(SceneSnapshotWidget, fixture.map, platform);

    await user.type(screen.getByLabelText("名称"), "测试场景");
    await user.click(screen.getByRole("button", { name: "保存场景快照" }));
    expect(await screen.findByText("测试场景")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "删除 测试场景" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(screen.queryByText("测试场景")).toBeNull());
  });
});

function renderWidget(
  Component: ComponentType<ReactWidgetProps>,
  map: ReturnType<typeof createWidgetMap>["map"],
  platform: WidgetPlatform = createWidgetPlatform({ map })
) {
  const registry = new ReactWidgetRegistry(platform);
  const props: ReactWidgetProps = {
    map,
    platform,
    registry,
    state: {
      id: "test-widget",
      name: "Test Widget",
      status: "active",
      active: true
    },
    close: async () => undefined,
    setPlacement: (placement) => ({
      id: "test-widget",
      name: "Test Widget",
      status: "active",
      active: true,
      placement
    })
  };
  return render(createElement(Component, props));
}
