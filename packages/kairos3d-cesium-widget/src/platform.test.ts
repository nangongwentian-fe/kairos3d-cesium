import type { KairosMap } from "@kairos3d/cesium/core";
import type { SceneSnapshot } from "@kairos3d/cesium/scene";
import { describe, expect, it, vi } from "vitest";
import { createWidgetPlatform, WidgetPlatform } from "./platform";
import { createMemoryWidgetSnapshotStorage } from "./snapshot/storage";
import type {
  JsonValue,
  WidgetContext,
  WidgetController,
  WidgetDefinition,
  WidgetWorkspaceSnapshot
} from "./types";

describe("WidgetPlatform", () => {
  it("registers widgets and protects placement state from external mutation", () => {
    const platform = createPlatform();
    const placement = { region: "left" as const, order: 2, width: 280 };

    const state = platform.register(definition("layers", controller(), placement));
    placement.width = 500;

    expect(state).toMatchObject({
      id: "layers",
      name: "layers",
      status: "inactive",
      active: false,
      placement: { region: "left", order: 2, width: 280 }
    });
    expect(platform.get("layers")?.placement?.width).toBe(280);
    expect(() => platform.register(definition("layers", controller()))).toThrow(
      "already registered"
    );
  });

  it("serializes repeated activation and renews the activation signal", async () => {
    const platform = createPlatform();
    const instance = controller();
    let context: WidgetContext | undefined;
    const create = vi.fn((nextContext: WidgetContext) => {
      context = nextContext;
      return instance;
    });
    platform.register({ id: "layers", name: "Layers", create });

    await Promise.all([platform.activate("layers"), platform.activate("layers")]);
    const firstSignal = context?.signal;

    expect(create).toHaveBeenCalledTimes(1);
    expect(instance.activate).toHaveBeenCalledTimes(1);
    expect(firstSignal?.aborted).toBe(false);

    await platform.deactivate("layers");
    expect(firstSignal?.aborted).toBe(true);
    await platform.activate("layers");

    expect(context?.signal).not.toBe(firstSignal);
    expect(context?.signal.aborted).toBe(false);
    expect(instance.activate).toHaveBeenCalledTimes(2);
  });

  it("runs queued transitions in order", async () => {
    const platform = createPlatform();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    platform.register(
      definition(
        "first",
        controller({
          activate: async () => {
            order.push("first:start");
            await gate;
            order.push("first:end");
          }
        })
      )
    );
    platform.register(
      definition(
        "second",
        controller({
          activate: () => {
            order.push("second");
          }
        })
      )
    );

    const first = platform.activate("first");
    const second = platform.activate("second");
    await vi.waitFor(() => expect(order).toEqual(["first:start"]));
    release();
    await Promise.all([first, second]);

    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("enforces exclusive groups after a new widget activates", async () => {
    const platform = createPlatform();
    const layers = controller();
    const draw = controller();
    platform.register(definition("layers", layers, undefined, "side-panel"));
    platform.register(definition("draw", draw, undefined, "side-panel"));

    await platform.activate("layers");
    await platform.activate("draw");

    expect(platform.get("layers")?.active).toBe(false);
    expect(platform.get("draw")?.active).toBe(true);
    expect(layers.deactivate).toHaveBeenCalledTimes(1);
  });

  it("keeps existing exclusive widgets active when candidate activation fails", async () => {
    const platform = createPlatform();
    const layers = controller();
    const failure = new Error("activation failed");
    const draw = controller({
      activate: () => {
        throw failure;
      }
    });
    const errors = vi.fn();
    platform.on("error", errors);
    platform.register(definition("layers", layers, undefined, "side-panel"));
    platform.register(definition("draw", draw, undefined, "side-panel"));

    await platform.activate("layers");
    await expect(platform.activate("draw")).rejects.toBe(failure);

    expect(platform.get("layers")?.active).toBe(true);
    expect(platform.get("draw")).toMatchObject({ status: "error", active: false });
    expect(draw.deactivate).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0]?.[0].data.operation).toBe("activate");
  });

  it("unregisters and destroys active widget resources", async () => {
    const platform = createPlatform();
    const instance = controller();
    platform.register(definition("layers", instance));
    await platform.activate("layers");

    await expect(platform.unregister("layers")).resolves.toBe(true);

    expect(instance.deactivate).toHaveBeenCalledTimes(1);
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    expect(platform.get("layers")).toBeUndefined();
    await expect(platform.unregister("missing")).resolves.toBe(false);
  });

  it("destroys every widget even when one controller fails", async () => {
    const platform = createPlatform();
    const failed = controller({
      destroy: () => {
        throw new Error("destroy failed");
      }
    });
    const healthy = controller();
    platform.register(definition("failed", failed));
    platform.register(definition("healthy", healthy));
    await platform.activate("failed");
    await platform.activate("healthy");

    await expect(platform.destroy()).rejects.toThrow("failed to destroy");

    expect(healthy.destroy).toHaveBeenCalledTimes(1);
    expect(platform.list()).toEqual([]);
    expect(() => platform.register(definition("next", controller()))).toThrow("destroyed");
    await expect(platform.destroy()).resolves.toBeUndefined();
  });

  it("roundtrips active state, placement and controller state", async () => {
    const platform = createPlatform();
    const instances: StatefulController[] = [];
    platform.register({
      id: "layers",
      name: "Layers",
      defaultPlacement: { region: "left", width: 260 },
      create: () => {
        const instance = statefulController({ filter: "all" });
        instances.push(instance);
        return instance;
      }
    });
    await platform.activate("layers");
    instances[0]!.value = { filter: "visible" };
    platform.setPlacement("layers", { region: "right", width: 320 });
    const snapshot = platform.toJSON();

    await platform.deactivate("layers");
    platform.setPlacement("layers", { region: "bottom", height: 180 });
    await platform.load(snapshot);

    expect(instances).toHaveLength(2);
    expect(instances[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(instances[1]?.value).toEqual({ filter: "visible" });
    expect(platform.get("layers")).toMatchObject({
      active: true,
      status: "active",
      placement: { region: "right", width: 320 }
    });
  });

  it("validates snapshots before changing active widgets", async () => {
    const platform = createPlatform();
    const instance = controller();
    platform.register(definition("layers", instance));
    await platform.activate("layers");
    const invalid = workspace({ activeWidgetIds: ["missing"] });

    await expect(platform.load(invalid)).rejects.toThrow("not registered");

    expect(platform.get("layers")?.active).toBe(true);
    expect(instance.deactivate).not.toHaveBeenCalled();
    expect(instance.destroy).not.toHaveBeenCalled();
  });

  it("can ignore unknown widget ids in non-strict restore mode", async () => {
    const platform = createPlatform();
    const instance = controller();
    platform.register(definition("layers", instance));
    const snapshot = workspace({
      activeWidgetIds: ["layers", "missing"],
      placements: { missing: { region: "left" } },
      states: { missing: { value: true } }
    });

    await platform.load(snapshot, { strict: false });

    expect(platform.get("layers")?.active).toBe(true);
  });

  it("combines scene and widget state in platform snapshots", async () => {
    const { map, sceneLoad, sceneToJSON } = createMapStub();
    const platform = createWidgetPlatform({ map });
    platform.register(definition("layers", controller()));
    await platform.activate("layers");

    const snapshot = platform.toPlatformJSON({ scene: { includeResults: true } });
    await platform.loadPlatform(snapshot, {
      scene: { restoreResults: true },
      workspace: { strict: true }
    });

    expect(sceneToJSON).toHaveBeenCalledWith({ includeResults: true });
    expect(sceneLoad).toHaveBeenCalledWith(snapshot.scene, { restoreResults: true });
    expect(platform.get("layers")?.active).toBe(true);
  });

  it("saves and restores platform snapshots through configured storage", async () => {
    const storage = createMemoryWidgetSnapshotStorage();
    const { map } = createMapStub();
    const platform = createWidgetPlatform({ map, snapshotStorage: storage });
    platform.register(definition("layers", controller()));
    await platform.activate("layers");

    await platform.saveSnapshot("workspace-1", { name: "Workspace 1" });
    await platform.deactivate("layers");

    expect(await platform.loadSnapshot("workspace-1")).toBe(true);
    expect(platform.get("layers")?.active).toBe(true);
    expect(await platform.listSnapshots()).toMatchObject([
      { id: "workspace-1", name: "Workspace 1" }
    ]);
    expect(await platform.removeSnapshot("workspace-1")).toBe(true);
    expect(await platform.loadSnapshot("workspace-1")).toBe(false);
  });

  it("reports missing snapshot storage clearly", async () => {
    const platform = createPlatform();

    await expect(platform.saveSnapshot("missing")).rejects.toThrow("not configured");
    await expect(platform.loadSnapshot("missing")).rejects.toThrow("not configured");
  });
});

interface StatefulController extends WidgetController {
  value: JsonValue;
}

function statefulController(initial: JsonValue): StatefulController {
  return {
    value: initial,
    activate: vi.fn(),
    deactivate: vi.fn(),
    destroy: vi.fn(),
    toJSON() {
      return this.value;
    },
    load(state) {
      this.value = state;
    }
  };
}

function controller(overrides: Partial<WidgetController> = {}) {
  return {
    activate: vi.fn(overrides.activate ?? (() => undefined)),
    deactivate: vi.fn(overrides.deactivate ?? (() => undefined)),
    destroy: vi.fn(overrides.destroy ?? (() => undefined)),
    toJSON: overrides.toJSON,
    load: overrides.load
  } satisfies WidgetController;
}

function definition(
  id: string,
  instance: WidgetController,
  defaultPlacement?: WidgetDefinition["defaultPlacement"],
  exclusiveGroup?: string
): WidgetDefinition {
  return {
    id,
    name: id,
    defaultPlacement,
    exclusiveGroup,
    create: () => instance
  };
}

function createPlatform(): WidgetPlatform {
  return createWidgetPlatform({ map: createMapStub().map });
}

function createMapStub() {
  const sceneSnapshot: SceneSnapshot = {
    version: 1,
    layers: [],
    bookmarks: [],
    createdAt: "2026-07-10T00:00:00.000Z"
  };
  const sceneToJSON = vi.fn(() => structuredClone(sceneSnapshot));
  const sceneLoad = vi.fn(async () => undefined);
  const map = {
    sceneState: {
      toJSON: sceneToJSON,
      load: sceneLoad
    }
  } as unknown as KairosMap;
  return { map, sceneLoad, sceneToJSON };
}

function workspace(
  overrides: Partial<WidgetWorkspaceSnapshot> = {}
): WidgetWorkspaceSnapshot {
  return {
    version: 1,
    activeWidgetIds: [],
    placements: {},
    states: {},
    createdAt: "2026-07-10T00:00:00.000Z",
    ...overrides
  };
}
