export type OperationStatus = "running" | "succeeded" | "failed" | "canceled";

export interface AsyncOperationOptions {
  signal?: AbortSignal;
  operationId?: string;
}

export interface OperationErrorInfo {
  name: string;
  message: string;
  code?: string;
}

export interface OperationState {
  id: string;
  kind: string;
  label?: string;
  status: OperationStatus;
  progress?: number;
  phase?: string;
  error?: OperationErrorInfo;
  startedAt: Date;
  finishedAt?: Date;
}

export interface OperationQuery {
  kind?: string;
  status?: OperationStatus | OperationStatus[];
}

export interface OperationManagerEvents {
  change: OperationState;
  remove: OperationState;
  clear: OperationState[];
}
