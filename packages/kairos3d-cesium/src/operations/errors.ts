export class OperationCanceledError extends Error {
  readonly code = "OPERATION_CANCELED";

  constructor(readonly operationId: string) {
    super(`Operation "${operationId}" was canceled.`);
    this.name = "OperationCanceledError";
  }
}

export function isOperationCanceledError(error: unknown): error is OperationCanceledError {
  return error instanceof OperationCanceledError;
}
