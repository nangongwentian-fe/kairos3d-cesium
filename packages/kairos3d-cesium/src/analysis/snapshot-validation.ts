import type {
  SerializablePosition,
  SerializableVector3
} from "../core";

export function assertSnapshotRecord(
  value: unknown,
  label: string
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

export function assertSnapshotArray(
  value: unknown,
  label: string
): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

export function assertNonEmptySnapshotId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

export function assertSnapshotString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
}

export function assertOptionalSnapshotString(
  value: unknown,
  label: string
): asserts value is string | undefined {
  if (value !== undefined) {
    assertSnapshotString(value, label);
  }
}

export function assertSnapshotBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
}

export function assertOptionalSnapshotBoolean(
  value: unknown,
  label: string
): asserts value is boolean | undefined {
  if (value !== undefined) {
    assertSnapshotBoolean(value, label);
  }
}

export function assertFiniteSnapshotNumber(
  value: unknown,
  label: string
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

export function assertNonNegativeSnapshotNumber(
  value: unknown,
  label: string
): asserts value is number {
  assertFiniteSnapshotNumber(value, label);
  if (value < 0) {
    throw new Error(`${label} must be greater than or equal to 0.`);
  }
}

export function assertPositiveSnapshotNumber(
  value: unknown,
  label: string
): asserts value is number {
  assertFiniteSnapshotNumber(value, label);
  if (value <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
}

export function assertOptionalFiniteSnapshotNumber(
  value: unknown,
  label: string
): asserts value is number | undefined {
  if (value !== undefined) {
    assertFiniteSnapshotNumber(value, label);
  }
}

export function assertSnapshotInteger(
  value: unknown,
  label: string,
  minimum = 0
): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}.`);
  }
}

export function assertSnapshotEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
}

export function assertOptionalSnapshotEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): asserts value is T | undefined {
  if (value !== undefined) {
    assertSnapshotEnum(value, allowed, label);
  }
}

export function assertSnapshotDate(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a valid date string.`);
  }
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    throw new Error(`${label} must be a valid date string.`);
  }
}

export function assertSerializablePosition(
  value: unknown,
  label: string
): asserts value is SerializablePosition {
  assertSnapshotRecord(value, label);
  assertFiniteSnapshotNumber(value.longitude, `${label} longitude`);
  assertFiniteSnapshotNumber(value.latitude, `${label} latitude`);
  assertFiniteSnapshotNumber(value.height, `${label} height`);
  if (value.longitude < -180 || value.longitude > 180) {
    throw new Error(`${label} longitude must be between -180 and 180 degrees.`);
  }
  if (value.latitude < -90 || value.latitude > 90) {
    throw new Error(`${label} latitude must be between -90 and 90 degrees.`);
  }
}

export function assertSerializablePositions(
  value: unknown,
  label: string,
  minimum: number,
  maximum?: number
): asserts value is SerializablePosition[] {
  assertSnapshotArray(value, label);
  if (value.length < minimum || (maximum !== undefined && value.length > maximum)) {
    const expected = maximum === minimum
      ? `exactly ${minimum}`
      : maximum === undefined
        ? `at least ${minimum}`
        : `between ${minimum} and ${maximum}`;
    throw new Error(`${label} must contain ${expected} positions.`);
  }
  value.forEach((position, index) =>
    assertSerializablePosition(position, `${label}[${index}]`)
  );
}

export function assertSerializableVector3(
  value: unknown,
  label: string
): asserts value is SerializableVector3 {
  assertSnapshotRecord(value, label);
  assertFiniteSnapshotNumber(value.x, `${label} x`);
  assertFiniteSnapshotNumber(value.y, `${label} y`);
  assertFiniteSnapshotNumber(value.z, `${label} z`);
}

export function freezePreparedArray<T extends object>(items: T[]): readonly T[] {
  for (const item of items) {
    Object.freeze(item);
  }
  return Object.freeze(items);
}

export function cloneAndFreezeSnapshot<T>(value: T): T {
  return cloneAndFreezeValue(value) as T;
}

function cloneAndFreezeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneAndFreezeValue));
  }
  if (value && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      clone[key] = cloneAndFreezeValue(item);
    }
    return Object.freeze(clone);
  }
  return value;
}
