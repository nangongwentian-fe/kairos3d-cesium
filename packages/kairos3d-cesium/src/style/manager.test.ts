import { describe, expect, it } from "vitest";
import { StyleManager } from "./manager";

describe("StyleManager", () => {
  it("manages style presets without exposing internal mutable state", () => {
    const manager = new StyleManager();
    manager.registerPreset("warning", {
      line: { color: "#ff3b30", width: 4 }
    });

    expect(manager.hasPreset("warning")).toBe(true);
    expect(manager.hasPreset("missing")).toBe(false);
    expect(manager.getPreset("warning")?.line?.width).toBe(4);

    const presets = manager.listPresets();
    presets[0].style.line!.width = 10;

    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({
      id: "warning",
      style: { line: { width: 10 } }
    });
    expect(manager.getPreset("warning")?.line?.width).toBe(4);
    expect(manager.removePreset("warning")).toBe(true);
    expect(manager.removePreset("warning")).toBe(false);
    expect(manager.listPresets()).toEqual([]);
  });
});
