import { Evented } from "../core/events";
import { RuntimeMutationConflictError } from "./errors";
import {
  acquireLeaseInternal,
  acquireWriteLeaseInternal,
  assertMutationAllowedInternal,
  destroyConcurrencyInternal,
  emitLeaseChangeInternal,
  emitLeaseRemoveInternal,
  getLeaseCountsInternal,
  releaseLeaseInternal
} from "./internal";
import type {
  RuntimeConcurrencyManagerEvents,
  RuntimeConcurrencyQuery,
  RuntimeLeaseState,
  RuntimeResource,
  RuntimeWhenIdleOptions
} from "./types";
import type {
  RuntimeLease,
  RuntimeLeaseOwnerToken,
  RuntimeLeaseRequest
} from "./lease";

interface ManagedLease {
  state: RuntimeLeaseState;
  sequence: number;
  ownerToken: RuntimeLeaseOwnerToken;
  resolve?: (lease: RuntimeLease) => void;
  reject?: (error: unknown) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
}

interface IdleWaiter {
  query: RuntimeConcurrencyQuery;
  resolve: () => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
}

interface RuntimeConcurrencyStore {
  records: Map<string, ManagedLease>;
  active: Map<string, ManagedLease>;
  waiting: ManagedLease[];
  idleWaiters: Set<IdleWaiter>;
  sequence: number;
  destroyed: boolean;
}

const stores = new WeakMap<RuntimeConcurrencyManager, RuntimeConcurrencyStore>();
const runtimeResources = new Set<RuntimeResource>([
  "scene",
  "camera",
  "bookmarks",
  "layers",
  "materials",
  "tools",
  "selection",
  "draw",
  "analysis",
  "primitives",
  "overlays",
  "effects"
]);

export class RuntimeConcurrencyManager extends Evented<RuntimeConcurrencyManagerEvents> {
  constructor() {
    super();
    stores.set(this, {
      records: new Map(),
      active: new Map(),
      waiting: [],
      idleWaiters: new Set(),
      sequence: 0,
      destroyed: false
    });
  }

  isBusy(resource?: RuntimeResource): boolean {
    return this.list(resource ? { resource } : {}).length > 0;
  }

  list(query: RuntimeConcurrencyQuery = {}): RuntimeLeaseState[] {
    return [...getStore(this).records.values()]
      .filter((lease) => matchesQuery(lease.state, query))
      .sort((left, right) => left.sequence - right.sequence)
      .map((lease) => cloneState(lease.state));
  }

  whenIdle(
    query: RuntimeConcurrencyQuery = {},
    options: RuntimeWhenIdleOptions = {}
  ): Promise<void> {
    const store = getStore(this);
    if (!hasMatchingLease(store, query)) {
      return Promise.resolve();
    }
    if (options.signal?.aborted) {
      return Promise.reject(createAbortError(options.signal));
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: IdleWaiter = {
        query: { ...query },
        resolve,
        reject,
        signal: options.signal
      };
      if (options.signal) {
        waiter.abortListener = () => {
          store.idleWaiters.delete(waiter);
          reject(createAbortError(options.signal!));
        };
        options.signal.addEventListener("abort", waiter.abortListener, { once: true });
      }
      store.idleWaiters.add(waiter);
    });
  }

  /** @internal */
  [destroyConcurrencyInternal](): void {
    const store = getStore(this);
    if (store.destroyed) {
      return;
    }
    store.destroyed = true;

    const error = new Error("Runtime concurrency manager is destroyed.");
    for (const lease of store.waiting) {
      removeAbortListener(lease);
      store.records.delete(lease.state.id);
      lease.reject?.(error);
    }
    store.waiting = [];
    notifyIdleWaiters(store);
    this.off();
  }

  /** @internal */
  [acquireLeaseInternal](request: RuntimeLeaseRequest): Promise<RuntimeLease> {
    const store = getStore(this);
    const normalized = normalizeRequest(request);
    const owner = normalized.ownerToken
      ? findOwner(store, normalized.ownerToken)
      : undefined;
    if (owner && ownerCanAccess(owner, normalized.resources)) {
      return Promise.resolve(createLeaseHandle(this, owner, false));
    }
    if (store.destroyed) {
      return Promise.reject(new Error("Runtime concurrency manager is destroyed."));
    }
    if (normalized.signal?.aborted) {
      return Promise.reject(createAbortError(normalized.signal));
    }

    store.sequence += 1;
    const lease: ManagedLease = {
      sequence: store.sequence,
      ownerToken: Symbol(normalized.kind),
      state: {
        id: createLeaseId(store, normalized.kind),
        kind: normalized.kind,
        mode: normalized.mode,
        status: "waiting",
        resources: normalized.resources,
        operationId: normalized.operationId,
        startedAt: new Date()
      },
      signal: normalized.signal
    };

    const conflict = findConflict(store, lease);
    const reserved = lease.state.mode === "write" ? findWaitingExclusive(store) : undefined;
    if ((conflict || reserved) && normalized.conflictPolicy === "reject") {
      return Promise.reject(createConflictError(lease, conflict ?? reserved));
    }

    store.records.set(lease.state.id, lease);
    if (!conflict && !reserved) {
      activateLease(this, lease);
      return Promise.resolve(createLeaseHandle(this, lease, true));
    }

    return new Promise<RuntimeLease>((resolve, reject) => {
      lease.resolve = resolve;
      lease.reject = reject;
      if (lease.signal) {
        lease.abortListener = () => cancelWaitingLease(this, lease, createAbortError(lease.signal!));
        lease.signal.addEventListener("abort", lease.abortListener, { once: true });
      }
      store.waiting.push(lease);
      this[emitLeaseChangeInternal]();
    });
  }

  /** @internal */
  [acquireWriteLeaseInternal](request: RuntimeLeaseRequest): RuntimeLease {
    const store = getStore(this);
    const normalized = normalizeRequest({
      ...request,
      mode: "write",
      conflictPolicy: "reject"
    });
    const owner = normalized.ownerToken
      ? findOwner(store, normalized.ownerToken)
      : undefined;
    if (owner && ownerCanAccess(owner, normalized.resources)) {
      return createLeaseHandle(this, owner, false);
    }
    if (store.destroyed) {
      throw new Error("Runtime concurrency manager is destroyed.");
    }

    store.sequence += 1;
    const now = new Date();
    const lease: ManagedLease = {
      sequence: store.sequence,
      ownerToken: Symbol(normalized.kind),
      state: {
        id: createLeaseId(store, normalized.kind),
        kind: normalized.kind,
        mode: "write",
        status: "active",
        resources: normalized.resources,
        operationId: normalized.operationId,
        startedAt: now,
        activatedAt: now
      }
    };
    const conflict = findConflict(store, lease) ?? findWaitingExclusive(store);
    if (conflict) {
      throw createConflictError(lease, conflict);
    }

    store.records.set(lease.state.id, lease);
    store.active.set(lease.state.id, lease);
    this[emitLeaseChangeInternal]();
    return createLeaseHandle(this, lease, true);
  }

  /** @internal */
  [releaseLeaseInternal](id: string, ownerToken: RuntimeLeaseOwnerToken): void {
    const store = getStore(this);
    const lease = store.active.get(id);
    if (!lease || lease.ownerToken !== ownerToken) {
      return;
    }
    store.active.delete(id);
    store.records.delete(id);
    if (!store.destroyed) {
      this[emitLeaseRemoveInternal](cloneState(lease.state));
      drainWaiting(this);
      this[emitLeaseChangeInternal]();
    }
    notifyIdleWaiters(store);
  }

  /** @internal */
  [assertMutationAllowedInternal](
    resource: RuntimeResource,
    kind: string,
    ownerToken?: RuntimeLeaseOwnerToken
  ): void {
    const store = getStore(this);
    const owner = ownerToken ? findOwner(store, ownerToken) : undefined;
    if (owner && ownerCanAccess(owner, [resource])) {
      return;
    }
    if (store.destroyed) {
      throw new Error("Runtime concurrency manager is destroyed.");
    }

    const probe: ManagedLease = {
      sequence: Number.MAX_SAFE_INTEGER,
      ownerToken: Symbol(kind),
      state: {
        id: `${kind}-probe`,
        kind,
        mode: "write",
        status: "waiting",
        resources: [resource],
        startedAt: new Date()
      }
    };
    const conflict = findConflict(store, probe) ?? findWaitingExclusive(store);
    if (conflict) {
      throw createConflictError(probe, conflict);
    }
  }

  /** @internal */
  [getLeaseCountsInternal](): { active: number; waiting: number } {
    const store = getStore(this);
    return { active: store.active.size, waiting: store.waiting.length };
  }

  /** @internal */
  [emitLeaseChangeInternal](): void {
    try {
      this.emit("change", { leases: this.list() });
    } catch {
      // Listener side effects must not corrupt lease scheduling.
    }
  }

  /** @internal */
  [emitLeaseRemoveInternal](state: RuntimeLeaseState): void {
    try {
      this.emit("remove", state);
    } catch {
      // Listener side effects must not corrupt lease scheduling.
    }
  }
}

function normalizeRequest(request: RuntimeLeaseRequest): Required<
  Pick<RuntimeLeaseRequest, "kind" | "mode" | "resources" | "conflictPolicy">
> & Omit<RuntimeLeaseRequest, "kind" | "mode" | "resources" | "conflictPolicy"> {
  const kind = request.kind.trim();
  if (!kind) {
    throw new Error("Runtime lease kind is required.");
  }
  const resources = [...new Set(request.resources)];
  if (resources.length === 0) {
    throw new Error("Runtime lease requires at least one resource.");
  }
  if (resources.some((resource) => !runtimeResources.has(resource))) {
    throw new Error("Runtime lease contains an unknown resource.");
  }
  if (request.mode !== "write" && request.mode !== "exclusive") {
    throw new Error("Runtime lease mode must be write or exclusive.");
  }
  if (
    request.conflictPolicy !== undefined &&
    request.conflictPolicy !== "wait" &&
    request.conflictPolicy !== "reject"
  ) {
    throw new Error("Runtime lease conflict policy must be wait or reject.");
  }
  return {
    ...request,
    kind,
    mode: request.mode,
    resources,
    conflictPolicy: request.conflictPolicy ?? "wait"
  };
}

function activateLease(manager: RuntimeConcurrencyManager, lease: ManagedLease): void {
  const store = getStore(manager);
  const waitingIndex = store.waiting.indexOf(lease);
  if (waitingIndex >= 0) {
    store.waiting.splice(waitingIndex, 1);
  }
  removeAbortListener(lease);
  lease.state.status = "active";
  lease.state.activatedAt = new Date();
  store.active.set(lease.state.id, lease);
  manager[emitLeaseChangeInternal]();
  lease.resolve?.(createLeaseHandle(manager, lease, true));
  lease.resolve = undefined;
  lease.reject = undefined;
}

function drainWaiting(manager: RuntimeConcurrencyManager): void {
  const store = getStore(manager);
  if (store.destroyed || [...store.active.values()].some((lease) => lease.state.mode === "exclusive")) {
    return;
  }

  const firstExclusiveIndex = store.waiting.findIndex(
    (lease) => lease.state.mode === "exclusive"
  );
  if (firstExclusiveIndex === 0) {
    if (store.active.size === 0) {
      activateLease(manager, store.waiting[0]!);
    }
    return;
  }

  const writeLimit = firstExclusiveIndex < 0 ? store.waiting.length : firstExclusiveIndex;
  const candidates = store.waiting.slice(0, writeLimit);
  for (const lease of candidates) {
    if (!findConflict(store, lease)) {
      activateLease(manager, lease);
    }
  }
}

function cancelWaitingLease(
  manager: RuntimeConcurrencyManager,
  lease: ManagedLease,
  error: unknown
): void {
  const store = getStore(manager);
  const index = store.waiting.indexOf(lease);
  if (index < 0) {
    return;
  }
  store.waiting.splice(index, 1);
  store.records.delete(lease.state.id);
  removeAbortListener(lease);
  lease.reject?.(error);
  lease.resolve = undefined;
  lease.reject = undefined;
  if (!store.destroyed) {
    manager[emitLeaseRemoveInternal](cloneState(lease.state));
    drainWaiting(manager);
    manager[emitLeaseChangeInternal]();
    notifyIdleWaiters(store);
  }
}

function createLeaseHandle(
  manager: RuntimeConcurrencyManager,
  lease: ManagedLease,
  ownsRelease: boolean
): RuntimeLease {
  let released = false;
  return Object.freeze({
    id: lease.state.id,
    ownerToken: lease.ownerToken,
    release() {
      if (released) {
        return;
      }
      released = true;
      if (ownsRelease) {
        manager[releaseLeaseInternal](lease.state.id, lease.ownerToken);
      }
    }
  });
}

function findConflict(
  store: RuntimeConcurrencyStore,
  requested: ManagedLease
): ManagedLease | undefined {
  for (const current of store.active.values()) {
    if (
      requested.state.mode === "exclusive" ||
      current.state.mode === "exclusive" ||
      resourcesOverlap(requested.state.resources, current.state.resources)
    ) {
      return current;
    }
  }
  return undefined;
}

function findWaitingExclusive(store: RuntimeConcurrencyStore): ManagedLease | undefined {
  return store.waiting.find((lease) => lease.state.mode === "exclusive");
}

function resourcesOverlap(
  left: readonly RuntimeResource[],
  right: readonly RuntimeResource[]
): boolean {
  if (left.includes("scene") || right.includes("scene")) {
    return true;
  }
  return left.some((resource) => right.includes(resource));
}

function ownerCanAccess(owner: ManagedLease, resources: readonly RuntimeResource[]): boolean {
  return owner.state.mode === "exclusive" || resources.every((resource) =>
    owner.state.resources.includes("scene") || owner.state.resources.includes(resource)
  );
}

function findOwner(
  store: RuntimeConcurrencyStore,
  ownerToken: RuntimeLeaseOwnerToken
): ManagedLease | undefined {
  return [...store.active.values()].find((lease) => lease.ownerToken === ownerToken);
}

function createConflictError(
  requested: ManagedLease,
  holder: ManagedLease | undefined
): RuntimeMutationConflictError {
  const resource = firstConflictingResource(requested, holder);
  return new RuntimeMutationConflictError(
    resource,
    holder ? cloneState(holder.state) : undefined
  );
}

function firstConflictingResource(
  requested: ManagedLease,
  holder: ManagedLease | undefined
): RuntimeResource {
  if (!holder || requested.state.mode === "exclusive" || holder.state.mode === "exclusive") {
    return requested.state.resources[0] ?? "scene";
  }
  return requested.state.resources.find((resource) =>
    holder.state.resources.includes(resource)
  ) ?? requested.state.resources[0] ?? "scene";
}

function createLeaseId(store: RuntimeConcurrencyStore, kind: string): string {
  let id: string;
  do {
    id = `${kind}-${Date.now().toString(36)}-${store.sequence.toString(36)}`;
  } while (store.records.has(id));
  return id;
}

function matchesQuery(state: RuntimeLeaseState, query: RuntimeConcurrencyQuery): boolean {
  if (query.kind && state.kind !== query.kind) {
    return false;
  }
  if (query.mode && state.mode !== query.mode) {
    return false;
  }
  if (query.status && state.status !== query.status) {
    return false;
  }
  return query.resource === undefined || matchesResource(state, query.resource);
}

function matchesResource(state: RuntimeLeaseState, resource: RuntimeResource): boolean {
  return (
    state.mode === "exclusive" ||
    resource === "scene" ||
    state.resources.includes("scene") ||
    state.resources.includes(resource)
  );
}

function hasMatchingLease(
  store: RuntimeConcurrencyStore,
  query: RuntimeConcurrencyQuery
): boolean {
  return [...store.records.values()].some((lease) => matchesQuery(lease.state, query));
}

function notifyIdleWaiters(store: RuntimeConcurrencyStore): void {
  for (const waiter of [...store.idleWaiters]) {
    if (hasMatchingLease(store, waiter.query)) {
      continue;
    }
    store.idleWaiters.delete(waiter);
    removeIdleAbortListener(waiter);
    waiter.resolve();
  }
}

function removeAbortListener(lease: ManagedLease): void {
  if (lease.signal && lease.abortListener) {
    lease.signal.removeEventListener("abort", lease.abortListener);
    lease.abortListener = undefined;
  }
}

function removeIdleAbortListener(waiter: IdleWaiter): void {
  if (waiter.signal && waiter.abortListener) {
    waiter.signal.removeEventListener("abort", waiter.abortListener);
    waiter.abortListener = undefined;
  }
}

function createAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Runtime lease wait was canceled.", "AbortError");
}

function cloneState(state: RuntimeLeaseState): RuntimeLeaseState {
  return Object.freeze({
    ...state,
    resources: Object.freeze([...state.resources]),
    startedAt: new Date(state.startedAt),
    activatedAt: state.activatedAt ? new Date(state.activatedAt) : undefined
  });
}

function getStore(manager: RuntimeConcurrencyManager): RuntimeConcurrencyStore {
  const store = stores.get(manager);
  if (!store) {
    throw new Error("Runtime concurrency manager is not initialized.");
  }
  return store;
}
