import type { DrawResult } from "@kairos3d/cesium/draw";
import type { Overlay } from "@kairos3d/cesium/overlays";
import type { PlotType } from "@kairos3d/cesium/plotting";
import type { ResultSymbolStyle } from "@kairos3d/cesium/style";
import {
  Ban,
  Check,
  Edit3,
  Eye,
  EyeOff,
  Lock,
  Play,
  Square,
  Trash2,
  Unlock
} from "lucide-react";
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

type GraphicSource = "draw" | "overlay";

interface GraphicItem {
  key: string;
  source: GraphicSource;
  id: string;
  type: string;
  show: boolean;
  locked: boolean;
  editable: boolean;
  group?: string;
  properties?: Record<string, unknown>;
  style?: ResultSymbolStyle;
  updatedAt?: Date;
}

interface DrawChoice {
  value: string;
  label: string;
  toolId: string;
  plotType?: PlotType;
}

const drawChoices: DrawChoice[] = [
  ["point", "点"],
  ["polyline", "线"],
  ["polygon", "面"],
  ["circle", "圆"],
  ["rectangle", "矩形"],
  ["ellipse", "椭圆"],
  ["wall", "墙"],
  ["corridor", "走廊"],
  ["box", "盒体"],
  ["cylinder", "圆柱"]
].map(([value, label]) => ({ value, label, toolId: `draw.${value}` }));

const plotChoices: Array<[PlotType, string]> = [
  ["fine-arrow", "细直箭头"],
  ["straight-arrow", "直箭头"],
  ["attack-arrow", "进攻箭头"],
  ["double-arrow", "双箭头"],
  ["curve", "曲线"],
  ["closed-curve", "闭合曲线"],
  ["sector", "扇形"],
  ["lune", "弓形"],
  ["gathering-place", "集结地"]
];

for (const [type, label] of plotChoices) {
  drawChoices.push({ value: `plot:${type}`, label, toolId: "draw.plot", plotType: type });
}

const colors = ["#29c7d8", "#4fcf84", "#e9c45a", "#f06b72", "#ffffff"];

export function DrawManagerWidget({ map }: ReactWidgetProps) {
  const revision = useManagerRevision(
    (refresh) => [
      map.draw.on("add", refresh),
      map.draw.on("update", refresh),
      map.draw.on("remove", refresh),
      map.draw.on("clear", refresh),
      map.draw.on("edit-change", refresh),
      map.overlays.on("add", refresh),
      map.overlays.on("update", refresh),
      map.overlays.on("remove", refresh),
      map.overlays.on("clear", refresh),
      map.overlays.on("load", refresh),
      map.tools.on("start", refresh),
      map.tools.on("stop", refresh),
      map.tools.on("cancel", refresh),
      map.tools.on("complete", refresh)
    ],
    [map]
  );
  const items = useMemo(() => collectGraphics(map.draw.list(), map.overlays.list()), [map, revision]);
  const [choice, setChoice] = useState(drawChoices[0].value);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<string>();
  const [pendingClear, setPendingClear] = useState<GraphicSource>();
  const [color, setColor] = useState(colors[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const [propertiesText, setPropertiesText] = useState("{}");
  const { busy, error, setError, run } = useAsyncAction();
  const selected = items.find((item) => item.key === selectedKey);
  const activeTool = map.tools.active?.id;

  useEffect(() => {
    if (selectedKey && !items.some((item) => item.key === selectedKey)) {
      setSelectedKey(undefined);
    }
  }, [items, selectedKey]);

  useEffect(() => {
    setPropertiesText(JSON.stringify(selected?.properties ?? {}, null, 2));
  }, [selected?.key, selected?.updatedAt]);

  const startDraw = () => {
    const next = drawChoices.find((item) => item.value === choice) ?? drawChoices[0];
    return run("start", () =>
      next.plotType
        ? map.tools.start(next.toolId, { type: next.plotType })
        : map.tools.start(next.toolId)
    );
  };

  const setGraphicShow = (item: GraphicItem, show: boolean) => {
    if (item.source === "draw") map.draw.setShow(item.id, show);
    else map.overlays.setShow(item.id, show);
  };
  const setGraphicLocked = (item: GraphicItem, locked: boolean) => {
    if (item.source === "draw") map.draw.setLocked(item.id, locked);
    else map.overlays.setLocked(item.id, locked);
  };
  const setGraphicEditable = (item: GraphicItem, editable: boolean) => {
    if (item.source === "draw") map.draw.setEditable(item.id, editable);
    else map.overlays.setEditable(item.id, editable);
  };
  const setGraphicStyle = (item: GraphicItem) => {
    const style = styleForColor(color, lineWidth);
    if (item.source === "draw") map.draw.setStyle(item.id, style);
    else map.overlays.setStyle(item.id, style);
  };
  const setGraphicProperties = (item: GraphicItem) => {
    try {
      const parsed = JSON.parse(propertiesText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("properties 必须是 JSON 对象");
      }
      if (item.source === "draw") {
        map.draw.setProperties(item.id, parsed as Record<string, unknown>);
      } else {
        map.overlays.setProperties(item.id, parsed as Record<string, unknown>);
      }
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const removeGraphic = (item: GraphicItem) => {
    if (item.source === "draw") map.draw.remove(item.id);
    else map.overlays.remove(item.id);
    setPendingDelete(undefined);
  };

  return (
    <div className="k3d-standard-widget">
      <WidgetError error={error} />
      <WidgetSection title="创建">
        <div className="k3d-command-row">
          <label className="k3d-field k3d-field--grow">
            <span>类型</span>
            <select value={choice} onChange={(event) => setChoice(event.currentTarget.value)}>
              {drawChoices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="k3d-icon-button k3d-icon-button--accent"
            aria-label="开始绘制"
            title="开始绘制"
            disabled={busy === "start"}
            onClick={() => void startDraw()}
          >
            <Play size={15} />
          </button>
          <button
            type="button"
            className="k3d-icon-button"
            aria-label="停止当前工具"
            title="停止"
            disabled={!activeTool}
            onClick={() => map.tools.stop()}
          >
            <Square size={14} />
          </button>
          <button
            type="button"
            className="k3d-icon-button"
            aria-label="取消当前工具"
            title="取消"
            disabled={!activeTool}
            onClick={() => map.tools.cancel()}
          >
            <Ban size={14} />
          </button>
        </div>
        <div className="k3d-tool-status">{activeTool ? `当前工具：${activeTool}` : "当前没有活动工具"}</div>
      </WidgetSection>

      <WidgetSection
        title={`对象 (${items.length})`}
        actions={
          <>
            <button type="button" className="k3d-button" onClick={() => setPendingClear("draw")}>清空绘制</button>
            <button type="button" className="k3d-button" onClick={() => setPendingClear("overlay")}>清空覆盖物</button>
          </>
        }
      >
        {pendingClear && (
          <ConfirmRow
            message={pendingClear === "draw" ? "清空全部绘制结果？" : "清空全部覆盖物？"}
            onConfirm={() => {
              if (pendingClear === "draw") map.draw.clear();
              else map.overlays.clear();
              setPendingClear(undefined);
            }}
            onCancel={() => setPendingClear(undefined)}
          />
        )}
        {items.length === 0 ? (
          <WidgetEmpty>暂无绘制或覆盖物</WidgetEmpty>
        ) : (
          <div className="k3d-standard-list">
            {items.map((item) => (
              <div key={item.key} className="k3d-standard-item">
                <button
                  type="button"
                  className={["k3d-select-row", selectedKey === item.key && "k3d-select-row--active"].filter(Boolean).join(" ")}
                  aria-pressed={selectedKey === item.key}
                  onClick={() => setSelectedKey(item.key)}
                >
                  <span><strong>{item.id}</strong><small>{item.source} · {item.type}</small></span>
                </button>
                <div className="k3d-standard-item__actions">
                  <button type="button" className="k3d-icon-button" aria-label={`${item.show ? "隐藏" : "显示"} ${item.id}`} title={item.show ? "隐藏" : "显示"} onClick={() => setGraphicShow(item, !item.show)}>
                    {item.show ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button type="button" className="k3d-icon-button k3d-icon-button--danger" aria-label={`删除 ${item.id}`} title="删除" onClick={() => setPendingDelete(item.key)}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {pendingDelete === item.key && (
                  <ConfirmRow message={`删除“${item.id}”？`} onConfirm={() => removeGraphic(item)} onCancel={() => setPendingDelete(undefined)} />
                )}
              </div>
            ))}
          </div>
        )}
      </WidgetSection>

      {selected && (
        <WidgetSection title={`编辑 ${selected.id}`}>
          <div className="k3d-toggle-grid">
            <button type="button" className="k3d-toggle-button" aria-pressed={selected.locked} onClick={() => setGraphicLocked(selected, !selected.locked)}>
              {selected.locked ? <Lock size={14} /> : <Unlock size={14} />} 锁定
            </button>
            <button type="button" className="k3d-toggle-button" aria-pressed={selected.editable} onClick={() => setGraphicEditable(selected, !selected.editable)}>
              <Check size={14} /> 可编辑
            </button>
            <button
              type="button"
              className="k3d-toggle-button"
              disabled={selected.source !== "draw" || selected.locked || !selected.editable}
              onClick={() => void run("edit", () => map.draw.edit(selected.id))}
            >
              <Edit3 size={14} /> 编辑顶点
            </button>
          </div>

          <div className="k3d-style-editor">
            <span>颜色</span>
            <div className="k3d-color-swatches">
              {colors.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="k3d-color-swatch"
                  style={{ backgroundColor: value }}
                  aria-label={`颜色 ${value}`}
                  aria-pressed={color === value}
                  onClick={() => setColor(value)}
                />
              ))}
            </div>
            <label className="k3d-field k3d-field--inline">
              <span>线宽</span>
              <input type="number" min="1" max="12" value={lineWidth} onChange={(event) => setLineWidth(Number(event.currentTarget.value))} />
            </label>
            <button type="button" className="k3d-button k3d-button--primary" onClick={() => setGraphicStyle(selected)}>应用样式</button>
          </div>

          <label className="k3d-field">
            <span>Properties JSON</span>
            <textarea rows={6} value={propertiesText} spellCheck={false} onChange={(event) => setPropertiesText(event.currentTarget.value)} />
          </label>
          <button type="button" className="k3d-button k3d-button--primary" onClick={() => setGraphicProperties(selected)}>保存属性</button>
        </WidgetSection>
      )}
    </div>
  );
}

function collectGraphics(draw: DrawResult[], overlays: Overlay[]): GraphicItem[] {
  return [
    ...draw.map((item) => ({ ...item, key: `draw:${item.id}`, source: "draw" as const })),
    ...overlays.map((item) => ({ ...item, key: `overlay:${item.id}`, source: "overlay" as const }))
  ];
}

function styleForColor(color: string, width: number): ResultSymbolStyle {
  return {
    point: { color, outlineColor: "#15191d", outlineWidth: 1, pixelSize: 10 },
    line: { color, width },
    polygon: { fillColor: `${color}55`, outlineColor: color, outlineWidth: width },
    label: { color, outlineColor: "#15191d" },
    billboard: { color },
    model: { color, silhouetteColor: color, silhouetteSize: 1 }
  };
}
