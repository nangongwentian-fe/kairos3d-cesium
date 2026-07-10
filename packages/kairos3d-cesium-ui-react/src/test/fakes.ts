import type { KairosMap } from "@kairos3d/cesium/core";
import { vi } from "vitest";

export interface FakePostRender {
  addEventListener: ReturnType<typeof vi.fn>;
  raise(): void;
  listenerCount(): number;
}

export function createFakeMap() {
  const listeners = new Set<() => void>();
  const postRender: FakePostRender = {
    addEventListener: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    raise: () => {
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size
  };
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => domRect(10, 20, 800, 600);
  const map = {
    viewer: {
      canvas,
      scene: { postRender }
    },
    sceneState: {
      toJSON: vi.fn(),
      load: vi.fn()
    },
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false)
  } as unknown as KairosMap;
  return { map, postRender };
}

function domRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON: () => ({})
  } as DOMRect;
}
