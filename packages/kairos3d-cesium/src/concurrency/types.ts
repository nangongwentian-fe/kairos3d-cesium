export type RuntimeResource =
  | "scene"
  | "camera"
  | "bookmarks"
  | "layers"
  | "materials"
  | "tools"
  | "selection"
  | "draw"
  | "analysis"
  | "primitives"
  | "overlays"
  | "effects";

export type RuntimeLeaseMode = "write" | "exclusive";

export type RuntimeLeaseStatus = "waiting" | "active";

export interface RuntimeLeaseState {
  id: string;
  kind: string;
  mode: RuntimeLeaseMode;
  status: RuntimeLeaseStatus;
  resources: readonly RuntimeResource[];
  operationId?: string;
  startedAt: Date;
  activatedAt?: Date;
}

export interface RuntimeConcurrencyQuery {
  resource?: RuntimeResource;
  kind?: string;
  mode?: RuntimeLeaseMode;
  status?: RuntimeLeaseStatus;
}

export interface RuntimeWhenIdleOptions {
  signal?: AbortSignal;
}

export interface RuntimeConcurrencyManagerEvents {
  change: { leases: RuntimeLeaseState[] };
  remove: RuntimeLeaseState;
}
