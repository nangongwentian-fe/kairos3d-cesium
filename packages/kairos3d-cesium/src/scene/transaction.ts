export interface PreparedSceneStage {
  readonly phase: string;
  commit(): void | Promise<void>;
  rollback(): void | Promise<void>;
  finalize(): void | Promise<void>;
  dispose(): void | Promise<void>;
  publish(): void;
}
