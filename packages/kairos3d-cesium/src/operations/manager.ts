import { Evented } from "../core/events";
import { isOperationCanceledError, OperationCanceledError } from "./errors";
import type {
  AsyncOperationOptions,
  OperationErrorInfo,
  OperationManagerEvents,
  OperationQuery,
  OperationState,
  OperationStatus
} from "./types";

const MAX_FINISHED_OPERATIONS = 100;
const emitInternal = Symbol("operation-manager-emit");
const operationContext = Symbol("operation-context");

interface ManagedOperation {
  state: OperationState;
  controller: AbortController;
}

interface OperationStore {
  operations: Map<string, ManagedOperation>;
  sequence: number;
  destroyed: boolean;
}

export interface OperationDefinition {
  kind: string;
  label?: string;
}

export interface OperationContext {
  readonly id: string;
  readonly signal: AbortSignal;
  reportProgress(progress: number, phase?: string): void;
  throwIfAborted(): void;
}

type InternalOperationOptions = AsyncOperationOptions & {
  [operationContext]?: OperationContext;
};

const stores = new WeakMap<OperationManager, OperationStore>();

export class OperationManager extends Evented<OperationManagerEvents> {
  constructor() {
    super();
    stores.set(this, {
      operations: new Map(),
      sequence: 0,
      destroyed: false
    });
  }

  get(id: string): OperationState | undefined {
    const state = getStore(this).operations.get(id)?.state;
    return state ? cloneState(state) : undefined;
  }

  list(query: OperationQuery = {}): OperationState[] {
    return [...getStore(this).operations.values()]
      .map((operation) => operation.state)
      .filter((state) => matchesQuery(state, query))
      .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
      .map(cloneState);
  }

  cancel(id: string): boolean {
    const operation = getStore(this).operations.get(id);
    if (!operation || operation.state.status !== "running") {
      return false;
    }

    operation.controller.abort(new OperationCanceledError(id));
    finishOperation(this, operation, "canceled");
    return true;
  }

  cancelAll(query: OperationQuery = {}): number {
    const ids = this.list(query)
      .filter((state) => state.status === "running")
      .map((state) => state.id);
    let canceled = 0;
    for (const id of ids) {
      if (this.cancel(id)) {
        canceled += 1;
      }
    }
    return canceled;
  }

  clearFinished(query: OperationQuery = {}): number {
    const store = getStore(this);
    const removed: OperationState[] = [];
    for (const [id, operation] of store.operations) {
      if (operation.state.status === "running" || !matchesQuery(operation.state, query)) {
        continue;
      }
      store.operations.delete(id);
      removed.push(cloneState(operation.state));
    }

    if (removed.length > 0) {
      this.emit("clear", removed);
    }
    return removed.length;
  }

  destroy(): void {
    const store = getStore(this);
    if (store.destroyed) {
      return;
    }

    store.destroyed = true;
    for (const operation of store.operations.values()) {
      if (operation.state.status === "running") {
        operation.controller.abort(new OperationCanceledError(operation.state.id));
      }
    }
    store.operations.clear();
    this.off();
  }

  [emitInternal](type: "change" | "remove", state: OperationState): void {
    this.emit(type, state);
  }
}

export async function runOperation<T>(
  manager: OperationManager,
  definition: OperationDefinition,
  options: AsyncOperationOptions | undefined,
  task: (context: OperationContext) => Promise<T>
): Promise<T> {
  const operation = startOperation(manager, definition, options);
  const context = createContext(manager, operation);
  const externalSignal = options?.signal;
  const onExternalAbort = () => manager.cancel(operation.state.id);
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  if (externalSignal?.aborted) {
    manager.cancel(operation.state.id);
  }

  const taskPromise = Promise.resolve().then(() => {
    context.throwIfAborted();
    return task(context);
  });
  let listeningForCancellation = false;
  let rejectCancellation: () => void = () => undefined;
  const cancelPromise = new Promise<never>((_resolve, reject) => {
    rejectCancellation = () => reject(new OperationCanceledError(operation.state.id));
    if (context.signal.aborted) {
      rejectCancellation();
    } else {
      listeningForCancellation = true;
      context.signal.addEventListener("abort", rejectCancellation, { once: true });
    }
  });

  try {
    const result = await Promise.race([taskPromise, cancelPromise]);
    context.throwIfAborted();
    finishOperation(manager, operation, "succeeded");
    return result;
  } catch (error) {
    if (context.signal.aborted || isOperationCanceledError(error)) {
      finishOperation(manager, operation, "canceled");
      throw new OperationCanceledError(operation.state.id);
    }

    finishOperation(manager, operation, "failed", error);
    throw error;
  } finally {
    externalSignal?.removeEventListener("abort", onExternalAbort);
    if (listeningForCancellation) {
      context.signal.removeEventListener("abort", rejectCancellation);
    }
    void taskPromise.catch(() => undefined);
  }
}

export function runOrReuseOperation<T>(
  manager: OperationManager,
  definition: OperationDefinition,
  options: AsyncOperationOptions | undefined,
  task: (context: OperationContext) => Promise<T>
): Promise<T> {
  const context = (options as InternalOperationOptions | undefined)?.[operationContext];
  if (!context) {
    return runOperation(manager, definition, options, task);
  }
  return Promise.resolve()
    .then(() => {
      context.throwIfAborted();
      return task(context);
    })
    .then((result) => {
      context.throwIfAborted();
      return result;
    });
}

export function withOperationContext<T extends object>(
  options: T,
  context: OperationContext
): T {
  return Object.assign({}, options, { [operationContext]: context });
}

export function createOperationScope(
  parent: OperationContext,
  start: number,
  end: number,
  phase: string
): OperationContext {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1 || end < start) {
    throw new Error("Operation scope must be within 0 and 1.");
  }

  return {
    id: parent.id,
    signal: parent.signal,
    reportProgress(progress, childPhase) {
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new Error("Operation progress must be a finite number between 0 and 1.");
      }
      const scopedProgress = start + (end - start) * progress;
      parent.reportProgress(scopedProgress, childPhase ? `${phase}.${childPhase}` : phase);
    },
    throwIfAborted() {
      parent.throwIfAborted();
    }
  };
}

function startOperation(
  manager: OperationManager,
  definition: OperationDefinition,
  options: AsyncOperationOptions | undefined
): ManagedOperation {
  const store = getStore(manager);
  if (store.destroyed) {
    throw new Error("Operation manager is destroyed.");
  }

  const kind = definition.kind.trim();
  if (!kind) {
    throw new Error("Operation kind is required.");
  }

  const requestedId = options?.operationId;
  if (requestedId !== undefined && !requestedId.trim()) {
    throw new Error("Operation id must not be empty.");
  }
  const id = requestedId?.trim() ?? createOperationId(store, kind);
  if (store.operations.has(id)) {
    throw new Error(`Operation id "${id}" already exists.`);
  }

  const operation: ManagedOperation = {
    controller: new AbortController(),
    state: {
      id,
      kind,
      label: definition.label,
      status: "running",
      progress: 0,
      startedAt: new Date()
    }
  };
  store.operations.set(id, operation);
  emitChange(manager, operation.state);
  return operation;
}

function createContext(
  manager: OperationManager,
  operation: ManagedOperation
): OperationContext {
  return {
    id: operation.state.id,
    signal: operation.controller.signal,
    reportProgress(progress, phase) {
      if (operation.state.status !== "running") {
        return;
      }
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new Error("Operation progress must be a finite number between 0 and 1.");
      }

      const nextProgress = Math.max(operation.state.progress ?? 0, progress);
      if (nextProgress === operation.state.progress && phase === operation.state.phase) {
        return;
      }
      operation.state.progress = nextProgress;
      operation.state.phase = phase;
      emitChange(manager, operation.state);
    },
    throwIfAborted() {
      if (operation.controller.signal.aborted) {
        throw new OperationCanceledError(operation.state.id);
      }
    }
  };
}

function finishOperation(
  manager: OperationManager,
  operation: ManagedOperation,
  status: Exclude<OperationStatus, "running">,
  error?: unknown
): void {
  if (operation.state.status !== "running") {
    return;
  }

  operation.state.status = status;
  operation.state.finishedAt = new Date();
  if (status === "succeeded") {
    operation.state.progress = 1;
  }
  if (status === "failed") {
    operation.state.error = toErrorInfo(error);
  }
  emitChange(manager, operation.state);
  trimFinished(manager);
}

function trimFinished(manager: OperationManager): void {
  const store = getStore(manager);
  const finished = [...store.operations.values()]
    .filter((operation) => operation.state.status !== "running")
    .sort(
      (left, right) =>
        (left.state.finishedAt?.getTime() ?? left.state.startedAt.getTime()) -
        (right.state.finishedAt?.getTime() ?? right.state.startedAt.getTime())
    );

  while (finished.length > MAX_FINISHED_OPERATIONS) {
    const operation = finished.shift();
    if (!operation) {
      break;
    }
    store.operations.delete(operation.state.id);
    manager[emitInternal]("remove", cloneState(operation.state));
  }
}

function createOperationId(store: OperationStore, kind: string): string {
  let id: string;
  do {
    store.sequence += 1;
    id = `${kind}-${Date.now().toString(36)}-${store.sequence.toString(36)}`;
  } while (store.operations.has(id));
  return id;
}

function matchesQuery(state: OperationState, query: OperationQuery): boolean {
  if (query.kind && state.kind !== query.kind) {
    return false;
  }
  if (!query.status) {
    return true;
  }
  const statuses = Array.isArray(query.status) ? query.status : [query.status];
  return statuses.includes(state.status);
}

function toErrorInfo(error: unknown): OperationErrorInfo {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return { name: error.name, message: error.message, code };
  }
  return { name: "Error", message: String(error) };
}

function cloneState(state: OperationState): OperationState {
  return Object.freeze({
    ...state,
    error: state.error ? Object.freeze({ ...state.error }) : undefined,
    startedAt: new Date(state.startedAt),
    finishedAt: state.finishedAt ? new Date(state.finishedAt) : undefined
  });
}

function emitChange(manager: OperationManager, state: OperationState): void {
  const store = getStore(manager);
  if (!store.destroyed) {
    manager[emitInternal]("change", cloneState(state));
  }
}

function getStore(manager: OperationManager): OperationStore {
  const store = stores.get(manager);
  if (!store) {
    throw new Error("Operation manager is not initialized.");
  }
  return store;
}
