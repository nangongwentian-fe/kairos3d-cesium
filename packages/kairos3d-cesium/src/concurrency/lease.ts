import type { RuntimeConcurrencyManager } from "./manager";
import {
  acquireLeaseInternal,
  acquireWriteLeaseInternal,
  assertMutationAllowedInternal,
  destroyConcurrencyInternal,
  getLeaseCountsInternal
} from "./internal";
import type { RuntimeLeaseMode, RuntimeResource } from "./types";

const runtimeLeaseOwner = Symbol("runtime-lease-owner");

type RuntimeLeaseOwnerOptions = {
  [runtimeLeaseOwner]?: RuntimeLeaseOwnerToken;
};

/** @internal */
export type RuntimeConflictPolicy = "wait" | "reject";

/** @internal */
export type RuntimeLeaseOwnerToken = symbol;

/** @internal */
export interface RuntimeLeaseRequest {
  kind: string;
  mode: RuntimeLeaseMode;
  resources: readonly RuntimeResource[];
  operationId?: string;
  signal?: AbortSignal;
  conflictPolicy?: RuntimeConflictPolicy;
  ownerToken?: RuntimeLeaseOwnerToken;
}

/** @internal */
export interface RuntimeLease {
  readonly id: string;
  readonly ownerToken: RuntimeLeaseOwnerToken;
  release(): void;
}

/** @internal */
export type RuntimeWriteLeaseRequest = Pick<
  RuntimeLeaseRequest,
  "kind" | "resources" | "operationId" | "ownerToken"
>;

/** @internal */
export async function acquireRuntimeLease(
  manager: RuntimeConcurrencyManager,
  request: RuntimeLeaseRequest
): Promise<RuntimeLease> {
  return manager[acquireLeaseInternal](request);
}

/** @internal */
export function releaseRuntimeLease(lease: RuntimeLease): void {
  lease.release();
}

/** @internal */
export async function runWithRuntimeLease<T>(
  manager: RuntimeConcurrencyManager,
  request: RuntimeLeaseRequest,
  task: (lease: RuntimeLease) => T | Promise<T>
): Promise<T> {
  const lease = await acquireRuntimeLease(manager, request);
  try {
    return await task(lease);
  } finally {
    lease.release();
  }
}

/** @internal */
export function runWithRuntimeWriteLease<T>(
  manager: RuntimeConcurrencyManager,
  request: RuntimeWriteLeaseRequest,
  task: (lease: RuntimeLease) => T
): T {
  const lease = manager[acquireWriteLeaseInternal]({
    ...request,
    mode: "write",
    conflictPolicy: "reject"
  });
  try {
    return task(lease);
  } finally {
    lease.release();
  }
}

/** @internal */
export function assertRuntimeMutationAllowed(
  manager: RuntimeConcurrencyManager,
  resource: RuntimeResource,
  kind: string,
  ownerToken?: RuntimeLeaseOwnerToken
): void {
  manager[assertMutationAllowedInternal](resource, kind, ownerToken);
}

/** @internal */
export function getRuntimeConcurrencyCounts(
  manager: RuntimeConcurrencyManager
): { active: number; waiting: number } {
  return manager[getLeaseCountsInternal]();
}

/** @internal */
export function destroyRuntimeConcurrency(manager: RuntimeConcurrencyManager): void {
  manager[destroyConcurrencyInternal]();
}

/** @internal */
export function withRuntimeLeaseOwner<T extends object>(
  options: T,
  ownerToken: RuntimeLeaseOwnerToken
): T {
  return Object.assign({}, options, { [runtimeLeaseOwner]: ownerToken });
}

/** @internal */
export function getRuntimeLeaseOwner(options: unknown): RuntimeLeaseOwnerToken | undefined {
  return typeof options === "object" && options !== null
    ? (options as RuntimeLeaseOwnerOptions)[runtimeLeaseOwner]
    : undefined;
}
