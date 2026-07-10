import { Evented } from "@kairos3d/cesium/core";
import type {
  JsonValue,
  KairosPlatformLoadOptions,
  KairosPlatformSnapshot,
  KairosPlatformSnapshotOptions,
  WidgetContext,
  WidgetController,
  WidgetDefinition,
  WidgetOperation,
  WidgetPlacement,
  WidgetPlatformEvents,
  WidgetPlatformOptions,
  WidgetSnapshotSaveOptions,
  WidgetSnapshotStorageAdapter,
  WidgetSnapshotStorageRecord,
  WidgetState,
  WidgetStatus,
  WidgetWorkspaceLoadOptions,
  WidgetWorkspaceSnapshot
} from "./types";
import {
  assertKairosPlatformSnapshot,
  assertWidgetPlacement,
  assertWidgetWorkspaceSnapshot,
  cloneJsonValue,
  clonePlacement
} from "./snapshot/validation";

interface WidgetEntry {
  definition: WidgetDefinition<any>;
  status: WidgetStatus;
  active: boolean;
  placement?: WidgetPlacement;
  controller?: WidgetController;
  activationController?: AbortController;
  context?: WidgetContext;
  error?: Error;
}

export class WidgetPlatform extends Evented<WidgetPlatformEvents> {
  private readonly entries = new Map<string, WidgetEntry>();
  private readonly map: WidgetPlatformOptions["map"];
  private readonly snapshotStorage?: WidgetSnapshotStorageAdapter;
  private transitionTail: Promise<void> = Promise.resolve();
  private destroyed = false;

  constructor(options: WidgetPlatformOptions) {
    super();
    this.map = options.map;
    this.snapshotStorage = options.snapshotStorage;
  }

  register<TOptions>(definition: WidgetDefinition<TOptions>): WidgetState {
    this.assertAlive();
    assertDefinition(definition);
    if (this.entries.has(definition.id)) {
      throw new Error(`Widget ${definition.id} is already registered.`);
    }

    const entry: WidgetEntry = {
      definition: {
        ...definition,
        defaultPlacement: definition.defaultPlacement
          ? clonePlacement(definition.defaultPlacement)
          : undefined
      },
      status: "inactive",
      active: false,
      placement: definition.defaultPlacement
        ? clonePlacement(definition.defaultPlacement)
        : undefined
    };
    this.entries.set(definition.id, entry);
    const state = this.stateOf(entry);
    this.emit("register", { state });
    return state;
  }

  async unregister(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      this.assertAlive();
      const entry = this.entries.get(id);
      if (!entry) {
        return false;
      }

      let failure: unknown;
      try {
        await this.destroyEntry(entry);
      } catch (error) {
        failure = error;
      } finally {
        this.entries.delete(id);
        this.emit("unregister", { id });
      }
      if (failure) {
        throw failure;
      }
      return true;
    });
  }

  async activate<TOptions = unknown>(id: string, options?: TOptions): Promise<WidgetState> {
    return this.enqueue(async () => {
      this.assertAlive();
      return this.activateNow(this.requireEntry(id), options);
    });
  }

  async deactivate(id: string): Promise<WidgetState> {
    return this.enqueue(async () => {
      this.assertAlive();
      return this.deactivateNow(this.requireEntry(id));
    });
  }

  async toggle<TOptions = unknown>(id: string, options?: TOptions): Promise<WidgetState> {
    return this.enqueue(async () => {
      this.assertAlive();
      const entry = this.requireEntry(id);
      return entry.active
        ? this.deactivateNow(entry)
        : this.activateNow(entry, options);
    });
  }

  get(id: string): WidgetState | undefined {
    const entry = this.entries.get(id);
    return entry ? this.stateOf(entry) : undefined;
  }

  list(): WidgetState[] {
    return [...this.entries.values()].map((entry) => this.stateOf(entry));
  }

  getDefinition(id: string): WidgetDefinition | undefined {
    const definition = this.entries.get(id)?.definition;
    return definition
      ? {
          ...definition,
          defaultPlacement: definition.defaultPlacement
            ? clonePlacement(definition.defaultPlacement)
            : undefined
        }
      : undefined;
  }

  getController<TController extends WidgetController = WidgetController>(
    id: string
  ): TController | undefined {
    return this.entries.get(id)?.controller as TController | undefined;
  }

  setPlacement(id: string, placement: WidgetPlacement | undefined): WidgetState {
    this.assertAlive();
    const entry = this.requireEntry(id);
    if (placement) {
      assertWidgetPlacement(placement);
    }
    entry.placement = placement ? clonePlacement(placement) : undefined;
    this.emit("placement-change", {
      id,
      placement: entry.placement ? clonePlacement(entry.placement) : undefined
    });
    return this.stateOf(entry);
  }

  toJSON(): WidgetWorkspaceSnapshot {
    this.assertAlive();
    const placements: Record<string, WidgetPlacement> = {};
    const states: Record<string, JsonValue> = {};

    for (const entry of this.entries.values()) {
      if (entry.placement) {
        placements[entry.definition.id] = clonePlacement(entry.placement);
      }
      const state = entry.controller?.toJSON?.();
      if (state !== undefined) {
        states[entry.definition.id] = cloneJsonValue(
          state,
          `Widget state ${entry.definition.id}`
        );
      }
    }

    return {
      version: 1,
      activeWidgetIds: [...this.entries.values()]
        .filter((entry) => entry.active)
        .map((entry) => entry.definition.id),
      placements,
      states,
      createdAt: new Date().toISOString()
    };
  }

  async load(
    snapshot: WidgetWorkspaceSnapshot,
    options: WidgetWorkspaceLoadOptions = {}
  ): Promise<void> {
    return this.enqueue(async () => {
      this.assertAlive();
      await this.loadWorkspaceNow(snapshot, options);
    });
  }

  toPlatformJSON(options: KairosPlatformSnapshotOptions = {}): KairosPlatformSnapshot {
    this.assertAlive();
    return {
      version: 1,
      scene: this.map.sceneState.toJSON(options.scene),
      workspace: this.toJSON(),
      createdAt: new Date().toISOString()
    };
  }

  async loadPlatform(
    snapshot: KairosPlatformSnapshot,
    options: KairosPlatformLoadOptions = {}
  ): Promise<void> {
    return this.enqueue(async () => {
      this.assertAlive();
      assertKairosPlatformSnapshot(snapshot);
      this.validateWorkspaceRegistrations(snapshot.workspace, options.workspace);
      await this.map.sceneState.load(snapshot.scene, options.scene);
      await this.loadWorkspaceNow(snapshot.workspace, options.workspace);
    });
  }

  async saveSnapshot(id: string, options: WidgetSnapshotSaveOptions = {}): Promise<void> {
    return this.enqueue(async () => {
      this.assertAlive();
      const storage = this.requireStorage();
      const snapshot: KairosPlatformSnapshot = {
        version: 1,
        scene: this.map.sceneState.toJSON(options.scene),
        workspace: this.toJSON(),
        createdAt: new Date().toISOString()
      };
      await storage.save(id, snapshot, { name: options.name });
      this.emit("snapshot-save", { id });
    });
  }

  async loadSnapshot(
    id: string,
    options: KairosPlatformLoadOptions = {}
  ): Promise<boolean> {
    return this.enqueue(async () => {
      this.assertAlive();
      const snapshot = await this.requireStorage().load(id);
      if (!snapshot) {
        return false;
      }
      assertKairosPlatformSnapshot(snapshot);
      this.validateWorkspaceRegistrations(snapshot.workspace, options.workspace);
      await this.map.sceneState.load(snapshot.scene, options.scene);
      await this.loadWorkspaceNow(snapshot.workspace, options.workspace);
      this.emit("snapshot-load", { id });
      return true;
    });
  }

  async removeSnapshot(id: string): Promise<boolean> {
    this.assertAlive();
    const removed = await this.requireStorage().remove(id);
    this.emit("snapshot-remove", { id, removed });
    return removed;
  }

  async listSnapshots(): Promise<WidgetSnapshotStorageRecord[]> {
    this.assertAlive();
    return this.requireStorage().list();
  }

  hasSnapshotStorage(): boolean {
    return Boolean(this.snapshotStorage);
  }

  async destroy(): Promise<void> {
    return this.enqueue(async () => {
      if (this.destroyed) {
        return;
      }
      const errors: unknown[] = [];
      for (const entry of this.entries.values()) {
        try {
          await this.destroyEntry(entry);
        } catch (error) {
          errors.push(error);
        }
      }
      this.entries.clear();
      this.destroyed = true;
      this.off();
      if (errors.length > 0) {
        throw new AggregateError(errors, "One or more widgets failed to destroy.");
      }
    });
  }

  private async activateNow<TOptions>(
    entry: WidgetEntry,
    options?: TOptions
  ): Promise<WidgetState> {
    if (entry.active) {
      return this.stateOf(entry);
    }

    this.beginActivation(entry);
    let controller: WidgetController | undefined;
    let activationStarted = false;
    try {
      controller = await this.ensureController(entry, options);
      activationStarted = true;
      await controller.activate();

      const group = entry.definition.exclusiveGroup;
      if (group) {
        for (const candidate of this.entries.values()) {
          if (
            candidate !== entry &&
            candidate.active &&
            candidate.definition.exclusiveGroup === group
          ) {
            await this.deactivateNow(candidate);
          }
        }
      }

      entry.active = true;
      this.setStatus(entry, "active");
      const state = this.stateOf(entry);
      this.emit("activate", { state });
      return state;
    } catch (error) {
      if (activationStarted && controller) {
        try {
          await controller.deactivate();
        } catch {
          // The original activation failure remains the reported error.
        }
      }
      entry.activationController?.abort();
      entry.active = false;
      throw this.recordError(
        entry,
        entry.controller ? "activate" : "create",
        error
      );
    }
  }

  private async deactivateNow(entry: WidgetEntry): Promise<WidgetState> {
    if (!entry.active) {
      if (entry.status === "error") {
        this.setStatus(entry, "inactive");
      }
      return this.stateOf(entry);
    }

    this.setStatus(entry, "deactivating");
    entry.activationController?.abort();
    try {
      await entry.controller?.deactivate();
      entry.active = false;
      this.setStatus(entry, "inactive");
      const state = this.stateOf(entry);
      this.emit("deactivate", { state });
      return state;
    } catch (error) {
      throw this.recordError(entry, "deactivate", error);
    }
  }

  private async ensureController<TOptions>(
    entry: WidgetEntry,
    options?: TOptions
  ): Promise<WidgetController> {
    if (entry.controller) {
      return entry.controller;
    }
    entry.context ??= this.createContext(entry);
    try {
      const controller = await entry.definition.create(entry.context, options);
      assertController(controller, entry.definition.id);
      entry.controller = controller;
      return controller;
    } catch (error) {
      throw toError(error);
    }
  }

  private async destroyEntry(entry: WidgetEntry): Promise<void> {
    const errors: unknown[] = [];
    if (entry.active) {
      try {
        await this.deactivateNow(entry);
      } catch (error) {
        errors.push(error);
      }
    }
    entry.activationController?.abort();
    if (entry.controller) {
      try {
        await entry.controller.destroy();
      } catch (error) {
        errors.push(this.recordError(entry, "destroy", error));
      }
    }
    entry.controller = undefined;
    entry.context = undefined;
    entry.activationController = undefined;
    entry.active = false;
    if (errors.length === 0) {
      this.setStatus(entry, "inactive");
    } else {
      throw new AggregateError(errors, `Widget ${entry.definition.id} failed to destroy.`);
    }
  }

  private async loadWorkspaceNow(
    snapshot: WidgetWorkspaceSnapshot,
    options: WidgetWorkspaceLoadOptions = {}
  ): Promise<void> {
    assertWidgetWorkspaceSnapshot(snapshot);
    this.validateWorkspaceRegistrations(snapshot, options);

    for (const entry of this.entries.values()) {
      await this.destroyEntry(entry);
      entry.placement = entry.definition.defaultPlacement
        ? clonePlacement(entry.definition.defaultPlacement)
        : undefined;
    }

    for (const [id, placement] of Object.entries(snapshot.placements)) {
      const entry = this.entries.get(id);
      if (entry) {
        entry.placement = clonePlacement(placement);
      }
    }

    for (const [id, state] of Object.entries(snapshot.states)) {
      const entry = this.entries.get(id);
      if (!entry) {
        continue;
      }
      this.beginActivation(entry);
      try {
        const controller = await this.ensureController(entry);
        if (!controller.load) {
          if (options.strict ?? true) {
            throw new Error(`Widget ${id} does not support snapshot loading.`);
          }
        } else {
          await controller.load(cloneJsonValue(state, `Widget state ${id}`));
        }
      } catch (error) {
        throw this.recordError(entry, "load", error);
      } finally {
        entry.activationController?.abort();
        if (entry.status !== "error") {
          this.setStatus(entry, "inactive");
        }
      }
    }

    for (const id of snapshot.activeWidgetIds) {
      const entry = this.entries.get(id);
      if (entry) {
        await this.activateNow(entry);
      }
    }

    this.emit("load", { snapshot: cloneWorkspaceSnapshot(snapshot) });
  }

  private validateWorkspaceRegistrations(
    snapshot: WidgetWorkspaceSnapshot,
    options: WidgetWorkspaceLoadOptions = {}
  ): void {
    assertWidgetWorkspaceSnapshot(snapshot);
    const referencedIds = new Set([
      ...snapshot.activeWidgetIds,
      ...Object.keys(snapshot.placements),
      ...Object.keys(snapshot.states)
    ]);
    if (options.strict ?? true) {
      for (const id of referencedIds) {
        if (!this.entries.has(id)) {
          throw new Error(`Widget ${id} is not registered.`);
        }
      }
    }

    const activeGroups = new Map<string, string>();
    for (const id of snapshot.activeWidgetIds) {
      const entry = this.entries.get(id);
      const group = entry?.definition.exclusiveGroup;
      if (!group) {
        continue;
      }
      const existing = activeGroups.get(group);
      if (existing) {
        throw new Error(
          `Widgets ${existing} and ${id} cannot both be active in exclusive group ${group}.`
        );
      }
      activeGroups.set(group, id);
    }
  }

  private beginActivation(entry: WidgetEntry): void {
    entry.activationController?.abort();
    entry.activationController = new AbortController();
    this.setStatus(entry, "activating");
  }

  private createContext(entry: WidgetEntry): WidgetContext {
    return {
      map: this.map,
      platform: this,
      get signal() {
        return entry.activationController?.signal ?? abortedSignal();
      }
    } as WidgetContext;
  }

  private setStatus(entry: WidgetEntry, status: WidgetStatus): void {
    const previous = entry.status;
    entry.status = status;
    if (status !== "error") {
      entry.error = undefined;
    }
    if (previous !== status) {
      this.emit("status-change", {
        id: entry.definition.id,
        previous,
        status
      });
    }
  }

  private recordError(
    entry: WidgetEntry,
    operation: WidgetOperation,
    cause: unknown
  ): Error {
    const error = toError(cause);
    entry.error = error;
    this.setStatus(entry, "error");
    entry.error = error;
    this.emit("error", {
      id: entry.definition.id,
      operation,
      error
    });
    return error;
  }

  private stateOf(entry: WidgetEntry): WidgetState {
    return {
      id: entry.definition.id,
      name: entry.definition.name,
      group: entry.definition.group,
      exclusiveGroup: entry.definition.exclusiveGroup,
      status: entry.status,
      active: entry.active,
      placement: entry.placement ? clonePlacement(entry.placement) : undefined,
      error: entry.error
    };
  }

  private requireEntry(id: string): WidgetEntry {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`Widget ${id} is not registered.`);
    }
    return entry;
  }

  private requireStorage(): WidgetSnapshotStorageAdapter {
    if (!this.snapshotStorage) {
      throw new Error("Widget snapshot storage is not configured.");
    }
    return this.snapshotStorage;
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("Widget platform is destroyed.");
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transitionTail.then(operation, operation);
    this.transitionTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

export function createWidgetPlatform(options: WidgetPlatformOptions): WidgetPlatform {
  return new WidgetPlatform(options);
}

function assertDefinition(definition: WidgetDefinition): void {
  if (definition.id.trim().length === 0) {
    throw new Error("Widget id must not be empty.");
  }
  if (definition.name.trim().length === 0) {
    throw new Error("Widget name must not be empty.");
  }
  if (definition.defaultPlacement) {
    assertWidgetPlacement(definition.defaultPlacement);
  }
}

function assertController(value: unknown, id: string): asserts value is WidgetController {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as WidgetController).activate !== "function" ||
    typeof (value as WidgetController).deactivate !== "function" ||
    typeof (value as WidgetController).destroy !== "function"
  ) {
    throw new Error(`Widget ${id} create() must return a WidgetController.`);
  }
}

function cloneWorkspaceSnapshot(snapshot: WidgetWorkspaceSnapshot): WidgetWorkspaceSnapshot {
  return {
    version: 1,
    activeWidgetIds: [...snapshot.activeWidgetIds],
    placements: Object.fromEntries(
      Object.entries(snapshot.placements).map(([id, placement]) => [
        id,
        clonePlacement(placement)
      ])
    ),
    states: Object.fromEntries(
      Object.entries(snapshot.states).map(([id, state]) => [
        id,
        cloneJsonValue(state, `Widget state ${id}`)
      ])
    ),
    createdAt: snapshot.createdAt
  };
}

function abortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
