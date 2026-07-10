import { AlertTriangle } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <div className="k3d-standard-empty">{children}</div>;
}

export function WidgetError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }
  return (
    <div className="k3d-standard-error" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      <span>{error}</span>
    </div>
  );
}

export function WidgetSection({
  title,
  actions,
  children
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="k3d-standard-section">
      <header className="k3d-standard-section__header">
        <h3>{title}</h3>
        {actions && <div className="k3d-standard-section__actions">{actions}</div>}
      </header>
      <div className="k3d-standard-section__body">{children}</div>
    </section>
  );
}

export function ConfirmRow({
  message,
  confirmLabel = "确认",
  onConfirm,
  onCancel
}: {
  message: string;
  confirmLabel?: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <div className="k3d-confirm-row" role="alert">
      <span>{message}</span>
      <div>
        <button type="button" className="k3d-button k3d-button--danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="k3d-button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

export function useManagerRevision(
  subscribe: (refresh: () => void) => Array<() => void>,
  dependencies: readonly unknown[]
): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const off = subscribe(refresh);
    refresh();
    return () => {
      for (const unsubscribe of off) {
        unsubscribe();
      }
    };
    // Managers are stable for the lifetime of a KairosMap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return revision;
}

export function useMountedRef() {
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  return mounted;
}

export function useAsyncAction() {
  const mounted = useMountedRef();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const run = useCallback(
    async (key: string, action: () => void | Promise<unknown>) => {
      setBusy(key);
      setError(undefined);
      try {
        await action();
      } catch (cause) {
        if (mounted.current) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (mounted.current) {
          setBusy(undefined);
        }
      }
    },
    [mounted]
  );
  return { busy, error, setError, run };
}

export function formatUnknown(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
