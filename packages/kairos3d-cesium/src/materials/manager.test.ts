import {
  Color,
  ColorMaterialProperty,
  GridMaterialProperty,
  Material,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty
} from "cesium";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RuntimeConcurrencyManager } from "../concurrency";
import { acquireRuntimeLease } from "../concurrency/lease";
import {
  MaterialManager,
  flowMaterialSource,
  radarScanMaterialSource,
  radialWaveMaterialSource,
  type MaterialDefinition,
  type CustomMaterialDescriptor,
  type EntityMaterialDescriptor,
  type MaterialTarget,
  type PrimitiveMaterialDescriptor
} from "./index";

beforeAll(() => {
  vi.stubGlobal("HTMLCanvasElement", class HTMLCanvasElementMock {});
  vi.stubGlobal("HTMLImageElement", class HTMLImageElementMock {});
  vi.stubGlobal("HTMLVideoElement", class HTMLVideoElementMock {});
  vi.stubGlobal("ImageBitmap", class ImageBitmapMock {});
  vi.stubGlobal("OffscreenCanvas", class OffscreenCanvasMock {});
});

describe("MaterialManager registry", () => {
  it("rejects registry mutations while materials are leased", async () => {
    const concurrency = new RuntimeConcurrencyManager();
    const manager = new MaterialManager(concurrency);
    manager.register(primitiveDefinition("custom-leased"));
    const lease = await acquireRuntimeLease(concurrency, {
      kind: "test.materials",
      mode: "write",
      resources: ["materials"]
    });

    expect(() => manager.register(primitiveDefinition("custom-blocked"))).toThrow(
      "Runtime resource"
    );
    expect(() => manager.unregister("custom-leased")).toThrow("Runtime resource");

    lease.release();
    expect(manager.unregister("custom-leased")).toBe(true);
  });

  it("lists immutable summaries for built-in definitions", () => {
    const manager = new MaterialManager();
    const definitions = manager.list();

    expect(definitions).toHaveLength(11);
    expect(definitions.find(({ type }) => type === "color")).toEqual({
      type: "color",
      targets: ["entity", "primitive"],
      builtIn: true
    });

    (definitions[0].targets as MaterialTarget[]).length = 0;
    expect(manager.list()[0].targets.length).toBeGreaterThan(0);
  });

  it("rejects duplicate registration and protects built-in definitions", () => {
    const manager = new MaterialManager();
    const definition = primitiveDefinition("custom-solid");

    manager.register(definition);
    expect(manager.has("custom-solid")).toBe(true);
    expect(() => manager.register(definition)).toThrow("already registered");
    expect(() => manager.register(primitiveDefinition("color"))).toThrow(
      "already registered"
    );
    expect(() => manager.unregister("flow")).toThrow("cannot be unregistered");
    expect(manager.unregister("custom-solid")).toBe(true);
    expect(manager.unregister("custom-solid")).toBe(false);
  });

  it("validates custom definition targets and factories", () => {
    const manager = new MaterialManager();

    expect(() =>
      manager.register({ type: "empty", targets: [] })
    ).toThrow("must not be empty");
    expect(() =>
      manager.register({ type: "entity-only", targets: ["entity"] })
    ).toThrow("require createProperty");
    expect(() =>
      manager.register({ type: "primitive-only", targets: ["primitive"] })
    ).toThrow("require createMaterial");
    expect(() =>
      manager.register({
        type: "duplicate-target",
        targets: ["entity", "entity"],
        createProperty: () => new ColorMaterialProperty(Color.WHITE)
      })
    ).toThrow("contains duplicate");
  });

  it("creates and unregisters custom Entity and Primitive materials", async () => {
    const manager = new MaterialManager();
    const definition: MaterialDefinition<CustomMaterialDescriptor> = {
      type: "custom-both",
      targets: ["entity", "primitive"],
      validate: (descriptor) => {
        if (descriptor.options?.enabled !== true) {
          throw new Error("custom-both requires enabled=true");
        }
      },
      createProperty: () => new ColorMaterialProperty(Color.RED),
      createMaterial: () => Material.fromType(Material.ColorType, { color: Color.BLUE })
    };
    manager.register(definition);

    const descriptor = {
      type: "custom-both",
      target: "entity" as const,
      options: { enabled: true }
    };
    expect(manager.createProperty(descriptor)).toBeInstanceOf(ColorMaterialProperty);
    await expect(
      manager.createMaterial({ ...descriptor, target: "primitive" })
    ).resolves.toBeInstanceOf(Material);
    expect(() =>
      manager.createProperty({ ...descriptor, options: { enabled: false } })
    ).toThrow("enabled=true");
  });

  it("destroys only its own registry and becomes unusable", () => {
    const first = new MaterialManager();
    const second = new MaterialManager();
    first.register(primitiveDefinition("custom-first"));
    first.destroy();
    first.destroy();

    expect(() => first.list()).toThrow("has been destroyed");
    expect(second.has("color")).toBe(true);
    expect(second.has("custom-first")).toBe(false);
  });
});

describe("built-in Entity materials", () => {
  it("creates isolated public MaterialProperty instances", () => {
    const manager = new MaterialManager();
    const first = manager.createProperty({
      target: "entity",
      type: "color",
      color: "#35d07f"
    });
    const second = manager.createProperty({
      target: "entity",
      type: "color",
      color: "#35d07f"
    });

    expect(first).toBeInstanceOf(ColorMaterialProperty);
    expect(second).toBeInstanceOf(ColorMaterialProperty);
    expect(first).not.toBe(second);
    expect((first as ColorMaterialProperty).color).not.toBe(
      (second as ColorMaterialProperty).color
    );
  });

  it("creates grid, polyline dash, and polyline glow properties", () => {
    const manager = new MaterialManager();

    expect(
      manager.createProperty({ target: "entity", type: "grid", lineCount: [4, 5] })
    ).toBeInstanceOf(GridMaterialProperty);
    expect(
      manager.createProperty({ target: "entity", type: "polyline-dash" })
    ).toBeInstanceOf(PolylineDashMaterialProperty);
    expect(
      manager.createProperty({ target: "entity", type: "polyline-glow" })
    ).toBeInstanceOf(PolylineGlowMaterialProperty);
  });

  it("rejects invalid colors, ranges, and target mismatches", () => {
    const manager = new MaterialManager();

    expect(() =>
      manager.createProperty({ target: "entity", type: "color", color: "invalid" })
    ).toThrow("valid CSS color");
    expect(() =>
      manager.createProperty({ target: "entity", type: "grid", cellAlpha: 2 })
    ).toThrow("grid.cellAlpha");
    expect(() =>
      manager.createProperty({
        target: "entity",
        type: "polyline-dash",
        dashPattern: 70_000
      })
    ).toThrow("dashPattern");
    expect(() =>
      manager.createProperty({
        target: "entity",
        type: "water",
        normalMap: "water.png"
      } as unknown as EntityMaterialDescriptor)
    ).toThrow('does not support target "entity"');
  });
});

describe("built-in Primitive materials", () => {
  it("creates isolated public Material instances", async () => {
    const manager = new MaterialManager();
    const descriptor = {
      target: "primitive" as const,
      type: "flow" as const,
      color: "#00d4ff",
      speed: 1.5,
      repeat: 3
    };
    const first = await manager.createMaterial(descriptor);
    const second = await manager.createMaterial(descriptor);

    expect(first).toBeInstanceOf(Material);
    expect(second).toBeInstanceOf(Material);
    expect(first).not.toBe(second);
    expect(first.type).not.toBe(second.type);
    expect(first.uniforms).not.toBe(second.uniforms);
    expect(first.uniforms.speed).toBe(1.5);
  });

  it("creates radial wave and radar scan Fabric materials", async () => {
    const manager = new MaterialManager();
    const radial = await manager.createMaterial({
      target: "primitive",
      type: "radial-wave",
      rings: 5,
      phase: 0.25
    });
    const radar = await manager.createMaterial({
      target: "primitive",
      type: "radar-scan",
      sectorSize: 0.3
    });

    expect(radial.shaderSource).toContain("radius * rings");
    expect(radial.uniforms.time).toBe(0.25);
    expect(radar.shaderSource).toContain("sectorSize");
  });

  it("validates descriptors before creating resources", async () => {
    const manager = new MaterialManager();

    await expect(
      manager.createMaterial({
        target: "primitive",
        type: "water",
        normalMap: ""
      })
    ).rejects.toThrow("water.normalMap");
    await expect(
      manager.createMaterial({
        target: "primitive",
        type: "radar-scan",
        sectorSize: 2
      })
    ).rejects.toThrow("radar-scan.sectorSize");
    await expect(
      manager.createMaterial({
        target: "primitive",
        type: "flow",
        speed: -1
      })
    ).rejects.toThrow("flow.speed");

    const wrongTarget = {
      target: "primitive",
      type: "grid"
    } as unknown as PrimitiveMaterialDescriptor;
    await expect(manager.createMaterial(wrongTarget)).rejects.toThrow(
      'does not support target "primitive"'
    );
  });

  it("keeps shader modules free of Cesium private API dependencies", () => {
    const source = [
      flowMaterialSource,
      radialWaveMaterialSource,
      radarScanMaterialSource
    ].join("\n");

    expect(source).not.toContain("_materialCache");
    expect(source).not.toContain("ShaderSource");
    expect(source).not.toContain("prototype");
  });
});

function primitiveDefinition(type: string): MaterialDefinition {
  return {
    type,
    targets: ["primitive"],
    createMaterial: () => Material.fromType(Material.ColorType, { color: Color.WHITE })
  };
}
