export { createWidgetPlatform, WidgetPlatform } from "./platform";
export { createMemoryWidgetSnapshotStorage } from "./snapshot/storage";
export {
  assertKairosPlatformSnapshot,
  assertWidgetPlacement,
  assertWidgetWorkspaceSnapshot
} from "./snapshot/validation";
export type {
  JsonPrimitive,
  JsonValue,
  KairosPlatformLoadOptions,
  KairosPlatformSnapshot,
  KairosPlatformSnapshotOptions,
  WidgetContext,
  WidgetController,
  WidgetDefinition,
  WidgetErrorEvent,
  WidgetFloatingPlacement,
  WidgetOperation,
  WidgetPlacement,
  WidgetPlatformEvents,
  WidgetPlatformOptions,
  WidgetRegion,
  WidgetSnapshotSaveOptions,
  WidgetSnapshotStorageAdapter,
  WidgetSnapshotStorageRecord,
  WidgetState,
  WidgetStatus,
  WidgetStatusChangeEvent,
  WidgetWorkspaceLoadOptions,
  WidgetWorkspaceSnapshot
} from "./types";
