import type { MeasureResult } from "@kairos3d/cesium/analysis";
import type { AreaMeasureMode, DistanceMeasureMode } from "@kairos3d/cesium/height";
import {
  Ban,
  Focus,
  MoveVertical,
  Ruler,
  Square,
  Trash2,
  Triangle
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactWidgetProps } from "../types";
import {
  ConfirmRow,
  useAsyncAction,
  useManagerRevision,
  WidgetEmpty,
  WidgetError,
  WidgetSection
} from "./shared";

export function MeasureWidget({ map }: ReactWidgetProps) {
  const revision = useManagerRevision(
    (refresh) => [
      map.analysis.measure.on("add", refresh),
      map.analysis.measure.on("remove", refresh),
      map.analysis.measure.on("clear", refresh),
      map.tools.on("start", refresh),
      map.tools.on("stop", refresh),
      map.tools.on("cancel", refresh),
      map.tools.on("complete", refresh)
    ],
    [map]
  );
  const results = useMemo(() => map.analysis.measure.list(), [map, revision]);
  const [distanceMode, setDistanceMode] = useState<DistanceMeasureMode>("space");
  const [areaMode, setAreaMode] = useState<AreaMeasureMode>("projected");
  const [pendingDelete, setPendingDelete] = useState<string>();
  const [pendingClear, setPendingClear] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const activeTool = map.tools.active?.id;

  const start = (type: MeasureResult["type"]) => {
    if (type === "distance") {
      return run("distance", () => map.analysis.measure.distance({ mode: distanceMode }));
    }
    if (type === "area") {
      return run("area", () => map.analysis.measure.area({ mode: areaMode }));
    }
    return run("height", () => map.analysis.measure.height());
  };

  return (
    <div className="k3d-standard-widget">
      <WidgetError error={error} />
      <WidgetSection title="量测工具">
        <div className="k3d-segment-field">
          <span>距离模式</span>
          <div className="k3d-segmented" role="group" aria-label="距离模式">
            {(["space", "surface"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={distanceMode === mode} onClick={() => setDistanceMode(mode)}>
                {mode === "space" ? "空间" : "贴地"}
              </button>
            ))}
          </div>
        </div>
        <div className="k3d-segment-field">
          <span>面积模式</span>
          <div className="k3d-segmented" role="group" aria-label="面积模式">
            {(["projected", "surface"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={areaMode === mode} onClick={() => setAreaMode(mode)}>
                {mode === "projected" ? "投影" : "地表"}
              </button>
            ))}
          </div>
        </div>
        <div className="k3d-measure-actions">
          <button type="button" className="k3d-command-button" disabled={busy === "distance"} onClick={() => void start("distance")}>
            <Ruler size={16} />距离
          </button>
          <button type="button" className="k3d-command-button" disabled={busy === "area"} onClick={() => void start("area")}>
            <Triangle size={16} />面积
          </button>
          <button type="button" className="k3d-command-button" disabled={busy === "height"} onClick={() => void start("height")}>
            <MoveVertical size={16} />高度
          </button>
        </div>
        <div className="k3d-command-row k3d-command-row--compact">
          <span className="k3d-tool-status">{activeTool ? `当前工具：${activeTool}` : "当前没有活动工具"}</span>
          <button type="button" className="k3d-icon-button" aria-label="停止量测" title="停止" disabled={!activeTool} onClick={() => map.tools.stop()}><Square size={14} /></button>
          <button type="button" className="k3d-icon-button" aria-label="取消量测" title="取消" disabled={!activeTool} onClick={() => map.tools.cancel()}><Ban size={14} /></button>
        </div>
      </WidgetSection>

      <WidgetSection
        title={`量测结果 (${results.length})`}
        actions={<button type="button" className="k3d-button" disabled={results.length === 0} onClick={() => setPendingClear(true)}>清空</button>}
      >
        {pendingClear && (
          <ConfirmRow
            message="清空全部量测结果？"
            onConfirm={() => { map.analysis.measure.clear(); setPendingClear(false); }}
            onCancel={() => setPendingClear(false)}
          />
        )}
        {results.length === 0 ? (
          <WidgetEmpty>暂无量测结果</WidgetEmpty>
        ) : (
          <div className="k3d-standard-list">
            {results.map((result) => (
              <div key={result.id} className="k3d-standard-item">
                <div className="k3d-standard-item__text">
                  <strong>{measureTypeName(result.type)}</strong>
                  <span>{result.label ?? formatMeasure(result)}</span>
                </div>
                <div className="k3d-standard-item__actions">
                  <button type="button" className="k3d-icon-button" aria-label={`定位 ${result.id}`} title="定位" onClick={() => void run(`fly-${result.id}`, () => map.results.flyTo(result.id, { source: "measure" }))}><Focus size={14} /></button>
                  <button type="button" className="k3d-icon-button k3d-icon-button--danger" aria-label={`删除 ${result.id}`} title="删除" onClick={() => setPendingDelete(result.id)}><Trash2 size={14} /></button>
                </div>
                {pendingDelete === result.id && (
                  <ConfirmRow
                    message={`删除${measureTypeName(result.type)}结果？`}
                    onConfirm={() => { map.analysis.measure.remove(result.id); setPendingDelete(undefined); }}
                    onCancel={() => setPendingDelete(undefined)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </WidgetSection>
    </div>
  );
}

function measureTypeName(type: MeasureResult["type"]): string {
  if (type === "distance") return "距离";
  if (type === "area") return "面积";
  return "高度";
}

function formatMeasure(result: MeasureResult): string {
  return `${formatNumber(result.value)} ${result.unit}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}
