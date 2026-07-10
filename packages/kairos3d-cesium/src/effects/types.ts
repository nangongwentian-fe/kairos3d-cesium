import type { Cartesian3 } from "cesium";
import type { SerializablePosition } from "../core/serialization";
import type { MaterialColor, PrimitiveMaterialDescriptor } from "../materials";
import type { AsyncOperationOptions } from "../operations";
import type { ColorLike } from "../style";

export type EffectType =
  | "flow-line"
  | "flow-wall"
  | "pulse-circle"
  | "radar-scan"
  | "water-surface"
  | "particle"
  | "rain"
  | "snow"
  | "fog";

type WithoutTarget<T> = T extends unknown ? Omit<T, "target"> : never;

export type EffectMaterialDescriptor = WithoutTarget<PrimitiveMaterialDescriptor>;

export interface BaseEffectConfig {
  id: string;
  type: EffectType;
  show?: boolean;
  group?: string;
  metadata?: Record<string, unknown>;
}

export interface FlowLineEffectConfig extends BaseEffectConfig {
  type: "flow-line";
  positions: Cartesian3[];
  width?: number;
  material: EffectMaterialDescriptor;
}

export interface FlowWallEffectConfig extends BaseEffectConfig {
  type: "flow-wall";
  positions: Cartesian3[];
  minimumHeights?: number[];
  maximumHeights?: number[];
  material: EffectMaterialDescriptor;
}

export interface PulseCircleEffectConfig extends BaseEffectConfig {
  type: "pulse-circle";
  position: Cartesian3;
  radius: number;
  height?: number;
  material?: EffectMaterialDescriptor;
}

export interface RadarScanEffectConfig extends BaseEffectConfig {
  type: "radar-scan";
  position: Cartesian3;
  radius: number;
  height?: number;
  material?: EffectMaterialDescriptor;
}

export interface WaterSurfaceEffectConfig extends BaseEffectConfig {
  type: "water-surface";
  positions: Cartesian3[];
  material: EffectMaterialDescriptor;
}

export interface ParticleEffectConfig extends BaseEffectConfig {
  type: "particle";
  position: Cartesian3;
  image: string;
  emissionRate?: number;
  speed?: number;
  particleLife?: number;
  lifetime?: number;
  startScale?: number;
  endScale?: number;
  imageSize?: [number, number];
  startColor?: ColorLike;
  endColor?: ColorLike;
  sizeInMeters?: boolean;
}

export interface WeatherEffectConfig extends BaseEffectConfig {
  type: "rain" | "snow" | "fog";
  intensity?: number;
  speed?: number;
  color?: ColorLike;
}

export type EffectConfig =
  | FlowLineEffectConfig
  | FlowWallEffectConfig
  | PulseCircleEffectConfig
  | RadarScanEffectConfig
  | WaterSurfaceEffectConfig
  | ParticleEffectConfig
  | WeatherEffectConfig;

type EffectPatch<T> = T extends EffectConfig
  ? Partial<Omit<T, "id" | "type">>
  : never;

export type EffectUpdateOptions = EffectPatch<EffectConfig>;

export interface EffectInstance {
  id: string;
  type: EffectType;
  show: boolean;
  group?: string;
  metadata?: Record<string, unknown>;
  config: EffectConfig;
  runtimeObjects: unknown[];
  createdAt: Date;
  updatedAt?: Date;
}

export interface SerializableEffectConfig {
  positions?: SerializablePosition[];
  position?: SerializablePosition;
  width?: number;
  radius?: number;
  height?: number;
  minimumHeights?: number[];
  maximumHeights?: number[];
  material?: EffectMaterialDescriptor;
  image?: string;
  emissionRate?: number;
  speed?: number;
  particleLife?: number;
  lifetime?: number;
  startScale?: number;
  endScale?: number;
  imageSize?: [number, number];
  startColor?: MaterialColor;
  endColor?: MaterialColor;
  sizeInMeters?: boolean;
  intensity?: number;
  color?: MaterialColor;
}

export interface EffectSnapshot {
  id: string;
  type: EffectType;
  show: boolean;
  group?: string;
  metadata?: Record<string, unknown>;
  config: SerializableEffectConfig;
  createdAt: string;
  updatedAt?: string;
}

export interface EffectLoadOptions extends AsyncOperationOptions {
  clear?: boolean;
}

export interface EffectManagerEvents {
  add: EffectInstance;
  update: EffectInstance;
  remove: EffectInstance;
  clear: EffectInstance[];
  load: EffectInstance[];
}
