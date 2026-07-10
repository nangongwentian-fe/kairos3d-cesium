import { Cartesian3 } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { KairosMap } from "../core";
import { OperationCanceledError } from "../operations";

vi.mock("../tools/interactive-tool", () => ({
  InteractiveTool: class InteractiveToolMock {
    constructor(
      protected readonly map: KairosMap,
      readonly id: string
    ) {}

    stop(): void {}

    protected notifyComplete(): void {}
  }
}));

import {
  ProfileDrawTool,
  TerrainContourDrawTool,
  VisibilityPickTool
} from "./analysis-tools";

describe("analysis tool operation cancellation", () => {
  it("aborts visibility computation when the tool stops", async () => {
    const map = createMapMock();
    const tool = new VisibilityPickTool(map);
    Object.assign(tool, {
      startPosition: Cartesian3.fromDegrees(114, 22, 10),
      options: {},
      completed: false
    });

    const promise = invokeFinish(tool, Cartesian3.fromDegrees(114.01, 22.01, 10));
    await Promise.resolve();
    const signal = vi.mocked(map.analysis.visibility.compute).mock.calls[0][1]?.signal;
    tool.stop();

    await expect(promise).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
    expect(map.tools.stop).not.toHaveBeenCalled();
  });

  it("aborts profile computation when the tool stops", async () => {
    const map = createMapMock();
    const tool = new ProfileDrawTool(map);
    Object.assign(tool, {
      positions: [
        Cartesian3.fromDegrees(114, 22, 10),
        Cartesian3.fromDegrees(114.01, 22.01, 10)
      ],
      options: {},
      completed: false
    });

    const promise = invokeFinish(tool);
    await Promise.resolve();
    const signal = vi.mocked(map.analysis.profile.compute).mock.calls[0][1]?.signal;
    tool.stop();

    await expect(promise).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
    expect(map.tools.stop).not.toHaveBeenCalled();
  });

  it("aborts terrain computation when the tool stops", async () => {
    const map = createMapMock();
    const tool = new TerrainContourDrawTool(map);
    Object.assign(tool, {
      positions: [
        Cartesian3.fromDegrees(114, 22, 10),
        Cartesian3.fromDegrees(114.01, 22, 10),
        Cartesian3.fromDegrees(114.01, 22.01, 10)
      ],
      options: { interval: 5 },
      completed: false
    });

    const promise = invokeFinish(tool);
    await Promise.resolve();
    const signal = vi.mocked(map.analysis.terrain.contour).mock.calls[0][1]?.signal;
    tool.stop();

    await expect(promise).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
    expect(map.tools.stop).not.toHaveBeenCalled();
  });
});

function createMapMock(): KairosMap {
  return {
    viewer: {
      entities: {
        remove: vi.fn()
      }
    },
    tools: {
      stop: vi.fn(),
      emitComplete: vi.fn()
    },
    analysis: {
      visibility: { compute: vi.fn(createCanceledPromise) },
      profile: { compute: vi.fn(createCanceledPromise) },
      terrain: { contour: vi.fn(createCanceledPromise) }
    }
  } as unknown as KairosMap;
}

function createCanceledPromise(
  _options: unknown,
  operationOptions?: { signal?: AbortSignal }
): Promise<never> {
  const signal = operationOptions?.signal;
  return new Promise((_resolve, reject) => {
    const rejectCanceled = () => reject(new OperationCanceledError("analysis-tool-test"));
    if (signal?.aborted) {
      rejectCanceled();
    } else {
      signal?.addEventListener("abort", rejectCanceled, { once: true });
    }
  });
}

function invokeFinish(tool: object, ...args: unknown[]): Promise<void> {
  return (tool as { finish(...values: unknown[]): Promise<void> }).finish(...args);
}
