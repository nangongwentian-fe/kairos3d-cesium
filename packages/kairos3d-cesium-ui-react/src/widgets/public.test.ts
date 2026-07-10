import { describe, expect, expectTypeOf, it } from "vitest";
import type { ReactWidgetModule } from "../types";
import * as widgets from "./index";

describe("standard widget exports", () => {
  it("exports all standard modules and components", () => {
    expect(widgets.standardWidgets).toHaveLength(6);
    expect(widgets).toMatchObject({
      layerManagerWidget: expect.objectContaining({ id: "layers" }),
      featureInspectorWidget: expect.objectContaining({ id: "feature-inspector" }),
      drawManagerWidget: expect.objectContaining({ id: "draw" }),
      measureWidget: expect.objectContaining({ id: "measure" }),
      analysisResultsWidget: expect.objectContaining({ id: "analysis-results" }),
      sceneSnapshotWidget: expect.objectContaining({ id: "scene-snapshot" }),
      LayerManagerWidget: expect.any(Function),
      FeatureInspectorWidget: expect.any(Function),
      DrawManagerWidget: expect.any(Function),
      MeasureWidget: expect.any(Function),
      AnalysisResultsWidget: expect.any(Function),
      SceneSnapshotWidget: expect.any(Function)
    });
    expectTypeOf(widgets.standardWidgets).toMatchTypeOf<readonly ReactWidgetModule[]>();
  });
});
