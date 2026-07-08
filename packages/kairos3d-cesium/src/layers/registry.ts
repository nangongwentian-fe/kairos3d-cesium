import type { BaseLayerConfig, LayerAdapter, LayerFactory } from "./types";

export class LayerRegistry {
  private readonly factories = new Map<string, LayerFactory>();

  register<TConfig extends BaseLayerConfig>(
    type: TConfig["type"],
    factory: LayerFactory<TConfig>
  ): void {
    this.factories.set(type, factory as LayerFactory);
  }

  unregister(type: string): void {
    this.factories.delete(type);
  }

  has(type: string): boolean {
    return this.factories.has(type);
  }

  create<TConfig extends BaseLayerConfig>(config: TConfig): Promise<LayerAdapter> | LayerAdapter {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(`Layer type "${config.type}" is not registered.`);
    }

    return factory(config);
  }
}

export const layerRegistry = new LayerRegistry();

export function registerLayer<TConfig extends BaseLayerConfig>(
  type: TConfig["type"],
  factory: LayerFactory<TConfig>
): void {
  layerRegistry.register(type, factory);
}
