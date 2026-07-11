import type { Material, MaterialProperty } from "cesium";
import { runWithRuntimeWriteLease } from "../concurrency/lease";
import { RuntimeConcurrencyManager } from "../concurrency/manager";
import { builtInMaterialDefinitions } from "./builtins";
import type {
  EntityMaterialDescriptor,
  MaterialDefinition,
  MaterialDefinitionInfo,
  MaterialDescriptorBase,
  MaterialTarget,
  PrimitiveMaterialDescriptor
} from "./types";

export class MaterialManager {
  private readonly definitions = new Map<string, MaterialDefinition>();
  private readonly builtInTypes = new Set<string>();
  private destroyed = false;

  constructor(
    private readonly concurrency: RuntimeConcurrencyManager = new RuntimeConcurrencyManager()
  ) {
    for (const definition of builtInMaterialDefinitions) {
      this.definitions.set(definition.type, definition);
      this.builtInTypes.add(definition.type);
    }
  }

  register<TDescriptor extends MaterialDescriptorBase>(
    definition: MaterialDefinition<TDescriptor>
  ): void {
    this.assertAlive();
    runWithRuntimeWriteLease(
      this.concurrency,
      { kind: "materials.register", resources: ["materials"] },
      () => {
        validateDefinition(definition as unknown as MaterialDefinition);
        if (this.definitions.has(definition.type)) {
          throw new Error(`Material definition \"${definition.type}\" is already registered.`);
        }
        this.definitions.set(
          definition.type,
          cloneDefinition(definition as unknown as MaterialDefinition)
        );
      }
    );
  }

  unregister(type: string): boolean {
    this.assertAlive();
    return runWithRuntimeWriteLease(
      this.concurrency,
      { kind: "materials.unregister", resources: ["materials"] },
      () => {
        assertType(type);
        if (this.builtInTypes.has(type)) {
          throw new Error(`Built-in material definition \"${type}\" cannot be unregistered.`);
        }
        return this.definitions.delete(type);
      }
    );
  }

  has(type: string): boolean {
    this.assertAlive();
    return this.definitions.has(type);
  }

  list(): MaterialDefinitionInfo[] {
    this.assertAlive();
    return [...this.definitions.values()].map((definition) => ({
      type: definition.type,
      targets: [...definition.targets],
      builtIn: this.builtInTypes.has(definition.type)
    }));
  }

  createProperty(descriptor: EntityMaterialDescriptor): MaterialProperty {
    const definition = this.resolve(descriptor, "entity");
    if (!definition.createProperty) {
      throw new Error(`Material definition \"${descriptor.type}\" cannot create Entity properties.`);
    }
    definition.validate?.(descriptor);
    return definition.createProperty(descriptor);
  }

  async createMaterial(descriptor: PrimitiveMaterialDescriptor): Promise<Material> {
    const definition = this.resolve(descriptor, "primitive");
    if (!definition.createMaterial) {
      throw new Error(`Material definition \"${descriptor.type}\" cannot create Primitive materials.`);
    }
    definition.validate?.(descriptor);
    return await definition.createMaterial(descriptor);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    for (const type of [...this.definitions.keys()]) {
      if (!this.builtInTypes.has(type)) {
        this.definitions.delete(type);
      }
    }
    this.destroyed = true;
  }

  private resolve(
    descriptor: MaterialDescriptorBase,
    target: MaterialTarget
  ): MaterialDefinition {
    this.assertAlive();
    validateDescriptor(descriptor, target);
    const definition = this.definitions.get(descriptor.type);
    if (!definition) {
      throw new Error(`Material definition \"${descriptor.type}\" is not registered.`);
    }
    if (!definition.targets.includes(target)) {
      throw new Error(`Material \"${descriptor.type}\" does not support target \"${target}\".`);
    }
    return definition;
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("MaterialManager has been destroyed.");
    }
  }
}

function validateDefinition(definition: MaterialDefinition): void {
  if (!definition || typeof definition !== "object") {
    throw new Error("Material definition must be an object.");
  }
  assertType(definition.type);
  if (!Array.isArray(definition.targets) || definition.targets.length === 0) {
    throw new Error("MaterialDefinition.targets must not be empty.");
  }
  const targets = new Set<MaterialTarget>();
  for (const target of definition.targets) {
    if (target !== "entity" && target !== "primitive") {
      throw new Error(`Unsupported material target \"${String(target)}\".`);
    }
    if (targets.has(target)) {
      throw new Error(`MaterialDefinition.targets contains duplicate \"${target}\".`);
    }
    targets.add(target);
    if (target === "entity" && !definition.createProperty) {
      throw new Error("Entity material definitions require createProperty().");
    }
    if (target === "primitive" && !definition.createMaterial) {
      throw new Error("Primitive material definitions require createMaterial().");
    }
  }
}

function validateDescriptor(descriptor: MaterialDescriptorBase, target: MaterialTarget): void {
  if (!descriptor || typeof descriptor !== "object") {
    throw new Error("Material descriptor must be an object.");
  }
  assertType(descriptor.type);
  if (descriptor.target !== target) {
    throw new Error(`Material descriptor target must be \"${target}\".`);
  }
}

function assertType(type: string): void {
  if (typeof type !== "string" || !type.trim()) {
    throw new Error("Material type must be a non-empty string.");
  }
}

function cloneDefinition(definition: MaterialDefinition): MaterialDefinition {
  return {
    ...definition,
    targets: [...definition.targets]
  };
}
