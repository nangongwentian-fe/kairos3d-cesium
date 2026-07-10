import { describe, expect, it } from "vitest";
import {
  assertKairosPlatformSnapshot,
  assertWidgetPlacement,
  assertWidgetWorkspaceSnapshot,
  cloneJsonValue
} from "./validation";

describe("widget snapshot validation", () => {
  it("accepts valid workspace and platform snapshots", () => {
    const workspace = {
      version: 1,
      activeWidgetIds: ["layers"],
      placements: {
        layers: { region: "floating", floating: { x: 10, y: 20, width: 300, height: 400 } }
      },
      states: { layers: { expanded: true } },
      createdAt: "2026-07-10T00:00:00.000Z"
    };

    expect(() => assertWidgetWorkspaceSnapshot(workspace)).not.toThrow();
    expect(() =>
      assertKairosPlatformSnapshot({
        version: 1,
        scene: { version: 1, layers: [], bookmarks: [], createdAt: workspace.createdAt },
        workspace,
        createdAt: workspace.createdAt
      })
    ).not.toThrow();
  });

  it("rejects invalid placement bounds and duplicate active ids", () => {
    expect(() => assertWidgetPlacement({ region: "floating" })).toThrow(
      "requires floating bounds"
    );
    expect(() =>
      assertWidgetWorkspaceSnapshot({
        version: 1,
        activeWidgetIds: ["layers", "layers"],
        placements: {},
        states: {},
        createdAt: "2026-07-10T00:00:00.000Z"
      })
    ).toThrow("must be unique");
  });

  it("rejects runtime objects, non-finite numbers and circular state", () => {
    expect(() => cloneJsonValue(new Date())).toThrow("plain objects");
    expect(() => cloneJsonValue({ value: Number.NaN })).toThrow("non-finite");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => cloneJsonValue(circular)).toThrow("circular");
  });

  it("deep clones JSON-safe widget state", () => {
    const source = { filters: [{ visible: true }] };
    const cloned = cloneJsonValue(source);

    source.filters[0]!.visible = false;
    expect(cloned).toEqual({ filters: [{ visible: true }] });
  });
});
