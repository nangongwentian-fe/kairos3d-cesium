import type { WidgetPlacement, WidgetState } from "@kairos3d/cesium-widget";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  PanelTop,
  X
} from "lucide-react";
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import {
  useKairosMapState,
  useReactWidgetModules,
  useReactWidgetRegistry,
  useWidgetPlatform,
  useWidgetStates
} from "./hooks";
import { KairosPopupHost, KairosPopupProvider } from "./popup";
import type {
  AnyReactWidgetModule,
  KairosWidgetHostProps,
  KairosWidgetShellProps,
  KairosWidgetToolbarProps,
  ReactWidgetProps
} from "./types";

interface WidgetRenderEntry {
  module: AnyReactWidgetModule;
  state: WidgetState;
  placement: WidgetPlacement;
}

export function KairosWidgetShell({
  children,
  className,
  theme = "dark"
}: KairosWidgetShellProps) {
  return (
    <KairosPopupProvider>
      <div
        className={["k3d-shell", className].filter(Boolean).join(" ")}
        data-k3d-theme={theme}
      >
        {children}
        <KairosPopupHost />
      </div>
    </KairosPopupProvider>
  );
}

export function KairosWidgetToolbar(props: KairosWidgetToolbarProps) {
  const state = useKairosMapState();
  return state.status === "ready" ? <ReadyWidgetToolbar {...props} /> : null;
}

function ReadyWidgetToolbar({
  className,
  "aria-label": ariaLabel = "地图工具"
}: KairosWidgetToolbarProps) {
  const platform = useWidgetPlatform();
  const modules = useReactWidgetModules();
  const states = useWidgetStates();
  const stateById = useMemo(
    () => new Map(states.map((state) => [state.id, state])),
    [states]
  );
  const visibleModules = useMemo(
    () =>
      [...modules]
        .filter((module) => !module.toolbar?.hidden)
        .sort(
          (a, b) =>
            (a.toolbar?.order ?? a.defaultPlacement?.order ?? 0) -
            (b.toolbar?.order ?? b.defaultPlacement?.order ?? 0)
        ),
    [modules]
  );

  return (
    <div
      className={["k3d-toolbar", className].filter(Boolean).join(" ")}
      role="toolbar"
      aria-label={ariaLabel}
    >
      {visibleModules.map((module) => {
        const state = stateById.get(module.id);
        const Icon = module.icon ?? PanelTop;
        const label = module.toolbar?.label ?? module.name;
        return (
          <button
            key={module.id}
            type="button"
            className="k3d-icon-button k3d-toolbar__button"
            aria-label={label}
            aria-pressed={state?.active ?? false}
            aria-controls={`k3d-widget-${module.id}`}
            title={label}
            disabled={state?.status === "activating" || state?.status === "deactivating"}
            onClick={() => void platform.toggle(module.id).catch(() => undefined)}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
}

export function KairosWidgetHost(props: KairosWidgetHostProps) {
  const state = useKairosMapState();
  return state.status === "ready" ? <ReadyWidgetHost {...props} /> : null;
}

function ReadyWidgetHost({ className, empty = null }: KairosWidgetHostProps) {
  const modules = useReactWidgetModules();
  const states = useWidgetStates();
  const moduleById = useMemo(
    () => new Map(modules.map((module) => [module.id, module])),
    [modules]
  );
  const entries = useMemo(
    () =>
      states
        .filter((state) => state.active)
        .map((state): WidgetRenderEntry | undefined => {
          const module = moduleById.get(state.id);
          if (!module) {
            return undefined;
          }
          return {
            module,
            state,
            placement:
              state.placement ?? module.defaultPlacement ?? { region: "floating" }
          };
        })
        .filter((entry): entry is WidgetRenderEntry => Boolean(entry))
        .sort((a, b) => (a.placement.order ?? 0) - (b.placement.order ?? 0)),
    [moduleById, states]
  );

  if (entries.length === 0) {
    return <>{empty}</>;
  }

  const byRegion = (region: WidgetPlacement["region"]) =>
    entries.filter((entry) => entry.placement.region === region);

  return (
    <div className={["k3d-widget-host", className].filter(Boolean).join(" ")}>
      <WidgetDock region="left" entries={byRegion("left")} />
      <WidgetDock region="right" entries={byRegion("right")} />
      <WidgetDock region="bottom" entries={byRegion("bottom")} />
      {byRegion("floating").map((entry) => (
        <FloatingWidget key={entry.state.id} entry={entry} />
      ))}
    </div>
  );
}

function WidgetDock({
  region,
  entries
}: {
  region: "left" | "right" | "bottom";
  entries: WidgetRenderEntry[];
}) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <section
      className={`k3d-dock k3d-dock--${region}`}
      aria-label={`${region} widgets`}
    >
      {entries.map((entry) => (
        <WidgetFrame key={entry.state.id} entry={entry} />
      ))}
    </section>
  );
}

function FloatingWidget({ entry }: { entry: WidgetRenderEntry }) {
  const platform = useWidgetPlatform();
  const rootRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef(entry.placement);
  placementRef.current = entry.placement;
  const bounds = floatingBounds(entry.placement);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const detachPointerListenersRef = useRef<() => void>(() => undefined);
  const operationRef = useRef<
    | {
        kind: "move" | "resize";
        startX: number;
        startY: number;
        bounds: { x: number; y: number; width: number; height: number };
        current: { x: number; y: number; width: number; height: number };
      }
    | undefined
  >(undefined);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const operation = operationRef.current;
    const element = rootRef.current;
    if (!operation || !element) {
      return;
    }
    const deltaX = event.clientX - operation.startX;
    const deltaY = event.clientY - operation.startY;
    if (operation.kind === "move") {
      operation.current.x = Math.max(0, operation.bounds.x + deltaX);
      operation.current.y = Math.max(0, operation.bounds.y + deltaY);
      element.style.left = `${operation.current.x}px`;
      element.style.top = `${operation.current.y}px`;
    } else {
      operation.current.width = Math.max(240, operation.bounds.width + deltaX);
      operation.current.height = Math.max(140, operation.bounds.height + deltaY);
      element.style.width = `${operation.current.width}px`;
      element.style.height = `${operation.current.height}px`;
    }
  }, []);

  const finishPointerOperation = useCallback(() => {
    const operation = operationRef.current;
    operationRef.current = undefined;
    detachPointerListenersRef.current();
    if (!operation) {
      return;
    }
    platform.setPlacement(entry.state.id, {
      ...placementRef.current,
      region: "floating",
      width: operation.current.width,
      height: operation.current.height,
      floating: operation.current
    });
  }, [entry.state.id, platform]);

  const beginPointerOperation = useCallback(
    (kind: "move" | "resize", event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      detachPointerListenersRef.current();
      const currentBounds = boundsRef.current;
      operationRef.current = {
        kind,
        startX: event.clientX,
        startY: event.clientY,
        bounds: { ...currentBounds },
        current: { ...currentBounds }
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", finishPointerOperation);
      window.addEventListener("pointercancel", finishPointerOperation);
      detachPointerListenersRef.current = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", finishPointerOperation);
        window.removeEventListener("pointercancel", finishPointerOperation);
        detachPointerListenersRef.current = () => undefined;
      };
    },
    [finishPointerOperation, onPointerMove]
  );

  useEffect(
    () => () => {
      operationRef.current = undefined;
      detachPointerListenersRef.current();
    },
    []
  );

  const nudge = (kind: "move" | "resize", event: KeyboardEvent<HTMLElement>) => {
    const delta = event.shiftKey ? 1 : 10;
    const next = { ...boundsRef.current };
    if (kind === "move") {
      if (event.key === "ArrowLeft") next.x = Math.max(0, next.x - delta);
      else if (event.key === "ArrowRight") next.x += delta;
      else if (event.key === "ArrowUp") next.y = Math.max(0, next.y - delta);
      else if (event.key === "ArrowDown") next.y += delta;
      else return;
    } else {
      if (event.key === "ArrowLeft") next.width = Math.max(240, next.width - delta);
      else if (event.key === "ArrowRight") next.width += delta;
      else if (event.key === "ArrowUp") next.height = Math.max(140, next.height - delta);
      else if (event.key === "ArrowDown") next.height += delta;
      else return;
    }
    event.preventDefault();
    platform.setPlacement(entry.state.id, {
      ...entry.placement,
      region: "floating",
      width: next.width,
      height: next.height,
      floating: next
    });
  };

  return (
    <div
      ref={rootRef}
      className="k3d-floating-widget"
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
    >
      <WidgetFrame
        entry={entry}
        floating
        onMovePointerDown={(event) => beginPointerOperation("move", event)}
        onMoveKeyDown={(event) => nudge("move", event)}
      />
      {!entry.placement.collapsed && (
        <button
          type="button"
          className="k3d-floating-widget__resize"
          aria-label={`调整 ${entry.module.name} 大小`}
          title="调整大小"
          onPointerDown={(event) => beginPointerOperation("resize", event)}
          onKeyDown={(event) => nudge("resize", event)}
        >
          <Maximize2 size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function WidgetFrame({
  entry,
  floating = false,
  onMovePointerDown,
  onMoveKeyDown
}: {
  entry: WidgetRenderEntry;
  floating?: boolean;
  onMovePointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onMoveKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const mapState = useKairosMapState();
  const platform = useWidgetPlatform();
  const registry = useReactWidgetRegistry();
  const frameRef = useRef<HTMLElement>(null);
  const collapsed = entry.placement.collapsed ?? false;
  const titleId = `k3d-widget-title-${entry.state.id}`;
  const Icon = entry.module.icon ?? PanelTop;
  const WidgetComponent = entry.module.component;

  useEffect(() => {
    frameRef.current?.focus({ preventScroll: true });
  }, []);

  if (!mapState.map) {
    return null;
  }

  const close = () => platform.deactivate(entry.state.id).then(() => undefined);
  const setPlacement = (placement: WidgetPlacement) =>
    platform.setPlacement(entry.state.id, placement);
  const componentProps: ReactWidgetProps = {
    map: mapState.map,
    platform,
    registry,
    state: entry.state,
    close,
    setPlacement
  };

  return (
    <section
      ref={frameRef}
      id={`k3d-widget-${entry.state.id}`}
      className={[
        "k3d-widget-frame",
        collapsed && "k3d-widget-frame--collapsed",
        floating && "k3d-widget-frame--floating"
      ]
        .filter(Boolean)
        .join(" ")}
      role="region"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={
        floating
          ? undefined
          : entry.placement.region === "bottom"
            ? { height: entry.placement.height }
            : { width: entry.placement.width }
      }
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          void close().catch(() => undefined);
        }
      }}
    >
      <header className="k3d-widget-frame__header">
        <div
          className={[
            "k3d-widget-frame__title",
            floating && "k3d-widget-frame__title--movable"
          ]
            .filter(Boolean)
            .join(" ")}
          role={floating ? "button" : undefined}
          tabIndex={floating ? 0 : undefined}
          aria-label={floating ? `移动 ${entry.module.name}` : undefined}
          onPointerDown={onMovePointerDown}
          onKeyDown={onMoveKeyDown}
        >
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          <span id={titleId}>{entry.module.name}</span>
        </div>
        <div className="k3d-widget-frame__actions">
          <button
            type="button"
            className="k3d-icon-button"
            aria-label={collapsed ? `展开 ${entry.module.name}` : `折叠 ${entry.module.name}`}
            title={collapsed ? "展开" : "折叠"}
            onClick={() =>
              platform.setPlacement(entry.state.id, {
                ...entry.placement,
                collapsed: !collapsed
              })
            }
          >
            {collapsed ? (
              <ChevronDown size={15} aria-hidden="true" />
            ) : (
              <ChevronUp size={15} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="k3d-icon-button"
            aria-label={`关闭 ${entry.module.name}`}
            title="关闭"
            onClick={() => void close().catch(() => undefined)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      {!collapsed && (
        <div className="k3d-widget-frame__content">
          <WidgetErrorBoundary key={entry.state.id} name={entry.module.name}>
            <Suspense fallback={<div className="k3d-widget-loading" role="status" />}>
              <WidgetComponent {...componentProps} />
            </Suspense>
          </WidgetErrorBoundary>
        </div>
      )}
    </section>
  );
}

class WidgetErrorBoundary extends Component<
  { children: ReactNode; name: string },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(cause: unknown) {
    return { error: cause instanceof Error ? cause : new Error(String(cause)) };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="k3d-widget-error" role="alert">
          <strong>{this.props.name} 渲染失败</strong>
          <span>{this.state.error.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function floatingBounds(placement: WidgetPlacement) {
  const floating = placement.floating;
  return {
    x: floating?.x ?? 24,
    y: floating?.y ?? 72,
    width: floating?.width ?? placement.width ?? 320,
    height: floating?.height ?? placement.height ?? 320
  };
}
