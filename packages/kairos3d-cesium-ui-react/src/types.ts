import type { CreateMapOptions, KairosMap } from "@kairos3d/cesium/core";
import type {
  WidgetController,
  WidgetDefinition,
  WidgetPlacement,
  WidgetPlatform,
  WidgetSnapshotStorageAdapter,
  WidgetState
} from "@kairos3d/cesium-widget";
import type { Cartesian3 } from "cesium";
import type { LucideIcon } from "lucide-react";
import type {
  ComponentType,
  CSSProperties,
  LazyExoticComponent,
  ReactNode
} from "react";
import type { ReactWidgetRegistry } from "./registry";

export type KairosMapStatus = "idle" | "creating" | "ready" | "error";
export type KairosWidgetTheme = "light" | "dark";

export interface KairosMapState {
  status: KairosMapStatus;
  map?: KairosMap;
  platform?: WidgetPlatform;
  registry?: ReactWidgetRegistry;
  error?: Error;
}

export interface ReactWidgetProps {
  map: KairosMap;
  platform: WidgetPlatform;
  registry: ReactWidgetRegistry;
  state: WidgetState;
  close(): Promise<void>;
  setPlacement(placement: WidgetPlacement): WidgetState;
}

export interface ReactWidgetToolbarOptions {
  label?: string;
  order?: number;
  hidden?: boolean;
}

export type ReactWidgetComponent =
  | ComponentType<ReactWidgetProps>
  | LazyExoticComponent<ComponentType<ReactWidgetProps>>;

export interface ReactWidgetModule<TOptions = unknown>
  extends Omit<WidgetDefinition<TOptions>, "create"> {
  component: ReactWidgetComponent;
  icon?: LucideIcon;
  toolbar?: ReactWidgetToolbarOptions;
  create?: (
    context: Parameters<WidgetDefinition<TOptions>["create"]>[0],
    options?: TOptions
  ) => WidgetController | Promise<WidgetController>;
}

export type AnyReactWidgetModule = ReactWidgetModule<any>;

interface KairosMapProviderCommonProps {
  children?: ReactNode;
  modules?: readonly AnyReactWidgetModule[];
  snapshotStorage?: WidgetSnapshotStorageAdapter;
  onReady?(state: Required<Pick<KairosMapState, "map" | "platform" | "registry">>): void;
  onError?(error: Error): void;
}

export interface KairosMapProviderCreateProps extends KairosMapProviderCommonProps {
  createOptions: Omit<CreateMapOptions, "container">;
  map?: never;
  platform?: never;
}

export interface KairosMapProviderExternalProps extends KairosMapProviderCommonProps {
  map: KairosMap;
  platform?: WidgetPlatform;
  createOptions?: never;
}

export type KairosMapProviderProps =
  | KairosMapProviderCreateProps
  | KairosMapProviderExternalProps;

export interface KairosMapViewportProps {
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

export interface KairosWidgetShellProps {
  children?: ReactNode;
  className?: string;
  theme?: KairosWidgetTheme;
}

export interface KairosWidgetToolbarProps {
  className?: string;
  "aria-label"?: string;
}

export interface KairosWidgetHostProps {
  className?: string;
  empty?: ReactNode;
}

export type KairosPopupAnchor =
  | { type: "screen"; x: number; y: number }
  | { type: "world"; position: Cartesian3 };

export interface KairosPopup {
  id: string;
  anchor: KairosPopupAnchor;
  content: ReactNode;
  offset?: readonly [number, number];
  className?: string;
  ariaLabel?: string;
  closeLabel?: string;
}

export interface KairosPopupController {
  open(popup: KairosPopup): void;
  close(id: string): boolean;
  clear(): void;
  list(): readonly KairosPopup[];
}
