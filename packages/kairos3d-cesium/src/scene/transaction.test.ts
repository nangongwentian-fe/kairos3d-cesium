import { describe, expect, it, vi } from "vitest";
import {
  prepareSceneStagePlans,
  type PreparedSceneStage,
  type SceneStagePlan
} from "./transaction";

function createStage(phase: string): PreparedSceneStage {
  return {
    phase,
    commit: vi.fn(),
    rollback: vi.fn(),
    finalize: vi.fn(),
    dispose: vi.fn(),
    publish: vi.fn()
  };
}

describe("scene transaction preflight contract", () => {
  it("runs every preflight before preparing detached runtime", async () => {
    const calls: string[] = [];
    const layers = createStage("layers");
    const effects = createStage("effects");
    const bookmarks = createStage("bookmarks");
    const plans: SceneStagePlan[] = [
      {
        phase: "layers",
        preflight: () => {
          calls.push("preflight.layers");
          return { phase: "layers", value: { count: 2 } };
        },
        prepare: (preflight) => {
          calls.push("prepare.layers");
          expect(preflight?.value).toEqual({ count: 2 });
          return layers;
        }
      },
      {
        phase: "effects",
        preflight: async () => {
          calls.push("preflight.effects");
          return { phase: "effects" };
        },
        prepare: () => {
          calls.push("prepare.effects");
          return effects;
        }
      },
      {
        phase: "bookmarks",
        prepare: (preflight) => {
          calls.push("prepare.bookmarks");
          expect(preflight).toBeUndefined();
          return bookmarks;
        }
      }
    ];

    await expect(prepareSceneStagePlans(plans)).resolves.toEqual([
      layers,
      effects,
      bookmarks
    ]);
    expect(calls).toEqual([
      "preflight.layers",
      "preflight.effects",
      "prepare.layers",
      "prepare.effects",
      "prepare.bookmarks"
    ]);
  });

  it("does not prepare runtime when any preflight fails", async () => {
    const prepareLayers = vi.fn(() => createStage("layers"));
    const prepareEffects = vi.fn(() => createStage("effects"));
    const plans: SceneStagePlan[] = [
      {
        phase: "layers",
        preflight: () => ({ phase: "layers" }),
        prepare: prepareLayers
      },
      {
        phase: "effects",
        preflight: () => {
          throw new Error("invalid effect snapshot");
        },
        prepare: prepareEffects
      }
    ];

    await expect(prepareSceneStagePlans(plans)).rejects.toThrow(
      "invalid effect snapshot"
    );
    expect(prepareLayers).not.toHaveBeenCalled();
    expect(prepareEffects).not.toHaveBeenCalled();
  });

  it("disposes already prepared stages when later preparation fails", async () => {
    const layers = createStage("layers");
    const plans: SceneStagePlan[] = [
      { phase: "layers", prepare: () => layers },
      {
        phase: "effects",
        prepare: () => {
          throw new Error("effect runtime failed");
        }
      }
    ];

    await expect(prepareSceneStagePlans(plans)).rejects.toThrow(
      "effect runtime failed"
    );
    expect(layers.dispose).toHaveBeenCalledOnce();
  });
});
