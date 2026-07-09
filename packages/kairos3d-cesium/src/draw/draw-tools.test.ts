import { describe, expect, it } from "vitest";
import type { KairosMap } from "../core";
import { registerDefaultToolFactories } from "../tools/defaults";
import { toolRegistry } from "../tools/registry";

describe("default draw tools", () => {
  it("registers extended draw tools", () => {
    registerDefaultToolFactories();

    const circle = toolRegistry.create("draw.circle", {} as KairosMap);
    const rectangle = toolRegistry.create("draw.rectangle", {} as KairosMap);
    const ellipse = toolRegistry.create("draw.ellipse", {} as KairosMap);
    const wall = toolRegistry.create("draw.wall", {} as KairosMap);
    const corridor = toolRegistry.create("draw.corridor", {} as KairosMap);
    const box = toolRegistry.create("draw.box", {} as KairosMap);
    const cylinder = toolRegistry.create("draw.cylinder", {} as KairosMap);

    expect(circle.id).toBe("draw.circle");
    expect(rectangle.id).toBe("draw.rectangle");
    expect(ellipse.id).toBe("draw.ellipse");
    expect(wall.id).toBe("draw.wall");
    expect(corridor.id).toBe("draw.corridor");
    expect(box.id).toBe("draw.box");
    expect(cylinder.id).toBe("draw.cylinder");
  });
});
