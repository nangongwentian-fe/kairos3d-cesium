import type { KairosMap } from "@kairos3d/cesium/core";
import type { WidgetPlatform, WidgetState } from "@kairos3d/cesium-widget";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRequiredProviderContext } from "./provider";
import type { ReactWidgetRegistry } from "./registry";
import type { AnyReactWidgetModule, KairosMapState } from "./types";

export function useKairosMapState(): KairosMapState {
  return useRequiredProviderContext().state;
}

export function useKairosMap(): KairosMap {
  const state = useKairosMapState();
  if (state.status !== "ready" || !state.map) {
    throw new Error(`KairosMap is not ready (current status: ${state.status}).`);
  }
  return state.map;
}

export function useWidgetPlatform(): WidgetPlatform {
  const state = useKairosMapState();
  if (state.status !== "ready" || !state.platform) {
    throw new Error(`WidgetPlatform is not ready (current status: ${state.status}).`);
  }
  return state.platform;
}

export function useReactWidgetRegistry(): ReactWidgetRegistry {
  const state = useKairosMapState();
  if (state.status !== "ready" || !state.registry) {
    throw new Error(`ReactWidgetRegistry is not ready (current status: ${state.status}).`);
  }
  return state.registry;
}

export function useReactWidgetModules(): readonly AnyReactWidgetModule[] {
  const registry = useReactWidgetRegistry();
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot
  );
}

export function useWidgetStates(): readonly WidgetState[] {
  const platform = useWidgetPlatform();
  const [states, setStates] = useState<readonly WidgetState[]>(() => platform.list());

  useEffect(() => {
    const update = () => setStates(platform.list());
    const off = [
      platform.on("register", update),
      platform.on("unregister", update),
      platform.on("status-change", update),
      platform.on("placement-change", update),
      platform.on("load", update)
    ];
    update();
    return () => {
      for (const unsubscribe of off) {
        unsubscribe();
      }
    };
  }, [platform]);

  return states;
}
