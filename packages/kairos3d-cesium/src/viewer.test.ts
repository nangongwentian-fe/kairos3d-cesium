import type { Viewer } from "cesium";
import { describe, expect, it, vi } from "vitest";
import { destroyViewer } from "./viewer";

describe("destroyViewer", () => {
  it("destroys an active viewer", () => {
    const destroy = vi.fn();
    const viewer = {
      isDestroyed: () => false,
      destroy
    } as unknown as Viewer;

    destroyViewer(viewer);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("does not destroy an already destroyed viewer", () => {
    const destroy = vi.fn();
    const viewer = {
      isDestroyed: () => true,
      destroy
    } as unknown as Viewer;

    destroyViewer(viewer);

    expect(destroy).not.toHaveBeenCalled();
  });
});
