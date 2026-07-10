import { parseSceneSnapshot, type SceneSnapshot } from "../scene";
import type { SnapshotStorageAdapter, SnapshotStorageRecord } from "./types";

interface StoredSnapshot {
  record: SnapshotStorageRecord;
  snapshot: SceneSnapshot;
}

export function createMemorySnapshotStorage(): SnapshotStorageAdapter {
  const snapshots = new Map<string, StoredSnapshot>();

  return {
    async save(id, snapshot, options) {
      const parsed = parseSceneSnapshot(snapshot);
      const existing = snapshots.get(id);
      const now = new Date().toISOString();
      snapshots.set(id, {
        record: {
          id,
          name: options?.name ?? existing?.record.name,
          createdAt: existing?.record.createdAt ?? now,
          updatedAt: existing ? now : undefined
        },
        snapshot: parsed
      });
    },
    async load(id) {
      const item = snapshots.get(id);
      return item ? parseSceneSnapshot(item.snapshot) : undefined;
    },
    async remove(id) {
      return snapshots.delete(id);
    },
    async list() {
      return [...snapshots.values()].map((item) => ({ ...item.record }));
    }
  };
}

export function createLocalStorageSnapshotStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  keyPrefix = "kairos3d:scene-snapshot:"
): SnapshotStorageAdapter {
  const indexKey = `${keyPrefix}index`;

  return {
    async save(id, snapshot, options) {
      const parsed = parseSceneSnapshot(snapshot);
      const records = readIndex(storage, indexKey);
      const existing = records.find((record) => record.id === id);
      const now = new Date().toISOString();
      const record: SnapshotStorageRecord = {
        id,
        name: options?.name ?? existing?.name,
        createdAt: existing?.createdAt ?? now,
        updatedAt: existing ? now : undefined
      };
      storage.setItem(`${keyPrefix}${id}`, JSON.stringify(parsed));
      writeIndex(storage, indexKey, [record, ...records.filter((item) => item.id !== id)]);
    },
    async load(id) {
      const raw = storage.getItem(`${keyPrefix}${id}`);
      return raw ? parseSceneSnapshot(JSON.parse(raw) as unknown) : undefined;
    },
    async remove(id) {
      const records = readIndex(storage, indexKey);
      const next = records.filter((record) => record.id !== id);
      storage.removeItem(`${keyPrefix}${id}`);
      writeIndex(storage, indexKey, next);
      return next.length !== records.length;
    },
    async list() {
      return readIndex(storage, indexKey);
    }
  };
}

function readIndex(
  storage: Pick<Storage, "getItem">,
  indexKey: string
): SnapshotStorageRecord[] {
  const raw = storage.getItem(indexKey);
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw) as SnapshotStorageRecord[];
  return Array.isArray(parsed) ? parsed : [];
}

function writeIndex(
  storage: Pick<Storage, "setItem">,
  indexKey: string,
  records: SnapshotStorageRecord[]
): void {
  storage.setItem(indexKey, JSON.stringify(records));
}
