import type { Material, MaterialProperty } from "cesium";

export type MaterialTarget = "entity" | "primitive";
export interface MaterialColorComponents {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export type MaterialColor = string | MaterialColorComponents;
export type MaterialRepeat = [number, number];
export type MaterialJSONValue =
  | string
  | number
  | boolean
  | null
  | MaterialJSONValue[]
  | { [key: string]: MaterialJSONValue };

export interface MaterialDescriptorBase {
  type: string;
  target: MaterialTarget;
}

export interface ColorMaterialDescriptor extends MaterialDescriptorBase {
  type: "color";
  color?: MaterialColor;
}

export interface ImageMaterialDescriptor extends MaterialDescriptorBase {
  type: "image";
  image: string;
  repeat?: MaterialRepeat;
  color?: MaterialColor;
  transparent?: boolean;
}

export interface GridMaterialDescriptor extends MaterialDescriptorBase {
  target: "entity";
  type: "grid";
  color?: MaterialColor;
  cellAlpha?: number;
  lineCount?: MaterialRepeat;
  lineThickness?: MaterialRepeat;
  lineOffset?: MaterialRepeat;
}

export interface StripeMaterialDescriptor extends MaterialDescriptorBase {
  target: "entity";
  type: "stripe";
  orientation?: "horizontal" | "vertical";
  evenColor?: MaterialColor;
  oddColor?: MaterialColor;
  offset?: number;
  repeat?: number;
}

export interface CheckerboardMaterialDescriptor extends MaterialDescriptorBase {
  target: "entity";
  type: "checkerboard";
  evenColor?: MaterialColor;
  oddColor?: MaterialColor;
  repeat?: MaterialRepeat;
}

export interface PolylineDashMaterialDescriptor extends MaterialDescriptorBase {
  target: "entity";
  type: "polyline-dash";
  color?: MaterialColor;
  gapColor?: MaterialColor;
  dashLength?: number;
  dashPattern?: number;
}

export interface PolylineGlowMaterialDescriptor extends MaterialDescriptorBase {
  target: "entity";
  type: "polyline-glow";
  color?: MaterialColor;
  glowPower?: number;
  taperPower?: number;
}

export interface WaterMaterialDescriptor extends MaterialDescriptorBase {
  target: "primitive";
  type: "water";
  normalMap: string;
  baseWaterColor?: MaterialColor;
  blendColor?: MaterialColor;
  frequency?: number;
  animationSpeed?: number;
  amplitude?: number;
  specularIntensity?: number;
}

export interface FlowMaterialDescriptor extends MaterialDescriptorBase {
  target: "primitive";
  type: "flow";
  color?: MaterialColor;
  speed?: number;
  repeat?: number;
  phase?: number;
}

export interface RadialWaveMaterialDescriptor extends MaterialDescriptorBase {
  target: "primitive";
  type: "radial-wave";
  color?: MaterialColor;
  speed?: number;
  rings?: number;
  phase?: number;
}

export interface RadarScanMaterialDescriptor extends MaterialDescriptorBase {
  target: "primitive";
  type: "radar-scan";
  color?: MaterialColor;
  speed?: number;
  sectorSize?: number;
  phase?: number;
}

export interface CustomMaterialDescriptor extends MaterialDescriptorBase {
  options?: Record<string, MaterialJSONValue>;
}

export type BuiltInEntityMaterialDescriptor =
  | (ColorMaterialDescriptor & { target: "entity" })
  | (ImageMaterialDescriptor & { target: "entity" })
  | GridMaterialDescriptor
  | StripeMaterialDescriptor
  | CheckerboardMaterialDescriptor
  | PolylineDashMaterialDescriptor
  | PolylineGlowMaterialDescriptor;

export type BuiltInPrimitiveMaterialDescriptor =
  | (ColorMaterialDescriptor & { target: "primitive" })
  | (ImageMaterialDescriptor & { target: "primitive" })
  | WaterMaterialDescriptor
  | FlowMaterialDescriptor
  | RadialWaveMaterialDescriptor
  | RadarScanMaterialDescriptor;

export type EntityMaterialDescriptor =
  | BuiltInEntityMaterialDescriptor
  | (CustomMaterialDescriptor & { target: "entity" });

export type PrimitiveMaterialDescriptor =
  | BuiltInPrimitiveMaterialDescriptor
  | (CustomMaterialDescriptor & { target: "primitive" });

export type MaterialDescriptor = EntityMaterialDescriptor | PrimitiveMaterialDescriptor;

export interface MaterialDefinition<
  TDescriptor extends MaterialDescriptorBase = MaterialDescriptorBase
> {
  type: string;
  targets: readonly MaterialTarget[];
  createProperty?: (descriptor: TDescriptor) => MaterialProperty;
  createMaterial?: (descriptor: TDescriptor) => Material | Promise<Material>;
  validate?: (descriptor: TDescriptor) => void;
}

export interface MaterialDefinitionInfo {
  type: string;
  targets: readonly MaterialTarget[];
  builtIn: boolean;
}
