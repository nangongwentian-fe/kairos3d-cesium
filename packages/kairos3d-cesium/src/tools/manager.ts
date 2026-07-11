import type { KairosMap } from "../core";
import { Evented } from "../core";
import {
  runWithRuntimeLease,
  runWithRuntimeWriteLease,
  type RuntimeLeaseOwnerToken
} from "../concurrency/lease";
import { registerDefaultToolFactories } from "./defaults";
import { toolRegistry, type ToolRegistry } from "./registry";
import type {
  Tool,
  ToolCancelEvent,
  ToolClearEvent,
  ToolCompleteResult,
  ToolPointAddEvent
} from "./types";

export interface ToolManagerEvents {
  start: Tool;
  stop: Tool;
  cancel: ToolCancelEvent;
  complete: ToolCompleteResult;
  "point-add": ToolPointAddEvent;
  clear: ToolClearEvent;
}

export class ToolManager extends Evented<ToolManagerEvents> {
  private activeTool?: Tool;
  private destroyed = false;

  constructor(
    private readonly map: KairosMap,
    private readonly registry: ToolRegistry = toolRegistry
  ) {
    super();
    registerDefaultToolFactories();
  }

  get active(): Tool | undefined {
    return this.activeTool;
  }

  async start<TOptions>(id: string, options?: TOptions): Promise<Tool<TOptions>> {
    this.assertActive();
    return runWithRuntimeLease(
      this.map.concurrency,
      {
        kind: "tools.start",
        mode: "write",
        resources: ["tools"],
        conflictPolicy: "reject"
      },
      async () => {
        this.stopInternal();

        const tool = this.registry.create(id, this.map) as Tool<TOptions>;
        try {
          await tool.start(options);
        } catch (error) {
          tool.destroy();
          throw error;
        }
        if (this.destroyed) {
          try {
            tool.stop();
          } finally {
            tool.destroy();
          }
          throw new Error("ToolManager has been destroyed.");
        }
        this.activeTool = tool;
        this.emit("start", tool);
        return tool;
      }
    );
  }

  stop(): void {
    runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "tools.stop", resources: ["tools"] },
      () => this.stopInternal()
    );
  }

  /** @internal */
  stopWithRuntimeLease(ownerToken: RuntimeLeaseOwnerToken): void {
    runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "tools.stop", resources: ["tools"], ownerToken },
      () => this.stopInternal()
    );
  }

  private stopInternal(): void {
    if (!this.activeTool) {
      return;
    }

    const tool = this.activeTool;
    tool.stop();
    tool.destroy();
    this.activeTool = undefined;
    this.emit("stop", tool);
  }

  cancel(): void {
    runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind: "tools.cancel", resources: ["tools"] },
      () => this.cancelInternal()
    );
  }

  private cancelInternal(): void {
    if (!this.activeTool) {
      return;
    }

    const tool = this.activeTool;
    if (tool.cancel) {
      tool.cancel();
    } else {
      tool.stop();
    }

    tool.destroy();
    this.activeTool = undefined;
    this.emit("cancel", { toolId: tool.id });
    this.emit("stop", tool);
  }

  emitComplete(result: ToolCompleteResult): void {
    this.emit("complete", result);
  }

  emitPointAdd(data: ToolPointAddEvent): void {
    this.emit("point-add", data);
  }

  emitClear(data: ToolClearEvent): void {
    this.emit("clear", data);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.stopInternal();
    this.off();
  }

  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("ToolManager has been destroyed.");
    }
  }
}
