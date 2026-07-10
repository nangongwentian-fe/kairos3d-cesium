import type {
  WidgetController,
  WidgetDefinition,
  WidgetPlatform
} from "@kairos3d/cesium-widget";
import type { AnyReactWidgetModule, ReactWidgetModule } from "./types";

type RegistryListener = () => void;

const defaultController = (): WidgetController => ({
  activate: () => undefined,
  deactivate: () => undefined,
  destroy: () => undefined
});

export function defineReactWidget<TOptions>(
  module: ReactWidgetModule<TOptions>
): ReactWidgetModule<TOptions> {
  return module;
}

export class ReactWidgetRegistry {
  private readonly modules = new Map<string, AnyReactWidgetModule>();
  private readonly ownedDefinitions = new Set<string>();
  private readonly listeners = new Set<RegistryListener>();
  private snapshot: readonly AnyReactWidgetModule[] = [];
  private destroyed = false;

  constructor(private readonly platform: WidgetPlatform) {}

  register<TOptions>(module: ReactWidgetModule<TOptions>): ReactWidgetModule<TOptions> {
    this.assertAlive();
    assertModule(module);
    if (this.modules.has(module.id)) {
      throw new Error(`React widget ${module.id} is already registered.`);
    }

    if (!this.platform.getDefinition(module.id)) {
      this.platform.register(toWidgetDefinition(module));
      this.ownedDefinitions.add(module.id);
    }

    this.modules.set(module.id, module as AnyReactWidgetModule);
    this.publish();
    return module;
  }

  async unregister(id: string): Promise<boolean> {
    this.assertAlive();
    if (!this.modules.has(id)) {
      return false;
    }

    try {
      if (this.ownedDefinitions.has(id)) {
        await this.platform.unregister(id);
      }
    } finally {
      this.ownedDefinitions.delete(id);
      this.modules.delete(id);
      this.publish();
    }
    return true;
  }

  get(id: string): AnyReactWidgetModule | undefined {
    return this.modules.get(id);
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  list(): readonly AnyReactWidgetModule[] {
    return [...this.snapshot];
  }

  getSnapshot = (): readonly AnyReactWidgetModule[] => this.snapshot;

  subscribe = (listener: RegistryListener): (() => void) => {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    const errors: unknown[] = [];
    for (const id of [...this.modules.keys()]) {
      try {
        await this.unregister(id);
      } catch (error) {
        errors.push(error);
      }
    }
    this.destroyed = true;
    this.listeners.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more React widgets failed to unregister.");
    }
  }

  private publish(): void {
    this.snapshot = [...this.modules.values()];
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("React widget registry is destroyed.");
    }
  }
}

function toWidgetDefinition<TOptions>(
  module: ReactWidgetModule<TOptions>
): WidgetDefinition<TOptions> {
  return {
    id: module.id,
    name: module.name,
    group: module.group,
    exclusiveGroup: module.exclusiveGroup,
    defaultPlacement: module.defaultPlacement,
    create: module.create ?? (() => defaultController())
  };
}

function assertModule(module: AnyReactWidgetModule): void {
  if (module.id.trim().length === 0) {
    throw new Error("React widget id must not be empty.");
  }
  if (module.name.trim().length === 0) {
    throw new Error("React widget name must not be empty.");
  }
  if (!module.component) {
    throw new Error(`React widget ${module.id} must define a component.`);
  }
}
