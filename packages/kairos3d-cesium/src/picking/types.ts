import type {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileFeature,
  Entity,
  ImageryLayerFeatureInfo
} from "cesium";

export type PickResultType = "entity" | "3dtiles" | "imagery" | "primitive";

export interface PickOptions {
  includeImagery?: boolean;
  limit?: number;
  width?: number;
  height?: number;
}

export interface PickingClickOptions extends PickOptions {
  select?: boolean;
}

export interface PickResult {
  id: string;
  type: PickResultType;
  layerId?: string;
  name?: string;
  object: unknown;
  entity?: Entity;
  feature?: Cesium3DTileFeature | ImageryLayerFeatureInfo;
  primitive?: unknown;
  position?: Cartesian3;
  cartographic?: Cartographic;
  windowPosition: Cartesian2;
  properties: Record<string, unknown>;
}

export interface PickingEvent {
  result?: PickResult;
  results: PickResult[];
  windowPosition: Cartesian2;
}

export interface PickingManagerEvents {
  pick: PickingEvent;
}

export interface SelectionState {
  result?: PickResult;
  highlighted: boolean;
}
