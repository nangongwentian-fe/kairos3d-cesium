import { describe, expect, it, vi } from "vitest";
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
  it("keeps only one active tool", async () => {
    const registry = new ToolRegistry();
    const first = createTool("first");
    const second = createTool("second");

    registry.register("first", () => first);
    registry.register("second", () => second);

    const manager = new ToolManager({} as never, registry);
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

    const manager = new ToolManager({} as never, registry);
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
    const manager = new ToolManager({} as never, new ToolRegistry());
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
