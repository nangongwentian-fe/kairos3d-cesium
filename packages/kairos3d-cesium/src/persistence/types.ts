import type { SceneSnapshot } from "../scene";

export interface SnapshotStorageRecord {
  id: string;
  name?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SnapshotStorageAdapter {
  save(id: string, snapshot: SceneSnapshot, options?: { name?: string }): Promise<void>;
  load(id: string): Promise<SceneSnapshot | undefined>;
  remove(id: string): Promise<boolean>;
  list(): Promise<SnapshotStorageRecord[]>;
}
