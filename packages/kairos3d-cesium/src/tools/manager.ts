import type { KairosMap } from "../core";
import { Evented } from "../core";
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
    this.stop();

    const tool = this.registry.create(id, this.map) as Tool<TOptions>;
    await tool.start(options);
    this.activeTool = tool;
    this.emit("start", tool);
    return tool;
  }

  stop(): void {
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
    this.stop();
    this.off();
  }
}
