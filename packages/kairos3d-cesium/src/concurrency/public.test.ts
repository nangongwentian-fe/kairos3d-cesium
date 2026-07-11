import { describe, expect, expectTypeOf, it } from "vitest";
import { RuntimeMutationConflictError } from "./errors";
import { RuntimeConcurrencyManager } from "./manager";
import type {
  RuntimeConcurrencyManagerEvents,
  RuntimeConcurrencyQuery,
  RuntimeLeaseState,
  RuntimeResource,
  RuntimeWhenIdleOptions
} from "./types";

describe("runtime concurrency public contract", () => {
  it("exposes diagnostics without public mutation methods", () => {
    expect(Object.getOwnPropertyNames(RuntimeConcurrencyManager.prototype).sort()).toEqual([
      "constructor",
      "isBusy",
      "list",
      "whenIdle"
    ]);
    expectTypeOf<RuntimeConcurrencyManager["isBusy"]>().toEqualTypeOf<
      (resource?: RuntimeResource) => boolean
    >();
    expectTypeOf<RuntimeConcurrencyManager["list"]>().toEqualTypeOf<
      (query?: RuntimeConcurrencyQuery) => RuntimeLeaseState[]
    >();
    expectTypeOf<RuntimeConcurrencyManager["whenIdle"]>().toEqualTypeOf<
      (query?: RuntimeConcurrencyQuery, options?: RuntimeWhenIdleOptions) => Promise<void>
    >();
  });

  it("keeps event and conflict diagnostics stable", () => {
    expectTypeOf<RuntimeConcurrencyManagerEvents["change"]>().toEqualTypeOf<{
      leases: RuntimeLeaseState[];
    }>();
    expectTypeOf<RuntimeConcurrencyManagerEvents["remove"]>().toEqualTypeOf<
      RuntimeLeaseState
    >();
    expectTypeOf<RuntimeMutationConflictError>().toMatchTypeOf<Error & {
      readonly code: "RUNTIME_MUTATION_CONFLICT";
      readonly resource: RuntimeResource;
      readonly holder?: RuntimeLeaseState;
    }>();
  });
});
