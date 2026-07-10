import {
  Cartesian2,
  Cartesian3,
  CircleGeometry,
  GeometryInstance,
  Material,
  MaterialAppearance,
  ParticleSystem,
  PolygonGeometry,
  PolylineCollection,
  PostProcessStage,
  Primitive,
  type Scene,
  Transforms,
  WallGeometry
} from "cesium";
import type { MaterialManager, PrimitiveMaterialDescriptor } from "../materials";
import { parseColorLike } from "../style";
import { FOG_FRAGMENT_SHADER, RAIN_FRAGMENT_SHADER, SNOW_FRAGMENT_SHADER } from "./shaders";
import type {
  EffectConfig,
  EffectMaterialDescriptor,
  ParticleEffectConfig,
  WeatherEffectConfig
} from "./types";

let postProcessRuntimeId = 0;

export type EffectRuntimeScene = Pick<Scene, "primitives" | "postProcessStages">;

export interface EffectRuntimeContext {
  scene: EffectRuntimeScene;
  materials: MaterialManager;
}

export interface EffectRuntime {
  readonly objects: unknown[];
  readonly animated: boolean;
  attach(): void;
  detach(): void;
  setShow(show: boolean): void;
  advance(seconds: number): void;
  destroy(): void;
}

export async function createEffectRuntime(
  context: EffectRuntimeContext,
  config: EffectConfig
): Promise<EffectRuntime> {
  switch (config.type) {
    case "flow-line":
      return createFlowLineRuntime(context, config);
    case "flow-wall":
      return createPrimitiveRuntime(
        context,
        new WallGeometry({
          positions: clonePositions(config.positions),
          minimumHeights: config.minimumHeights?.slice(),
          maximumHeights: config.maximumHeights?.slice(),
          vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
        }),
        await createEffectMaterial(context.materials, config.material),
        true
      );
    case "pulse-circle":
      return createPrimitiveRuntime(
        context,
        createCircleGeometry(config.position, config.radius, config.height),
        await createEffectMaterial(
          context.materials,
          config.material ?? { type: "radial-wave", color: "#00d4ff", speed: 1, rings: 3 }
        ),
        true
      );
    case "radar-scan":
      return createPrimitiveRuntime(
        context,
        createCircleGeometry(config.position, config.radius, config.height),
        await createEffectMaterial(
          context.materials,
          config.material ?? { type: "radar-scan", color: "#35d07f", speed: 1, sectorSize: 0.18 }
        ),
        true
      );
    case "water-surface":
      return createPrimitiveRuntime(
        context,
        PolygonGeometry.fromPositions({
          positions: clonePositions(config.positions),
          perPositionHeight: true,
          vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
        }),
        await createEffectMaterial(context.materials, config.material),
        true
      );
    case "particle":
      return createParticleRuntime(context, config);
    case "rain":
    case "snow":
    case "fog":
      return createWeatherRuntime(context, config);
  }
}

async function createFlowLineRuntime(
  context: EffectRuntimeContext,
  config: Extract<EffectConfig, { type: "flow-line" }>
): Promise<EffectRuntime> {
  const material = await createEffectMaterial(context.materials, config.material);
  const collection = new PolylineCollection();
  collection.add({
    id: config.id,
    positions: clonePositions(config.positions),
    width: config.width ?? 3,
    material,
    show: config.show ?? true
  });
  return new PrimitiveSceneRuntime(context.scene, collection, true, (show) => {
    collection.show = show;
  }, (seconds) => setMaterialTime(material, seconds));
}

function createPrimitiveRuntime(
  context: EffectRuntimeContext,
  geometry: CircleGeometry | WallGeometry | PolygonGeometry,
  material: Material,
  animated: boolean
): EffectRuntime {
  const primitive = new Primitive({
    geometryInstances: new GeometryInstance({ geometry }),
    appearance: new MaterialAppearance({
      material,
      faceForward: true,
      translucent: true,
      closed: false
    }),
    // Keep geometry preparation deterministic for transactional effect replacement.
    asynchronous: false
  });
  return new PrimitiveSceneRuntime(context.scene, primitive, animated, (show) => {
    primitive.show = show;
  }, (seconds) => setMaterialTime(material, seconds), () => {
    if (!material.isDestroyed()) {
      material.destroy();
    }
  });
}

function createCircleGeometry(
  position: Cartesian3,
  radius: number,
  height?: number
): CircleGeometry {
  return new CircleGeometry({
    center: Cartesian3.clone(position),
    radius,
    height,
    vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
  });
}

function createParticleRuntime(
  context: EffectRuntimeContext,
  config: ParticleEffectConfig
): EffectRuntime {
  const size = config.imageSize ?? [20, 20];
  const particle = new ParticleSystem({
    image: config.image,
    modelMatrix: Transforms.eastNorthUpToFixedFrame(config.position),
    emissionRate: config.emissionRate ?? 8,
    speed: config.speed ?? 2,
    particleLife: config.particleLife ?? 4,
    lifetime: config.lifetime,
    startScale: config.startScale ?? 1,
    endScale: config.endScale ?? 0.4,
    imageSize: new Cartesian2(size[0], size[1]),
    startColor: parseColorLike(config.startColor ?? "#ffffff", "effect.particle.startColor"),
    endColor: parseColorLike(config.endColor ?? "#ffffff00", "effect.particle.endColor"),
    sizeInMeters: config.sizeInMeters ?? false,
    show: config.show ?? true
  });
  return new PrimitiveSceneRuntime(context.scene, particle, true, (show) => {
    particle.show = show;
  });
}

function createWeatherRuntime(
  context: EffectRuntimeContext,
  config: WeatherEffectConfig
): EffectRuntime {
  const state = { time: 0 };
  const intensity = config.intensity ?? 0.5;
  const uniforms =
    config.type === "fog"
      ? {
          intensity,
          fogColor: parseColorLike(config.color ?? "#c8d1dc", "effect.fog.color")
        }
      : {
          time: () => state.time,
          intensity,
          effectColor: parseColorLike(
            config.color ?? (config.type === "rain" ? "#9fc2e6" : "#ffffff"),
            `effect.${config.type}.color`
          )
        };
  const stage = new PostProcessStage({
    name: `kairos-effect-${config.type}-${config.id}-${++postProcessRuntimeId}`,
    fragmentShader:
      config.type === "rain"
        ? RAIN_FRAGMENT_SHADER
        : config.type === "snow"
          ? SNOW_FRAGMENT_SHADER
          : FOG_FRAGMENT_SHADER,
    uniforms
  });
  const speed = config.speed ?? 1;
  return new PostProcessRuntime(
    context.scene,
    stage,
    config.type !== "fog",
    (seconds) => {
      state.time += seconds * speed;
    }
  );
}

async function createEffectMaterial(
  materials: MaterialManager,
  descriptor: EffectMaterialDescriptor
): Promise<Material> {
  return materials.createMaterial({
    ...descriptor,
    target: "primitive"
  } as PrimitiveMaterialDescriptor);
}

function setMaterialTime(material: Material, seconds: number): void {
  const uniforms = material.uniforms as Record<string, unknown>;
  if ("time" in uniforms) {
    const current = typeof uniforms.time === "number" ? uniforms.time : 0;
    uniforms.time = current + seconds;
  }
}

class PrimitiveSceneRuntime implements EffectRuntime {
  readonly objects: unknown[];
  private attached = false;
  private destroyed = false;

  constructor(
    private readonly scene: EffectRuntimeScene,
    private readonly primitive: Primitive | PolylineCollection | ParticleSystem,
    readonly animated: boolean,
    private readonly showSetter: (show: boolean) => void,
    private readonly advanceCallback?: (seconds: number) => void,
    private readonly destroyCallback?: () => void
  ) {
    this.objects = [primitive];
  }

  attach(): void {
    if (this.attached || this.destroyed) {
      return;
    }
    try {
      this.scene.primitives.add(this.primitive);
      this.attached = true;
    } catch (error) {
      this.attached = this.scene.primitives.contains(this.primitive);
      throw error;
    }
  }

  detach(): void {
    if (!this.attached || this.destroyed) {
      return;
    }
    if (!this.primitive.isDestroyed()) {
      const collection = this.scene.primitives;
      const destroyPrimitives = collection.destroyPrimitives;
      collection.destroyPrimitives = false;
      try {
        collection.remove(this.primitive);
      } finally {
        collection.destroyPrimitives = destroyPrimitives;
        this.attached = collection.contains(this.primitive);
      }
      return;
    }
    this.attached = false;
  }

  setShow(show: boolean): void {
    this.showSetter(show);
  }

  advance(seconds: number): void {
    this.advanceCallback?.(seconds);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    if (this.attached) {
      if (!this.primitive.isDestroyed()) {
        this.scene.primitives.remove(this.primitive);
      }
      this.attached = false;
    }
    if (!this.primitive.isDestroyed()) {
      this.primitive.destroy();
    }
    this.destroyCallback?.();
    this.destroyed = true;
  }
}

class PostProcessRuntime implements EffectRuntime {
  readonly objects: unknown[];
  private attached = false;
  private destroyed = false;

  constructor(
    private readonly scene: EffectRuntimeScene,
    private readonly stage: PostProcessStage,
    readonly animated: boolean,
    private readonly advanceCallback?: (seconds: number) => void
  ) {
    this.objects = [stage];
  }

  attach(): void {
    if (this.attached || this.destroyed) {
      return;
    }
    try {
      this.scene.postProcessStages.add(this.stage);
      this.attached = true;
    } catch (error) {
      this.attached = this.scene.postProcessStages.contains(this.stage);
      throw error;
    }
  }

  detach(): void {
    if (!this.attached || this.destroyed) {
      return;
    }
    if (!this.stage.isDestroyed()) {
      // Cesium's PostProcessStageCollection always destroys removed stages.
      // Suppress that one destroy call so the same stage can be reattached on rollback.
      const destroy = this.stage.destroy;
      this.stage.destroy = () => undefined;
      try {
        this.scene.postProcessStages.remove(this.stage);
      } finally {
        this.stage.destroy = destroy;
        this.attached = this.scene.postProcessStages.contains(this.stage);
      }
      return;
    }
    this.attached = false;
  }

  setShow(show: boolean): void {
    this.stage.enabled = show;
  }

  advance(seconds: number): void {
    this.advanceCallback?.(seconds);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    if (this.attached) {
      if (!this.stage.isDestroyed()) {
        this.scene.postProcessStages.remove(this.stage);
      }
      this.attached = false;
    }
    if (!this.stage.isDestroyed()) {
      this.stage.destroy();
    }
    this.destroyed = true;
  }
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}
