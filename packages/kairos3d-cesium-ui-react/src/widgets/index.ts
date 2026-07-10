import {
  Camera,
  ClipboardList,
  Layers3,
  MousePointer2,
  PencilRuler,
  Ruler
} from "lucide-react";
import { defineReactWidget } from "../registry";
import { AnalysisResultsWidget } from "./analysis-results";
import { DrawManagerWidget } from "./draw-manager";
import { FeatureInspectorWidget } from "./feature-inspector";
import { LayerManagerWidget } from "./layer-manager";
import { MeasureWidget } from "./measure";
import { SceneSnapshotWidget } from "./scene-snapshot";

export const layerManagerWidget = defineReactWidget({
  id: "layers",
  name: "图层管理",
  exclusiveGroup: "left-panel",
  defaultPlacement: { region: "left", order: 10, width: 330 },
  toolbar: { order: 10 },
  icon: Layers3,
  component: LayerManagerWidget
});

export const drawManagerWidget = defineReactWidget({
  id: "draw",
  name: "绘制管理",
  exclusiveGroup: "left-panel",
  defaultPlacement: { region: "left", order: 20, width: 350 },
  toolbar: { order: 20 },
  icon: PencilRuler,
  component: DrawManagerWidget
});

export const measureWidget = defineReactWidget({
  id: "measure",
  name: "量测",
  exclusiveGroup: "left-panel",
  defaultPlacement: { region: "left", order: 30, width: 330 },
  toolbar: { order: 30 },
  icon: Ruler,
  component: MeasureWidget
});

export const featureInspectorWidget = defineReactWidget({
  id: "feature-inspector",
  name: "属性查询",
  exclusiveGroup: "right-panel",
  defaultPlacement: { region: "right", order: 10, width: 350 },
  toolbar: { order: 40 },
  icon: MousePointer2,
  component: FeatureInspectorWidget,
  create: ({ map }) => {
    let ownsClick = false;
    const release = () => {
      if (ownsClick) {
        map.picking.disableClick();
        ownsClick = false;
      }
      map.selection.clear();
    };
    return {
      activate() {
        ownsClick = !map.picking.isClickEnabled();
        if (ownsClick) {
          map.picking.enableClick({ select: true, includeImagery: false });
        }
      },
      deactivate: release,
      destroy: release
    };
  }
});

export const analysisResultsWidget = defineReactWidget({
  id: "analysis-results",
  name: "分析结果",
  exclusiveGroup: "right-panel",
  defaultPlacement: { region: "right", order: 20, width: 360 },
  toolbar: { order: 50 },
  icon: ClipboardList,
  component: AnalysisResultsWidget
});

export const sceneSnapshotWidget = defineReactWidget({
  id: "scene-snapshot",
  name: "场景快照",
  exclusiveGroup: "right-panel",
  defaultPlacement: { region: "right", order: 30, width: 350 },
  toolbar: { order: 60 },
  icon: Camera,
  component: SceneSnapshotWidget
});

export const standardWidgets = [
  layerManagerWidget,
  drawManagerWidget,
  measureWidget,
  featureInspectorWidget,
  analysisResultsWidget,
  sceneSnapshotWidget
] as const;

export {
  AnalysisResultsWidget,
  DrawManagerWidget,
  FeatureInspectorWidget,
  LayerManagerWidget,
  MeasureWidget,
  SceneSnapshotWidget
};
