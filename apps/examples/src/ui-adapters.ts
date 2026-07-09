import { Math as CesiumMath } from "cesium";
import type { PickResult } from "@kairos3d/cesium/picking";
import type { SceneSnapshot } from "@kairos3d/cesium/scene";
import type { ProfileResult } from "@kairos3d/cesium/analysis";

export interface PropertyRow {
  key: string;
  value: string;
}

export interface ProfileChartPoint {
  distance: number;
  height: number;
}

export function createPickPropertyRows(result: PickResult, limit = 8): PropertyRow[] {
  const rows: PropertyRow[] = [
    { key: "type", value: result.type },
    { key: "layer", value: result.layerId ?? "unmanaged" },
    { key: "position", value: formatPickCoordinate(result) }
  ];
  const entries = Object.entries(result.properties).slice(0, limit);
  if (entries.length === 0) {
    rows.push({ key: "properties", value: "empty" });
  } else {
    rows.push(...entries.map(([key, value]) => ({ key, value: formatValue(value) })));
  }
  return rows;
}

export function formatPickCoordinate(result: PickResult): string {
  if (!result.cartographic) {
    return "no coordinate";
  }

  return `${CesiumMath.toDegrees(result.cartographic.longitude).toFixed(5)}, ${CesiumMath.toDegrees(result.cartographic.latitude).toFixed(5)}, ${result.cartographic.height.toFixed(2)} m`;
}

export function createProfileChartData(result: ProfileResult): ProfileChartPoint[] {
  return result.samples.map((sample) => ({
    distance: sample.distance,
    height: sample.height
  }));
}

export function summarizeSceneSnapshot(snapshot: SceneSnapshot): string {
  const resultCount = countSnapshotResults(snapshot);
  const primitiveCount = snapshot.primitives?.length ?? 0;
  return `${resultCount} results, ${primitiveCount} primitive overlays, ${snapshot.layers.length} layers`;
}

function countSnapshotResults(snapshot: SceneSnapshot): number {
  const results = snapshot.results;
  if (!results) {
    return 0;
  }

  return (
    results.draw.length +
    results.measure.length +
    results.visibility.length +
    results.profile.length +
    results.clipping.length +
    results.terrain.length
  );
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
