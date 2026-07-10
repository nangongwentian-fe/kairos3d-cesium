import { parseSceneSnapshot } from "@kairos3d/cesium/scene";
import type {
  JsonValue,
  KairosPlatformSnapshot,
  WidgetFloatingPlacement,
  WidgetPlacement,
  WidgetWorkspaceSnapshot
} from "../types";

const widgetRegions = new Set(["left", "right", "bottom", "floating"]);

export function assertWidgetWorkspaceSnapshot(
  value: unknown
): asserts value is WidgetWorkspaceSnapshot {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("Widget workspace snapshot version must be 1.");
  }
  assertIsoDate(value.createdAt, "Widget workspace createdAt");
  assertStringArray(value.activeWidgetIds, "Widget workspace activeWidgetIds");
  if (new Set(value.activeWidgetIds).size !== value.activeWidgetIds.length) {
    throw new Error("Widget workspace activeWidgetIds must be unique.");
  }
  assertRecord(value.placements, "Widget workspace placements");
  for (const [id, placement] of Object.entries(value.placements)) {
    assertWidgetId(id);
    assertWidgetPlacement(placement);
  }
  assertRecord(value.states, "Widget workspace states");
  for (const [id, state] of Object.entries(value.states)) {
    assertWidgetId(id);
    assertJsonValue(state, `Widget state ${id}`);
  }
}

export function assertKairosPlatformSnapshot(
  value: unknown
): asserts value is KairosPlatformSnapshot {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("Kairos platform snapshot version must be 1.");
  }
  assertIsoDate(value.createdAt, "Kairos platform snapshot createdAt");
  parseSceneSnapshot(value.scene);
  assertWidgetWorkspaceSnapshot(value.workspace);
}

export function assertWidgetPlacement(
  value: unknown
): asserts value is WidgetPlacement {
  if (!isRecord(value) || typeof value.region !== "string" || !widgetRegions.has(value.region)) {
    throw new Error("Widget placement region is invalid.");
  }
  assertOptionalFinite(value.order, "Widget placement order");
  assertOptionalPositive(value.width, "Widget placement width");
  assertOptionalPositive(value.height, "Widget placement height");
  if (value.collapsed !== undefined && typeof value.collapsed !== "boolean") {
    throw new Error("Widget placement collapsed must be a boolean.");
  }
  if (value.floating !== undefined) {
    assertFloatingPlacement(value.floating);
  }
  if (value.region === "floating" && value.floating === undefined) {
    throw new Error("Floating widget placement requires floating bounds.");
  }
}

export function clonePlacement(placement: WidgetPlacement): WidgetPlacement {
  assertWidgetPlacement(placement);
  return {
    ...placement,
    floating: placement.floating ? { ...placement.floating } : undefined
  };
}

export function cloneJsonValue(value: unknown, label = "Widget state"): JsonValue {
  assertJsonValue(value, label);
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item, label));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item, label)])
    );
  }
  return value;
}

function assertJsonValue(value: unknown, label: string, seen = new WeakSet<object>()): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains a non-finite number.`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${label} must contain only JSON-safe values.`);
  }
  if (seen.has(value)) {
    throw new Error(`${label} must not contain circular references.`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertJsonValue(item, label, seen);
    }
    seen.delete(value);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must contain only plain objects.`);
  }
  for (const item of Object.values(value)) {
    assertJsonValue(item, label, seen);
  }
  seen.delete(value);
}

function assertFloatingPlacement(value: unknown): asserts value is WidgetFloatingPlacement {
  if (!isRecord(value)) {
    throw new Error("Widget floating bounds must be an object.");
  }
  assertFinite(value.x, "Widget floating x");
  assertFinite(value.y, "Widget floating y");
  assertPositive(value.width, "Widget floating width");
  assertPositive(value.height, "Widget floating height");
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
}

function assertWidgetId(id: string): void {
  if (id.length === 0) {
    throw new Error("Widget id must not be empty.");
  }
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertIsoDate(value: unknown, label: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO date string.`);
  }
}

function assertOptionalFinite(value: unknown, label: string): void {
  if (value !== undefined) {
    assertFinite(value, label);
  }
}

function assertOptionalPositive(value: unknown, label: string): void {
  if (value !== undefined) {
    assertPositive(value, label);
  }
}

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function assertPositive(value: unknown, label: string): asserts value is number {
  assertFinite(value, label);
  if (value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
