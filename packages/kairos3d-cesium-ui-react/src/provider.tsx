import { createMap, type KairosMap } from "@kairos3d/cesium/core";
import {
  createWidgetPlatform,
  type WidgetPlatform
} from "@kairos3d/cesium-widget";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { KairosProviderContext } from "./provider-context";
import { ReactWidgetRegistry } from "./registry";
import type {
  KairosMapProviderProps,
  KairosMapState,
  KairosMapViewportProps
} from "./types";

interface OwnedRuntime {
  map: KairosMap;
  platform: WidgetPlatform;
  registry: ReactWidgetRegistry;
  ownsMap: boolean;
  ownsPlatform: boolean;
}

const initialState: KairosMapState = { status: "idle" };

export function KairosMapProvider({
  children,
  ...props
}: PropsWithChildren<KairosMapProviderProps>) {
  const mode: "create" | "external" =
    "createOptions" in props ? "create" : "external";
  const latestProps = useLatestRef(props);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<KairosMapState>(initialState);

  useEffect(() => {
    if (mode === "create" && !viewportElement) {
      setState(initialState);
      return;
    }

    let cancelled = false;
    let runtime: OwnedRuntime | undefined;

    const initialize = async () => {
      setState({ status: "creating" });
      try {
        const current = latestProps.current;
        let map: KairosMap;
        let ownsMap = false;
        if ("createOptions" in current) {
          if (!viewportElement) {
            return;
          }
          map = await createMap({ ...current.createOptions, container: viewportElement });
          ownsMap = true;
        } else {
          map = current.map;
        }

        const ownsPlatform = !("platform" in current && current.platform);
        const platform =
          "platform" in current && current.platform
            ? current.platform
            : createWidgetPlatform({ map, snapshotStorage: current.snapshotStorage });
        const registry = new ReactWidgetRegistry(platform);
        runtime = { map, platform, registry, ownsMap, ownsPlatform };

        for (const module of current.modules ?? []) {
          registry.register(module);
        }

        if (cancelled) {
          await disposeRuntime(runtime);
          runtime = undefined;
          return;
        }

        const readyState = { map, platform, registry };
        setState({ status: "ready", ...readyState });
        current.onReady?.(readyState);
      } catch (cause) {
        const error = toError(cause);
        if (runtime) {
          await disposeRuntime(runtime).catch(() => undefined);
          runtime = undefined;
        }
        if (!cancelled) {
          setState({ status: "error", error });
          latestProps.current.onError?.(error);
        }
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      const currentRuntime = runtime;
      runtime = undefined;
      if (currentRuntime) {
        void disposeRuntime(currentRuntime).catch((cause) => {
          latestProps.current.onError?.(toError(cause));
        });
      }
    };
  }, [mode, viewportElement, "map" in props ? props.map : undefined, "platform" in props ? props.platform : undefined, latestProps]);

  const context = useMemo(
    () => ({ mode, state, setViewportElement }),
    [mode, state]
  );

  return (
    <KairosProviderContext.Provider value={context}>
      {children}
    </KairosProviderContext.Provider>
  );
}

export function KairosMapViewport({
  className,
  style,
  "aria-label": ariaLabel = "Kairos3D map"
}: KairosMapViewportProps) {
  const context = useRequiredProviderContext();
  const setElement = useCallback(
    (element: HTMLDivElement | null) => context.setViewportElement(element),
    [context.setViewportElement]
  );

  if (context.mode !== "create") {
    throw new Error("KairosMapViewport is only available in createOptions mode.");
  }

  return (
    <div
      ref={setElement}
      className={["k3d-map-viewport", className].filter(Boolean).join(" ")}
      style={style}
      role="application"
      aria-label={ariaLabel}
    />
  );
}

export function useRequiredProviderContext() {
  const context = useContext(KairosProviderContext);
  if (!context) {
    throw new Error("Kairos React hooks must be used inside KairosMapProvider.");
  }
  return context;
}

async function disposeRuntime(runtime: OwnedRuntime): Promise<void> {
  const errors: unknown[] = [];
  try {
    await runtime.registry.destroy();
  } catch (error) {
    errors.push(error);
  }
  if (runtime.ownsPlatform) {
    try {
      await runtime.platform.destroy();
    } catch (error) {
      errors.push(error);
    }
  }
  if (runtime.ownsMap) {
    try {
      runtime.map.destroy();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "Kairos React runtime failed to dispose cleanly.");
  }
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
