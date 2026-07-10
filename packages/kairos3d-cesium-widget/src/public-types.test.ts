import type { KairosMap } from "@kairos3d/cesium/core";
import { describe, expectTypeOf, it } from "vitest";
import type {
  KairosPlatformSnapshot,
  WidgetContext,
  WidgetController,
  WidgetDefinition,
  WidgetPlacement,
  WidgetPlatformEvents,
  WidgetRegion,
  WidgetSnapshotStorageAdapter,
  WidgetState,
  WidgetStatus,
  WidgetWorkspaceSnapshot
} from "./index";
import type { WidgetPlatform } from "./platform";

describe("public widget types", () => {
  it("exposes stable lifecycle and placement contracts", () => {
    expectTypeOf<WidgetStatus>().toEqualTypeOf<
      "inactive" | "activating" | "active" | "deactivating" | "error"
    >();
    expectTypeOf<WidgetRegion>().toEqualTypeOf<"left" | "right" | "bottom" | "floating">();
    expectTypeOf<WidgetPlacement>().toMatchTypeOf<{
      region: WidgetRegion;
      order?: number;
      width?: number;
      height?: number;
      collapsed?: boolean;
    }>();
    expectTypeOf<WidgetState>().toMatchTypeOf<{
      id: string;
      name: string;
      status: WidgetStatus;
      active: boolean;
      placement?: WidgetPlacement;
    }>();
  });

  it("exposes framework-neutral widget definitions", () => {
    expectTypeOf<WidgetContext>().toMatchTypeOf<{
      map: KairosMap;
      platform: WidgetPlatform;
      signal: AbortSignal;
    }>();
    expectTypeOf<WidgetController>().toMatchTypeOf<{
      activate: () => void | Promise<void>;
      deactivate: () => void | Promise<void>;
      destroy: () => void | Promise<void>;
    }>();
    expectTypeOf<WidgetDefinition<{ mode: string }>[
      "create"
    ]>().toMatchTypeOf<
      (
        context: WidgetContext,
        options?: { mode: string }
      ) => WidgetController | Promise<WidgetController>
    >();
    expectTypeOf<WidgetPlatformEvents["error"]>().toMatchTypeOf<{
      id: string;
      operation: "create" | "activate" | "deactivate" | "destroy" | "load";
      error: Error;
    }>();
    expectTypeOf<WidgetPlatformEvents["snapshot-remove"]>().toEqualTypeOf<{
      id: string;
      removed: boolean;
    }>();
  });

  it("exposes data-only workspace and platform snapshots", () => {
    expectTypeOf<WidgetWorkspaceSnapshot>().toMatchTypeOf<{
      version: 1;
      activeWidgetIds: string[];
      placements: Record<string, WidgetPlacement>;
      states: Record<string, import("./index").JsonValue>;
      createdAt: string;
    }>();
    expectTypeOf<KairosPlatformSnapshot>().toMatchTypeOf<{
      version: 1;
      scene: import("@kairos3d/cesium/scene").SceneSnapshot;
      workspace: WidgetWorkspaceSnapshot;
      createdAt: string;
    }>();
    expectTypeOf<WidgetSnapshotStorageAdapter>().toMatchTypeOf<{
      save: (id: string, snapshot: KairosPlatformSnapshot, options?: { name?: string }) => Promise<void>;
      load: (id: string) => Promise<KairosPlatformSnapshot | undefined>;
      remove: (id: string) => Promise<boolean>;
    }>();
  });
});
