import type { LayerState } from "@kairos3d/cesium/layers";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Focus,
  Trash2
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

export function LayerManagerWidget({ map }: ReactWidgetProps) {
  const revision = useManagerRevision(
    (refresh) => [
      map.layers.on("add", refresh),
      map.layers.on("remove", refresh),
      map.layers.on("clear", refresh),
      map.layers.on("update", refresh),
      map.layers.on("move", refresh),
      map.layers.on("load", refresh)
    ],
    [map]
  );
  const layers = useMemo(() => map.layers.listState(), [map, revision]);
  const groups = useMemo(() => groupLayers(layers), [layers]);
  const [pendingDelete, setPendingDelete] = useState<string>();
  const { busy, error, run } = useAsyncAction();

  const reorder = (id: string, direction: -1 | 1) => {
    const ordered = map.layers.listState();
    const index = ordered.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    ordered.forEach((layer, order) => map.layers.move(layer.id, order));
  };

  return (
    <div className="k3d-standard-widget">
      <WidgetError error={error} />
      {layers.length === 0 ? (
        <WidgetEmpty>当前场景没有图层</WidgetEmpty>
      ) : (
        groups.map(([group, items]) => {
          const groupVisible = items.every((layer) => layer.show);
          return (
            <WidgetSection
              key={group}
              title={group}
              actions={
                <button
                  type="button"
                  className="k3d-icon-button"
                  aria-label={groupVisible ? `隐藏 ${group}` : `显示 ${group}`}
                  title={groupVisible ? "隐藏分组" : "显示分组"}
                  onClick={() => items.forEach((layer) => map.layers.setShow(layer.id, !groupVisible))}
                >
                  {groupVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              }
            >
              <div className="k3d-standard-list">
                {items.map((layer) => {
                  const globalIndex = layers.findIndex((item) => item.id === layer.id);
                  return (
                    <div key={layer.id} className="k3d-standard-item">
                      <div className="k3d-standard-item__main">
                        <button
                          type="button"
                          className="k3d-icon-button"
                          aria-label={layer.show ? `隐藏 ${layer.name ?? layer.id}` : `显示 ${layer.name ?? layer.id}`}
                          title={layer.show ? "隐藏" : "显示"}
                          onClick={() => map.layers.toggle(layer.id)}
                        >
                          {layer.show ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                        <div className="k3d-standard-item__text">
                          <strong>{layer.name ?? layer.id}</strong>
                          <span>{layer.type} · order {layer.order}</span>
                        </div>
                        <div className="k3d-standard-item__actions">
                          <button
                            type="button"
                            className="k3d-icon-button"
                            aria-label={`上移 ${layer.name ?? layer.id}`}
                            title="上移"
                            disabled={globalIndex === 0}
                            onClick={() => reorder(layer.id, -1)}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="k3d-icon-button"
                            aria-label={`下移 ${layer.name ?? layer.id}`}
                            title="下移"
                            disabled={globalIndex === layers.length - 1}
                            onClick={() => reorder(layer.id, 1)}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className="k3d-icon-button"
                            aria-label={`定位 ${layer.name ?? layer.id}`}
                            title="定位"
                            disabled={busy === `fly-${layer.id}`}
                            onClick={() => void run(`fly-${layer.id}`, () => map.layers.flyTo(layer.id))}
                          >
                            <Focus size={14} />
                          </button>
                          <button
                            type="button"
                            className="k3d-icon-button k3d-icon-button--danger"
                            aria-label={`删除 ${layer.name ?? layer.id}`}
                            title="删除"
                            onClick={() => setPendingDelete(layer.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {layer.opacity !== undefined && (
                        <label className="k3d-slider-row">
                          <span>透明度</span>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={layer.opacity}
                            onChange={(event) =>
                              map.layers.setOpacity(layer.id, Number(event.currentTarget.value))
                            }
                          />
                          <output>{Math.round(layer.opacity * 100)}%</output>
                        </label>
                      )}
                      {pendingDelete === layer.id && (
                        <ConfirmRow
                          message={`删除图层“${layer.name ?? layer.id}”？`}
                          onConfirm={() => {
                            map.layers.remove(layer.id);
                            setPendingDelete(undefined);
                          }}
                          onCancel={() => setPendingDelete(undefined)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </WidgetSection>
          );
        })
      )}
    </div>
  );
}

function groupLayers(layers: LayerState[]): Array<[string, LayerState[]]> {
  const groups = new Map<string, LayerState[]>();
  for (const layer of layers) {
    const group = layer.group || "未分组";
    const items = groups.get(group) ?? [];
    items.push(layer);
    groups.set(group, items);
  }
  return [...groups.entries()];
}
