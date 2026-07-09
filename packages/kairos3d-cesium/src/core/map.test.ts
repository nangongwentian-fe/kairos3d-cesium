import type { Viewer } from "cesium";
import { describe, expect, it, vi } from "vitest";
import { KairosMap } from "./map";

function createViewerMock(destroyed = false): Viewer {
  return {
    isDestroyed: vi.fn(() => destroyed),
    destroy: vi.fn()
  } as unknown as Viewer;
}

describe("KairosMap", () => {
  it("cleans SDK managers even when the Cesium viewer was destroyed externally", () => {
    const viewer = createViewerMock(true);
    const map = new KairosMap(viewer);
    const destroyListener = vi.fn();
    const managerDestroySpies = [
      vi.spyOn(map.primitives, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.overlays, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.performance, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.results, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.tools, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.draw, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.analysis, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.picking, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.selection, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.sceneState, "destroy").mockImplementation(() => undefined),
      vi.spyOn(map.layers, "destroy").mockImplementation(() => undefined)
    ];
    map.on("destroy", destroyListener);

    map.destroy();
    map.destroy();

    for (const spy of managerDestroySpies) {
      expect(spy).toHaveBeenCalledOnce();
    }
    expect(viewer.destroy).not.toHaveBeenCalled();
    expect(destroyListener).toHaveBeenCalledOnce();
    expect(map.isDestroyed()).toBe(true);
  });
});
