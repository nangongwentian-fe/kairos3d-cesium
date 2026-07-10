import type { ProfileResult } from "@kairos3d/cesium/analysis";
import type {
  ResultQueryOptions,
  ResultRecord,
  ResultSource,
  SDKManagedResult
} from "@kairos3d/cesium/results";
import { Focus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactWidgetProps } from "../types";
import {
  ConfirmRow,
  useAsyncAction,
  useManagerRevision,
  WidgetEmpty,
  WidgetError,
  WidgetSection
} from "./shared";

const sources: Array<["all" | ResultSource, string]> = [
  ["all", "全部来源"],
  ["draw", "绘制"],
  ["measure", "量测"],
  ["visibility", "通视"],
  ["profile", "剖面"],
  ["clipping", "裁剪"],
  ["terrain", "地形"]
];

export function AnalysisResultsWidget({ map }: ReactWidgetProps) {
  const revision = useManagerRevision(
    (refresh) => [
      map.results.on("add", refresh),
      map.results.on("remove", refresh),
      map.results.on("clear", refresh),
      map.draw.on("update", refresh),
      map.analysis.clipping.on("update", refresh)
    ],
    [map]
  );
  const [source, setSource] = useState<"all" | ResultSource>("all");
  const [type, setType] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<string>();
  const [pendingClear, setPendingClear] = useState(false);
  const { error, run } = useAsyncAction();
  const allRecords = useMemo(() => map.results.list(), [map, revision]);
  const availableTypes = useMemo(
    () => [...new Set(allRecords.map((record) => record.type))].sort(),
    [allRecords]
  );
  const query = useMemo<ResultQueryOptions>(
    () => ({
      source: source === "all" ? undefined : source,
      type: type === "all" ? undefined : (type as SDKManagedResult["type"])
    }),
    [source, type]
  );
  const records = useMemo(() => map.results.list(query), [map, query, revision]);
  const selected = records.find((record) => recordKey(record) === selectedKey);

  useEffect(() => {
    if (type !== "all" && !availableTypes.includes(type as SDKManagedResult["type"])) {
      setType("all");
    }
  }, [availableTypes, type]);
  useEffect(() => {
    if (selectedKey && !records.some((record) => recordKey(record) === selectedKey)) {
      setSelectedKey(undefined);
    }
  }, [records, selectedKey]);

  return (
    <div className="k3d-standard-widget">
      <WidgetError error={error} />
      <WidgetSection title="筛选">
        <div className="k3d-filter-row">
          <label className="k3d-field">
            <span>来源</span>
            <select value={source} onChange={(event) => setSource(event.currentTarget.value as "all" | ResultSource)}>
              {sources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="k3d-field">
            <span>类型</span>
            <select value={type} onChange={(event) => setType(event.currentTarget.value)}>
              <option value="all">全部类型</option>
              {availableTypes.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </WidgetSection>

      <WidgetSection
        title={`结果 (${records.length})`}
        actions={<button type="button" className="k3d-button" disabled={records.length === 0} onClick={() => setPendingClear(true)}>清理筛选结果</button>}
      >
        {pendingClear && (
          <ConfirmRow
            message={`清理当前筛选出的 ${records.length} 个结果？`}
            onConfirm={() => { map.results.clear(query); setPendingClear(false); }}
            onCancel={() => setPendingClear(false)}
          />
        )}
        {records.length === 0 ? (
          <WidgetEmpty>当前筛选条件下没有结果</WidgetEmpty>
        ) : (
          <div className="k3d-standard-list">
            {records.map((record) => {
              const key = recordKey(record);
              return (
                <div key={key} className="k3d-standard-item">
                  <button
                    type="button"
                    className={["k3d-select-row", selectedKey === key && "k3d-select-row--active"].filter(Boolean).join(" ")}
                    aria-pressed={selectedKey === key}
                    onClick={() => setSelectedKey(key)}
                  >
                    <span><strong>{resultTitle(record)}</strong><small>{resultSummary(record)}</small></span>
                  </button>
                  <div className="k3d-standard-item__actions">
                    <button type="button" className="k3d-icon-button" aria-label={`定位 ${record.id}`} title="定位" onClick={() => void run(`fly-${key}`, () => map.results.flyTo(record.id, { source: record.source }))}><Focus size={14} /></button>
                    <button type="button" className="k3d-icon-button k3d-icon-button--danger" aria-label={`删除 ${record.id}`} title="删除" onClick={() => setPendingDelete(key)}><Trash2 size={14} /></button>
                  </div>
                  {pendingDelete === key && (
                    <ConfirmRow
                      message={`删除“${resultTitle(record)}”？`}
                      onConfirm={() => { map.results.remove(record.id, record.source); setPendingDelete(undefined); }}
                      onCancel={() => setPendingDelete(undefined)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </WidgetSection>

      {selected?.source === "profile" && (
        <WidgetSection title="高程剖面">
          <ProfileChart result={selected.result as ProfileResult} />
        </WidgetSection>
      )}
    </div>
  );
}

function ProfileChart({ result }: { result: ProfileResult }) {
  if (result.samples.length < 2) {
    return <WidgetEmpty>剖面采样点不足</WidgetEmpty>;
  }
  const width = 300;
  const height = 130;
  const inset = 12;
  const distanceRange = Math.max(result.totalDistance, 1);
  const heightRange = Math.max(result.maxHeight - result.minHeight, 1);
  const points = result.samples
    .map((sample) => {
      const x = inset + (sample.distance / distanceRange) * (width - inset * 2);
      const y = height - inset - ((sample.height - result.minHeight) / heightRange) * (height - inset * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <div className="k3d-profile-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="高程剖面图">
        <line x1={inset} y1={height - inset} x2={width - inset} y2={height - inset} />
        <polyline points={points} />
      </svg>
      <div><span>最低 {formatNumber(result.minHeight)} m</span><span>最高 {formatNumber(result.maxHeight)} m</span><span>总长 {formatNumber(result.totalDistance)} m</span></div>
    </div>
  );
}

function recordKey(record: ResultRecord): string {
  return `${record.source}:${record.id}`;
}

function resultTitle(record: ResultRecord): string {
  return `${sourceName(record.source)} · ${record.type}`;
}

function resultSummary(record: ResultRecord): string {
  const result = record.result as SDKManagedResult & {
    value?: number;
    unit?: string;
    distance?: number;
    totalDistance?: number;
    visible?: boolean;
    volume?: number;
    minHeight?: number;
    maxHeight?: number;
  };
  if (typeof result.value === "number") return `${formatNumber(result.value)} ${result.unit ?? ""}`.trim();
  if (typeof result.visible === "boolean") return result.visible ? "无遮挡" : "存在遮挡";
  if (typeof result.totalDistance === "number") return `总长 ${formatNumber(result.totalDistance)} m`;
  if (typeof result.distance === "number") return `距离 ${formatNumber(result.distance)} m`;
  if (typeof result.volume === "number") return `体积 ${formatNumber(result.volume)} m³`;
  if (typeof result.minHeight === "number" && typeof result.maxHeight === "number") {
    return `高程 ${formatNumber(result.minHeight)} - ${formatNumber(result.maxHeight)} m`;
  }
  return record.id;
}

function sourceName(source: ResultSource): string {
  return sources.find(([value]) => value === source)?.[1] ?? source;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}
