import { Math as CesiumMath } from "cesium";
import { Eraser, MapPin } from "lucide-react";
import { useMemo } from "react";
import type { ReactWidgetProps } from "../types";
import {
  formatUnknown,
  useManagerRevision,
  WidgetEmpty,
  WidgetSection
} from "./shared";

export function FeatureInspectorWidget({ map }: ReactWidgetProps) {
  const revision = useManagerRevision(
    (refresh) => [map.selection.on("change", refresh), map.picking.on("pick", refresh)],
    [map]
  );
  const selection = useMemo(() => map.selection.get(), [map, revision]);
  const result = selection.result;

  if (!result) {
    return (
      <div className="k3d-standard-widget">
        <WidgetEmpty>点击地图对象查看属性</WidgetEmpty>
      </div>
    );
  }

  const coordinate = result.cartographic
    ? `${CesiumMath.toDegrees(result.cartographic.longitude).toFixed(6)}, ${CesiumMath.toDegrees(result.cartographic.latitude).toFixed(6)}, ${result.cartographic.height.toFixed(2)} m`
    : undefined;

  return (
    <div className="k3d-standard-widget">
      <WidgetSection
        title={result.name ?? result.id}
        actions={
          <button
            type="button"
            className="k3d-icon-button"
            aria-label="清空选择"
            title="清空选择"
            onClick={() => map.selection.clear()}
          >
            <Eraser size={15} />
          </button>
        }
      >
        <dl className="k3d-definition-list">
          <div><dt>类型</dt><dd>{result.type}</dd></div>
          <div><dt>来源</dt><dd>{result.source ?? "场景对象"}</dd></div>
          {result.layerId && <div><dt>图层</dt><dd>{result.layerId}</dd></div>}
          {result.overlayId && <div><dt>覆盖物</dt><dd>{result.overlayId}</dd></div>}
          <div><dt>高亮</dt><dd>{selection.highlighted ? "是" : "否"}</dd></div>
        </dl>
      </WidgetSection>

      {coordinate && (
        <WidgetSection title="坐标">
          <div className="k3d-coordinate-row">
            <MapPin size={15} aria-hidden="true" />
            <code>{coordinate}</code>
          </div>
        </WidgetSection>
      )}

      <WidgetSection title="属性">
        {Object.keys(result.properties).length === 0 ? (
          <WidgetEmpty>没有可显示的属性</WidgetEmpty>
        ) : (
          <dl className="k3d-property-list">
            {Object.entries(result.properties).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd><pre>{formatUnknown(value)}</pre></dd>
              </div>
            ))}
          </dl>
        )}
      </WidgetSection>
    </div>
  );
}
