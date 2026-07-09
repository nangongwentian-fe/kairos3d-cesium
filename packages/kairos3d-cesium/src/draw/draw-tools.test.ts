import { describe, expect, it } from "vitest";
import type { KairosMap } from "../core";
import { registerDefaultToolFactories } from "../tools/defaults";
import { toolRegistry } from "../tools/registry";

describe("default draw tools", () => {
  it("registers circle and rectangle draw tools", () => {
    registerDefaultToolFactories();

    const circle = toolRegistry.create("draw.circle", {} as KairosMap);
    const rectangle = toolRegistry.create("draw.rectangle", {} as KairosMap);

    expect(circle.id).toBe("draw.circle");
    expect(rectangle.id).toBe("draw.rectangle");
  });
});
