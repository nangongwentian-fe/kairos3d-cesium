import type { OperationErrorInfo } from "../operations";
import type { SceneRollbackStatus } from "./types";

export class SceneTransactionError extends Error {
  readonly name = "SceneTransactionError";

  constructor(
    message: string,
    readonly phase: "prepare" | "commit" | "rollback",
    readonly stage: string | undefined,
    readonly rollbackStatus: SceneRollbackStatus,
    readonly rollbackErrors: OperationErrorInfo[] = [],
    readonly originalError?: unknown
  ) {
    super(message);
  }
}
