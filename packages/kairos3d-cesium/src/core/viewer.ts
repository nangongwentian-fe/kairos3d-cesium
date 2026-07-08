import { Viewer } from "cesium";

export type ViewerContainer = ConstructorParameters<typeof Viewer>[0];
export type ViewerOptions = ConstructorParameters<typeof Viewer>[1];

export function createViewer(container: ViewerContainer, options?: ViewerOptions): Viewer {
  return new Viewer(container, options);
}

export function destroyViewer(viewer: Viewer | null | undefined): void {
  if (!viewer || viewer.isDestroyed()) {
    return;
  }

  viewer.destroy();
}
