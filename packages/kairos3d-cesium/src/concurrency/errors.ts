import type { RuntimeLeaseState, RuntimeResource } from "./types";

export class RuntimeMutationConflictError extends Error {
  readonly code = "RUNTIME_MUTATION_CONFLICT";

  constructor(
    readonly resource: RuntimeResource,
    readonly holder?: RuntimeLeaseState
  ) {
    super(
      holder
        ? `Runtime resource "${resource}" is busy with lease "${holder.id}".`
        : `Runtime resource "${resource}" is reserved for an exclusive mutation.`
    );
    this.name = "RuntimeMutationConflictError";
  }
}

