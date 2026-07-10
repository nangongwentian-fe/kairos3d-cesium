import type { KairosMap } from "@kairos3d/cesium/core";
import type {
  SceneSnapshot,
  SceneStateLoadOptions,
  SceneStateSnapshotOptions
} from "@kairos3d/cesium/scene";
import type { WidgetPlatform } from "./platform";

export type WidgetStatus =
  | "inactive"
  | "activating"
  | "active"
  | "deactivating"
  | "error";

export type WidgetRegion = "left" | "right" | "bottom" | "floating";
export type WidgetOperation = "create" | "activate" | "deactivate" | "destroy" | "load";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface WidgetFloatingPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WidgetPlacement {
  region: WidgetRegion;
  order?: number;
  width?: number;
  height?: number;
  collapsed?: boolean;
  floating?: WidgetFloatingPlacement;
}

export interface WidgetContext {
  readonly map: KairosMap;
  readonly platform: WidgetPlatform;
  readonly signal: AbortSignal;
}

export interface WidgetController {
  activate(): void | Promise<void>;
  deactivate(): void | Promise<void>;
  destroy(): void | Promise<void>;
  toJSON?(): unknown;
  load?(state: JsonValue): void | Promise<void>;
}

export interface WidgetDefinition<TOptions = unknown> {
  id: string;
  name: string;
  group?: string;
  exclusiveGroup?: string;
  defaultPlacement?: WidgetPlacement;
  create(
    context: WidgetContext,
    options?: TOptions
  ): WidgetController | Promise<WidgetController>;
}

export interface WidgetState {
  id: string;
  name: string;
  group?: string;
  exclusiveGroup?: string;
  status: WidgetStatus;
  active: boolean;
  placement?: WidgetPlacement;
  error?: Error;
}

export interface WidgetStatusChangeEvent {
  id: string;
  previous: WidgetStatus;
  status: WidgetStatus;
}

export interface WidgetErrorEvent {
  id: string;
  operation: WidgetOperation;
  error: Error;
}

export interface WidgetPlatformEvents {
  register: { state: WidgetState };
  unregister: { id: string };
  "status-change": WidgetStatusChangeEvent;
  activate: { state: WidgetState };
  deactivate: { state: WidgetState };
  error: WidgetErrorEvent;
  "placement-change": { id: string; placement?: WidgetPlacement };
  load: { snapshot: WidgetWorkspaceSnapshot };
}

export interface WidgetWorkspaceSnapshot {
  version: 1;
  activeWidgetIds: string[];
  placements: Record<string, WidgetPlacement>;
  states: Record<string, JsonValue>;
  createdAt: string;
}

export interface WidgetWorkspaceLoadOptions {
  strict?: boolean;
}

export interface KairosPlatformSnapshot {
  version: 1;
  scene: SceneSnapshot;
  workspace: WidgetWorkspaceSnapshot;
  createdAt: string;
}

export interface KairosPlatformSnapshotOptions {
  scene?: SceneStateSnapshotOptions;
}

export interface KairosPlatformLoadOptions {
  scene?: SceneStateLoadOptions;
  workspace?: WidgetWorkspaceLoadOptions;
}

export interface WidgetSnapshotStorageRecord {
  id: string;
  name?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface WidgetSnapshotStorageAdapter {
  save(
    id: string,
    snapshot: KairosPlatformSnapshot,
    options?: { name?: string }
  ): Promise<void>;
  load(id: string): Promise<KairosPlatformSnapshot | undefined>;
  remove(id: string): Promise<boolean>;
  list(): Promise<WidgetSnapshotStorageRecord[]>;
}

export interface WidgetPlatformOptions {
  map: KairosMap;
  snapshotStorage?: WidgetSnapshotStorageAdapter;
}

export interface WidgetSnapshotSaveOptions extends KairosPlatformSnapshotOptions {
  name?: string;
}
