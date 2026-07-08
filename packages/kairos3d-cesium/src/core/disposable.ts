export interface Disposable {
  destroy(): void;
}

export interface Destroyable {
  isDestroyed(): boolean;
  destroy(): unknown;
}
