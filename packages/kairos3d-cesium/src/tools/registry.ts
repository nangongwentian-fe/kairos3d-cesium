import type { Tool, ToolFactory } from "./types";
import type { KairosMap } from "../core";

export class ToolRegistry {
  private readonly factories = new Map<string, ToolFactory>();

  register<TOptions>(id: string, factory: ToolFactory<TOptions>): void {
    this.factories.set(id, factory as ToolFactory);
  }

  unregister(id: string): void {
    this.factories.delete(id);
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  create(id: string, map: KairosMap): Tool {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`Tool "${id}" is not registered.`);
    }

    return factory(map);
  }
}

export const toolRegistry = new ToolRegistry();

export function registerTool<TOptions>(id: string, factory: ToolFactory<TOptions>): void {
  toolRegistry.register(id, factory);
}
