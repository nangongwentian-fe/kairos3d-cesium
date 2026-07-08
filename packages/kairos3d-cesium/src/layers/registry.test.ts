import { describe, expect, it, vi } from "vitest";
import { LayerRegistry } from "./registry";
import type { LayerAdapter } from "./types";

describe("LayerRegistry", () => {
  it("creates layers from registered factories", async () => {
    const registry = new LayerRegistry();
    const adapter: LayerAdapter = {
      id: "sample",
      type: "sample",
      show: true,
      addTo: vi.fn(),
      remove: vi.fn(),
      destroy: vi.fn()
    };

    registry.register("sample", () => adapter);

    await expect(Promise.resolve(registry.create({ id: "sample", type: "sample" }))).resolves.toBe(
      adapter
    );
  });

  it("throws for unregistered layer types", () => {
    const registry = new LayerRegistry();

    expect(() => registry.create({ id: "missing", type: "missing" })).toThrow(
      'Layer type "missing" is not registered.'
    );
  });
});
