import type {
  KairosPlatformSnapshot,
  WidgetSnapshotStorageAdapter,
  WidgetSnapshotStorageRecord
} from "../types";
import { assertKairosPlatformSnapshot } from "./validation";

interface StoredSnapshot {
  record: WidgetSnapshotStorageRecord;
  snapshot: KairosPlatformSnapshot;
}

export function createMemoryWidgetSnapshotStorage(): WidgetSnapshotStorageAdapter {
  const snapshots = new Map<string, StoredSnapshot>();

  return {
    async save(id, snapshot, options) {
      assertStorageId(id);
      assertKairosPlatformSnapshot(snapshot);
      const existing = snapshots.get(id);
      const now = new Date().toISOString();
      snapshots.set(id, {
        record: {
          id,
          name: options?.name ?? existing?.record.name,
          createdAt: existing?.record.createdAt ?? now,
          updatedAt: existing ? now : undefined
        },
        snapshot: clonePlatformSnapshot(snapshot)
      });
    },
    async load(id) {
      assertStorageId(id);
      const stored = snapshots.get(id);
      return stored ? clonePlatformSnapshot(stored.snapshot) : undefined;
    },
    async remove(id) {
      assertStorageId(id);
      return snapshots.delete(id);
    },
    async list() {
      return [...snapshots.values()].map(({ record }) => ({ ...record }));
    }
  };
}

function clonePlatformSnapshot(snapshot: KairosPlatformSnapshot): KairosPlatformSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as KairosPlatformSnapshot;
}

function assertStorageId(id: string): void {
  if (id.trim().length === 0) {
    throw new Error("Widget snapshot id must not be empty.");
  }
}
