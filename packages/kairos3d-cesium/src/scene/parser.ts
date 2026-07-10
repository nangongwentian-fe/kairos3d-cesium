import {
  SCENE_SNAPSHOT_VERSION,
  type CameraView,
  type SceneSnapshot
} from "./types";

const cameraFields = [
  "longitude",
  "latitude",
  "height",
  "heading",
  "pitch",
  "roll"
] as const satisfies readonly (keyof CameraView)[];

const resultSections = [
  "draw",
  "measure",
  "visibility",
  "profile",
  "clipping",
  "terrain"
] as const;

export function parseSceneSnapshot(input: unknown): SceneSnapshot {
  assertRecord(input, "Scene snapshot");
  if (input.version !== SCENE_SNAPSHOT_VERSION) {
    throw new Error(`Scene snapshot version must be ${SCENE_SNAPSHOT_VERSION}.`);
  }

  assertIsoDate(input.createdAt, "Scene snapshot createdAt");
  if (input.camera !== undefined) {
    assertCameraView(input.camera, "Scene snapshot camera");
  }

  assertArray(input.layers, "Scene snapshot layers");
  assertUniqueIds(input.layers, "Layer");

  assertArray(input.bookmarks, "Scene snapshot bookmarks");
  assertBookmarks(input.bookmarks);

  if (input.results !== undefined) {
    assertRecord(input.results, "Scene snapshot results");
    for (const section of resultSections) {
      assertArray(input.results[section], `Scene snapshot results ${section}`);
    }
  }
  assertOptionalArray(input.primitives, "Scene snapshot primitives");
  assertOptionalArray(input.overlays, "Scene snapshot overlays");
  assertOptionalArray(input.effects, "Scene snapshot effects");

  return cloneJsonSnapshot(input);
}

function assertBookmarks(bookmarks: unknown[]): void {
  const ids = new Set<string>();
  for (const bookmark of bookmarks) {
    assertRecord(bookmark, "Scene snapshot bookmark");
    const id = assertNonEmptyId(bookmark.id, "Bookmark");
    if (ids.has(id)) {
      throw new Error(`Bookmark id "${id}" must be unique.`);
    }
    ids.add(id);

    if (bookmark.name !== undefined && typeof bookmark.name !== "string") {
      throw new Error(`Bookmark "${id}" name must be a string.`);
    }
    assertCameraView(bookmark.view, `Bookmark "${id}" view`);
    assertIsoDate(bookmark.createdAt, `Bookmark "${id}" createdAt`);
  }
}

function assertUniqueIds(values: unknown[], label: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    assertRecord(value, `Scene snapshot ${label.toLowerCase()}`);
    const id = assertNonEmptyId(value.id, label);
    if (ids.has(id)) {
      throw new Error(`${label} id "${id}" must be unique.`);
    }
    ids.add(id);
  }
}

function assertNonEmptyId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} id must be a non-empty string.`);
  }
  return value;
}

function assertCameraView(value: unknown, label: string): asserts value is CameraView {
  assertRecord(value, label);
  for (const field of cameraFields) {
    assertFinite(value[field], `${label} ${field}`);
  }
}

function assertOptionalArray(value: unknown, label: string): void {
  if (value !== undefined) {
    assertArray(value, label);
  }
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

function assertRecord(
  value: unknown,
  label: string
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertIsoDate(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO date string.`);
  }
}

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function cloneJsonSnapshot(snapshot: Record<string, unknown>): SceneSnapshot {
  try {
    const serialized = JSON.stringify(snapshot, (_key, value: unknown) => {
      if (
        typeof value === "function" ||
        typeof value === "symbol" ||
        typeof value === "bigint" ||
        (typeof value === "number" && !Number.isFinite(value))
      ) {
        throw new Error("Unsupported JSON value.");
      }
      return value;
    });
    return JSON.parse(serialized) as SceneSnapshot;
  } catch {
    throw new Error("Scene snapshot must contain JSON-safe data only.");
  }
}
