import { describe, expectTypeOf, it } from "vitest";
import type { OperationManager } from "./manager";
import type {
  AsyncOperationOptions,
  OperationErrorInfo,
  OperationManagerEvents,
  OperationQuery,
  OperationState,
  OperationStatus
} from "./types";

describe("operations public types", () => {
  it("keeps the operation contract stable", () => {
    expectTypeOf<OperationStatus>().toEqualTypeOf<
      "running" | "succeeded" | "failed" | "canceled"
    >();
    expectTypeOf<OperationManager["get"]>().toBeFunction();
    expectTypeOf<OperationManager["list"]>().toBeFunction();
    expectTypeOf<OperationManager["cancel"]>().toBeFunction();
    expectTypeOf<OperationManager["cancelAll"]>().toBeFunction();
    expectTypeOf<OperationManager["clearFinished"]>().toBeFunction();
    expectTypeOf<AsyncOperationOptions>().toMatchTypeOf<{
      signal?: AbortSignal;
      operationId?: string;
    }>();
    expectTypeOf<OperationState>().toMatchTypeOf<{
      id: string;
      kind: string;
      status: OperationStatus;
      startedAt: Date;
    }>();
    expectTypeOf<OperationErrorInfo>().toMatchTypeOf<{
      name: string;
      message: string;
    }>();
    expectTypeOf<OperationQuery>().toMatchTypeOf<{
      kind?: string;
      status?: OperationStatus | OperationStatus[];
    }>();
    expectTypeOf<OperationManagerEvents["change"]>().toEqualTypeOf<OperationState>();
  });
});
