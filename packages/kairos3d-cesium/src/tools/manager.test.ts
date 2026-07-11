import { describe, expect, it, vi } from "vitest";
import { RuntimeConcurrencyManager } from "../concurrency";
import { acquireRuntimeLease } from "../concurrency/lease";
import { ToolManager } from "./manager";
import { ToolRegistry } from "./registry";
import type { Tool } from "./types";

function createTool(id: string): Tool {
  return {
    id,
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn()
  };
}

describe("ToolManager", () => {
  it("destroys a tool whose start rejects", async () => {
    const concurrency = new RuntimeConcurrencyManager();
    const registry = new ToolRegistry();
    const tool = createTool("rejected");
    vi.mocked(tool.start).mockRejectedValue(new Error("start failed"));
    registry.register("rejected", () => tool);
    const manager = new ToolManager({ concurrency } as never, registry);

    await expect(manager.start("rejected")).rejects.toThrow("start failed");
    expect(tool.destroy).toHaveBeenCalledOnce();
    expect(manager.active).toBeUndefined();
    expect(concurrency.isBusy()).toBe(false);
  });

  it("cleans up a delayed start after destroy without late events", async () => {
    const concurrency = new RuntimeConcurrencyManager();
    const registry = new ToolRegistry();
    let resolveStart!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveStart = resolve;
    });
    const tool = createTool("delayed");
    vi.mocked(tool.start).mockReturnValue(gate);
    registry.register("delayed", () => tool);
    const manager = new ToolManager({ concurrency } as never, registry);
    const started = vi.fn();
    manager.on("start", started);

    const pending = manager.start("delayed");
    await vi.waitFor(() => expect(tool.start).toHaveBeenCalledOnce());
    manager.destroy();
    resolveStart();

    await expect(pending).rejects.toThrow("destroyed");
    expect(tool.stop).toHaveBeenCalledOnce();
    expect(tool.destroy).toHaveBeenCalledOnce();
    expect(started).not.toHaveBeenCalled();
    expect(manager.active).toBeUndefined();
    expect(concurrency.isBusy()).toBe(false);
  });

  it("rejects external mutations during an exclusive lease and accepts its owner", async () => {
    const concurrency = new RuntimeConcurrencyManager();
    const registry = new ToolRegistry();
    const tool = createTool("leased");
    registry.register("leased", () => tool);
    const manager = new ToolManager({ concurrency } as never, registry);
    await manager.start("leased");
    const lease = await acquireRuntimeLease(concurrency, {
      kind: "scene.load",
      mode: "exclusive",
      resources: ["scene"]
    });

    expect(() => manager.stop()).toThrow("Runtime resource");
    manager.stopWithRuntimeLease(lease.ownerToken);
    expect(tool.stop).toHaveBeenCalledOnce();

    await expect(manager.start("leased")).rejects.toThrow("Runtime resource");
    lease.release();
  });

  it("keeps only one active tool", async () => {
    const registry = new ToolRegistry();
    const first = createTool("first");
    const second = createTool("second");

    registry.register("first", () => first);
    registry.register("second", () => second);

    const manager = new ToolManager(
      { concurrency: new RuntimeConcurrencyManager() } as never,
      registry
    );
    await manager.start("first");
    await manager.start("second");

    expect(first.stop).toHaveBeenCalledOnce();
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(second.start).toHaveBeenCalledOnce();
    expect(manager.active).toBe(second);
  });

  it("cancels the active tool and emits cancel before clearing active", async () => {
    const registry = new ToolRegistry();
    const tool = {
      ...createTool("cancelable"),
      cancel: vi.fn()
    };
    const listener = vi.fn();

    registry.register("cancelable", () => tool);

    const manager = new ToolManager(
      { concurrency: new RuntimeConcurrencyManager() } as never,
      registry
    );
    manager.on("cancel", listener);
    await manager.start("cancelable");
    manager.cancel();

    expect(tool.cancel).toHaveBeenCalledOnce();
    expect(tool.destroy).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ data: { toolId: "cancelable" } })
    );
    expect(manager.active).toBeUndefined();
  });

  it("emits complete, point-add, and clear events", () => {
    const manager = new ToolManager(
      { concurrency: new RuntimeConcurrencyManager() } as never,
      new ToolRegistry()
    );
    const complete = vi.fn();
    const pointAdd = vi.fn();
    const clear = vi.fn();

    manager.on("complete", complete);
    manager.on("point-add", pointAdd);
    manager.on("clear", clear);

    manager.emitComplete({ id: "draw-1" } as never);
    manager.emitPointAdd({ toolId: "draw.polyline", positions: [] });
    manager.emitClear({ source: "draw", ids: ["draw-1"] });

    expect(complete).toHaveBeenCalledOnce();
    expect(pointAdd).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
  });
});
