export { createMemoryWidgetSnapshotStorage } from "./storage";
export {
  assertKairosPlatformSnapshot,
  assertWidgetPlacement,
  assertWidgetWorkspaceSnapshot,
  cloneJsonValue,
  clonePlacement
} from "./validation";
export type {
  JsonPrimitive,
  JsonValue,
  KairosPlatformLoadOptions,
  KairosPlatformSnapshot,
  KairosPlatformSnapshotOptions,
  WidgetSnapshotSaveOptions,
  WidgetSnapshotStorageAdapter,
  WidgetSnapshotStorageRecord,
  WidgetWorkspaceLoadOptions,
  WidgetWorkspaceSnapshot
} from "../types";
