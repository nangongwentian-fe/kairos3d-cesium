import { SceneTransforms } from "cesium";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useKairosMapState } from "./hooks";
import type { KairosPopup, KairosPopupController } from "./types";

const PopupControllerContext = createContext<KairosPopupController | undefined>(undefined);
const PopupItemsContext = createContext<readonly KairosPopup[]>([]);

export function KairosPopupProvider({ children }: { children: ReactNode }) {
  const [popups, setPopups] = useState<readonly KairosPopup[]>([]);
  const popupsRef = useRef(popups);
  popupsRef.current = popups;

  const open = useCallback((popup: KairosPopup) => {
    if (popup.id.trim().length === 0) {
      throw new Error("Popup id must not be empty.");
    }
    const next = [
      ...popupsRef.current.filter((candidate) => candidate.id !== popup.id),
      popup
    ];
    popupsRef.current = next;
    setPopups(next);
  }, []);
  const close = useCallback((id: string) => {
    const exists = popupsRef.current.some((popup) => popup.id === id);
    if (!exists) {
      return false;
    }
    const next = popupsRef.current.filter((popup) => popup.id !== id);
    popupsRef.current = next;
    setPopups(next);
    return true;
  }, []);
  const clear = useCallback(() => {
    popupsRef.current = [];
    setPopups([]);
  }, []);
  const controller = useMemo<KairosPopupController>(
    () => ({ open, close, clear, list: () => popupsRef.current }),
    [clear, close, open]
  );

  return (
    <PopupControllerContext.Provider value={controller}>
      <PopupItemsContext.Provider value={popups}>{children}</PopupItemsContext.Provider>
    </PopupControllerContext.Provider>
  );
}

export function useKairosPopup(): KairosPopupController {
  const controller = useContext(PopupControllerContext);
  if (!controller) {
    throw new Error("useKairosPopup must be used inside KairosWidgetShell.");
  }
  return controller;
}

export function KairosPopupHost() {
  const controller = useContext(PopupControllerContext);
  const mapState = useKairosMapState();
  const popups = useContext(PopupItemsContext);
  const hostRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const host = hostRef.current;
    const map = mapState.map;
    if (!host || !map || popups.length === 0) {
      return;
    }

    const updatePositions = () => {
      const hostRect = host.getBoundingClientRect();
      const canvasRect = map.viewer.canvas.getBoundingClientRect();
      for (const popup of popups) {
        const element = itemRefs.current.get(popup.id);
        if (!element) {
          continue;
        }
        const [offsetX, offsetY] = popup.offset ?? [0, 0];
        if (popup.anchor.type === "screen") {
          positionElement(element, popup.anchor.x + offsetX, popup.anchor.y + offsetY);
          continue;
        }
        const windowPosition = SceneTransforms.worldToWindowCoordinates(
          map.viewer.scene,
          popup.anchor.position
        );
        if (!windowPosition) {
          element.hidden = true;
          continue;
        }
        positionElement(
          element,
          windowPosition.x + canvasRect.left - hostRect.left + offsetX,
          windowPosition.y + canvasRect.top - hostRect.top + offsetY
        );
      }
    };

    updatePositions();
    if (!popups.some((popup) => popup.anchor.type === "world")) {
      return;
    }
    return map.viewer.scene.postRender.addEventListener(updatePositions);
  }, [mapState.map, popups]);

  if (!controller || popups.length === 0) {
    return <div ref={hostRef} className="k3d-popup-host" aria-live="polite" />;
  }

  return (
    <div ref={hostRef} className="k3d-popup-host" aria-live="polite">
      {popups.map((popup) => (
        <div
          key={popup.id}
          ref={(element) => {
            if (element) itemRefs.current.set(popup.id, element);
            else itemRefs.current.delete(popup.id);
          }}
          className={["k3d-popup", popup.className].filter(Boolean).join(" ")}
          role="dialog"
          aria-label={popup.ariaLabel ?? "地图弹窗"}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              controller.close(popup.id);
            }
          }}
        >
          <button
            type="button"
            className="k3d-icon-button k3d-popup__close"
            aria-label={popup.closeLabel ?? "关闭弹窗"}
            title="关闭"
            onClick={() => controller.close(popup.id)}
          >
            <X size={14} aria-hidden="true" />
          </button>
          <div className="k3d-popup__content">{popup.content}</div>
        </div>
      ))}
    </div>
  );
}

function positionElement(element: HTMLDivElement, x: number, y: number): void {
  element.hidden = false;
  element.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}
