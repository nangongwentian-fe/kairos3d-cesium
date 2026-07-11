/** @internal */
export const acquireLeaseInternal = Symbol("runtime-concurrency-acquire");

/** @internal */
export const acquireWriteLeaseInternal = Symbol(
  "runtime-concurrency-acquire-write"
);

/** @internal */
export const releaseLeaseInternal = Symbol("runtime-concurrency-release");

/** @internal */
export const assertMutationAllowedInternal = Symbol(
  "runtime-concurrency-assert-mutation"
);

/** @internal */
export const getLeaseCountsInternal = Symbol("runtime-concurrency-counts");

/** @internal */
export const destroyConcurrencyInternal = Symbol("runtime-concurrency-destroy");

/** @internal */
export const emitLeaseChangeInternal = Symbol("runtime-concurrency-emit-change");

/** @internal */
export const emitLeaseRemoveInternal = Symbol("runtime-concurrency-emit-remove");
