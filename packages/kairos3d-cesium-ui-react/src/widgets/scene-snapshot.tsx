import type { WidgetSnapshotStorageRecord } from "@kairos3d/cesium-widget";
import { Download, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactWidgetProps } from "../types";
import {
  ConfirmRow,
  useAsyncAction,
  useMountedRef,
  WidgetEmpty,
  WidgetError,
  WidgetSection
} from "./shared";

interface PendingSnapshotAction {
  type: "load" | "remove";
  id: string;
}

export function SceneSnapshotWidget({ platform }: ReactWidgetProps) {
  const storageAvailable = platform.hasSnapshotStorage();
  const mounted = useMountedRef();
  const [records, setRecords] = useState<WidgetSnapshotStorageRecord[]>([]);
  const [name, setName] = useState("");
  const [pending, setPending] = useState<PendingSnapshotAction>();
  const { busy, error, run } = useAsyncAction();

  const refresh = useCallback(async () => {
    if (!storageAvailable) {
      return;
    }
    const next = await platform.listSnapshots();
    if (mounted.current) {
      setRecords(next);
    }
  }, [mounted, platform, storageAvailable]);

  useEffect(() => {
    if (!storageAvailable) {
      return;
    }
    const update = () => void refresh();
    const off = [
      platform.on("snapshot-save", update),
      platform.on("snapshot-load", update),
      platform.on("snapshot-remove", update)
    ];
    void refresh();
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [platform, refresh, storageAvailable]);

  if (!storageAvailable) {
    return (
      <div className="k3d-standard-widget">
        <WidgetEmpty>当前 Widget Platform 未配置快照存储</WidgetEmpty>
      </div>
    );
  }

  const save = () => {
    const id = `snapshot-${Date.now()}`;
    const snapshotName = name.trim() || `场景快照 ${new Date().toLocaleString("zh-CN")}`;
    return run("save", async () => {
      await platform.saveSnapshot(id, {
        name: snapshotName,
        scene: {
          includeResults: true,
          includePrimitives: true,
          includeOverlays: true
        }
      });
      setName("");
    });
  };

  const load = (id: string) =>
    run(`load-${id}`, () =>
      platform.loadSnapshot(id, {
        scene: {
          clearLayers: true,
          flyToCamera: true,
          restoreResults: true,
          clearResults: true,
          restorePrimitives: true,
          clearPrimitives: true,
          restoreOverlays: true,
          clearOverlays: true
        },
        workspace: { strict: false }
      })
    );

  const remove = (id: string) =>
    run(`remove-${id}`, () => platform.removeSnapshot(id));

  return (
    <div className="k3d-standard-widget">
      <WidgetError error={error} />
      <WidgetSection title="保存当前工作区">
        <form
          className="k3d-command-row"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="k3d-field k3d-field--grow">
            <span>名称</span>
            <input value={name} maxLength={80} placeholder="场景快照名称" onChange={(event) => setName(event.currentTarget.value)} />
          </label>
          <button type="submit" className="k3d-icon-button k3d-icon-button--accent" aria-label="保存场景快照" title="保存" disabled={busy === "save"}>
            <Save size={15} />
          </button>
        </form>
        <p className="k3d-standard-note">包含相机、图层、书签、绘制、分析、Primitive、Overlay 和 Widget 布局。</p>
      </WidgetSection>

      <WidgetSection title={`已保存 (${records.length})`} actions={<button type="button" className="k3d-icon-button" aria-label="刷新快照列表" title="刷新" onClick={() => void run("refresh", refresh)}><RotateCcw size={14} /></button>}>
        {records.length === 0 ? (
          <WidgetEmpty>暂无已保存快照</WidgetEmpty>
        ) : (
          <div className="k3d-standard-list">
            {records.map((record) => (
              <div key={record.id} className="k3d-standard-item">
                <div className="k3d-standard-item__text">
                  <strong>{record.name ?? record.id}</strong>
                  <span>{formatDate(record.updatedAt ?? record.createdAt)}</span>
                </div>
                <div className="k3d-standard-item__actions">
                  <button type="button" className="k3d-icon-button" aria-label={`恢复 ${record.name ?? record.id}`} title="恢复" disabled={busy === `load-${record.id}`} onClick={() => setPending({ type: "load", id: record.id })}><Download size={14} /></button>
                  <button type="button" className="k3d-icon-button k3d-icon-button--danger" aria-label={`删除 ${record.name ?? record.id}`} title="删除" disabled={busy === `remove-${record.id}`} onClick={() => setPending({ type: "remove", id: record.id })}><Trash2 size={14} /></button>
                </div>
                {pending?.id === record.id && (
                  <ConfirmRow
                    message={pending.type === "load" ? `恢复“${record.name ?? record.id}”并替换当前工作区？` : `删除“${record.name ?? record.id}”？`}
                    confirmLabel={pending.type === "load" ? "恢复" : "删除"}
                    onConfirm={() => {
                      const action = pending.type === "load" ? load(record.id) : remove(record.id);
                      setPending(undefined);
                      void action;
                    }}
                    onCancel={() => setPending(undefined)}
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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}
