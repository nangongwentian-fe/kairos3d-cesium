import { describe, expect, it } from "vitest";
import { parseSceneSnapshot, SCENE_SNAPSHOT_VERSION } from "./index";

const createdAt = "2026-07-10T00:00:00.000Z";

function createSnapshot() {
  return {
    version: 1,
    camera: {
      longitude: 114.2,
      latitude: 22.3,
      height: 1500,
      heading: 0.1,
      pitch: -0.8,
      roll: 0
    },
    layers: [
      {
        id: "osm",
        type: "xyz",
        url: "https://example.com/{z}/{x}/{y}.png",
        metadata: { enabled: true }
      }
    ],
    bookmarks: [
      {
        id: "home",
        name: "Home",
        view: {
          longitude: 114.2,
          latitude: 22.3,
          height: 1500,
          heading: 0.1,
          pitch: -0.8,
          roll: 0
        },
        createdAt
      }
    ],
    results: {
      draw: [],
      measure: [],
      visibility: [],
      profile: [],
      clipping: [],
      terrain: []
    },
    primitives: [],
    overlays: [],
    effects: [],
    createdAt
  };
}

describe("parseSceneSnapshot", () => {
  it("keeps the current snapshot version at v1", () => {
    expect(SCENE_SNAPSHOT_VERSION).toBe(1);
  });

  it("validates and deeply clones a v1 snapshot", () => {
    const source = createSnapshot();
    const parsed = parseSceneSnapshot(source);

    source.camera.height = 1;
    source.layers[0]!.metadata.enabled = false;
    source.bookmarks[0]!.view.height = 2;

    expect(parsed.camera?.height).toBe(1500);
    expect(parsed.layers[0]?.metadata).toEqual({ enabled: true });
    expect(parsed.bookmarks[0]?.view.height).toBe(1500);
    expect(parsed).not.toBe(source);
  });

  it("preserves omitted optional sections", () => {
    const parsed = parseSceneSnapshot({
      version: 1,
      layers: [],
      bookmarks: [],
      createdAt
    });

    expect("camera" in parsed).toBe(false);
    expect("results" in parsed).toBe(false);
    expect("primitives" in parsed).toBe(false);
    expect("overlays" in parsed).toBe(false);
    expect("effects" in parsed).toBe(false);
  });

  it("omits explicit undefined optional properties using JSON semantics", () => {
    const parsed = parseSceneSnapshot({
      version: 1,
      layers: [{ id: "osm", type: "xyz", url: "https://example.com", name: undefined }],
      bookmarks: [],
      effects: [{ id: "effect", optional: undefined }],
      createdAt
    });

    expect(parsed.layers[0]).not.toHaveProperty("name");
    expect(parsed.effects?.[0]).not.toHaveProperty("optional");
  });

  it("rejects invalid versions and dates", () => {
    expect(() => parseSceneSnapshot({ ...createSnapshot(), version: 2 })).toThrow(
      /version must be 1/i
    );
    expect(() => parseSceneSnapshot({ ...createSnapshot(), createdAt: "invalid" })).toThrow(
      /createdAt/i
    );
    expect(() =>
      parseSceneSnapshot({
        ...createSnapshot(),
        bookmarks: [{ ...createSnapshot().bookmarks[0], createdAt: "invalid" }]
      })
    ).toThrow(/bookmark.*createdAt/i);
  });

  it("rejects incomplete or non-finite camera views", () => {
    expect(() =>
      parseSceneSnapshot({
        ...createSnapshot(),
        camera: { ...createSnapshot().camera, height: Number.NaN }
      })
    ).toThrow(/camera height/i);
    expect(() =>
      parseSceneSnapshot({
        ...createSnapshot(),
        camera: { longitude: 114.2 }
      })
    ).toThrow(/camera latitude/i);
  });

  it("requires snapshot arrays and complete result array groups", () => {
    expect(() => parseSceneSnapshot({ ...createSnapshot(), layers: {} })).toThrow(
      /layers must be an array/i
    );
    expect(() => parseSceneSnapshot({ ...createSnapshot(), bookmarks: {} })).toThrow(
      /bookmarks must be an array/i
    );
    expect(() => parseSceneSnapshot({ ...createSnapshot(), primitives: {} })).toThrow(
      /primitives must be an array/i
    );
    expect(() =>
      parseSceneSnapshot({
        ...createSnapshot(),
        results: { ...createSnapshot().results, terrain: undefined }
      })
    ).toThrow(/results terrain must be an array/i);
  });

  it("requires non-empty unique layer and bookmark ids", () => {
    expect(() =>
      parseSceneSnapshot({
        ...createSnapshot(),
        layers: [
          createSnapshot().layers[0],
          { ...createSnapshot().layers[0], url: "https://example.com/other" }
        ]
      })
    ).toThrow(/layer id.*unique/i);
    expect(() =>
      parseSceneSnapshot({
        ...createSnapshot(),
        bookmarks: [
          createSnapshot().bookmarks[0],
          { ...createSnapshot().bookmarks[0], name: "Duplicate" }
        ]
      })
    ).toThrow(/bookmark id.*unique/i);
    expect(() =>
      parseSceneSnapshot({
        ...createSnapshot(),
        layers: [{ ...createSnapshot().layers[0], id: " " }]
      })
    ).toThrow(/layer id.*non-empty/i);
  });

  it("rejects non-JSON-safe business section data", () => {
    expect(() =>
      parseSceneSnapshot({
        ...createSnapshot(),
        effects: [{ value: Number.POSITIVE_INFINITY }]
      })
    ).toThrow(/JSON-safe/i);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      parseSceneSnapshot({
        ...createSnapshot(),
        overlays: [circular]
      })
    ).toThrow(/JSON-safe/i);
  });
});
