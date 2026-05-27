import { describe, expect, it } from "vitest";
import {
  MaterialLibrary,
  MaterialSystem,
  MaterialVariant,
  ShaderProgram,
  ShaderUniforms,
  TextureSampler,
} from "../src/render-materials.js";

describe("render-materials", () => {
  it("compiles shader programs and auto-detects uniforms", () => {
    const program = new ShaderProgram(
      "pbr",
      "uniform mat4 uViewProjection; void main() { gl_Position = uViewProjection * vec4(1.0); }",
      "uniform vec3 uBaseColor; void main() { }",
    );

    const result = program.compile();

    expect(result.success).toBe(true);
    expect(result.uniforms).toEqual(["uBaseColor", "uViewProjection"]);
    expect(program.isCompiled()).toBe(true);
  });

  it("detects uniforms and stores bound values", () => {
    const uniforms = ShaderUniforms.detect([
      "uniform float uOpacity;",
      "uniform vec3 uBaseColor;",
    ]);
    uniforms.bind("uOpacity", 0.5);
    uniforms.bindAll({ uBaseColor: "#ffffff" });

    expect(uniforms.has("uOpacity")).toBe(true);
    expect(uniforms.toObject()).toEqual({
      uBaseColor: "#ffffff",
      uOpacity: 0.5,
    });
  });

  it("clamps sampler anisotropy while preserving wrap and filter modes", () => {
    const sampler = new TextureSampler()
      .setWrapModes("mirror", "clamp")
      .setFiltering("nearest", "linear")
      .setAnisotropy(99)
      .toDescriptor();

    expect(sampler).toEqual({
      wrapU: "mirror",
      wrapV: "clamp",
      minFilter: "nearest",
      magFilter: "linear",
      anisotropy: 16,
    });
  });

  it("resolves material variants without mutating the base material", () => {
    const library = new MaterialLibrary();
    const base = library.getPreset("wood");
    const variant = new MaterialVariant(base, {
      name: "painted-wood",
      opacity: 0.75,
      textures: { albedo: "painted-wood-albedo" },
      sampler: { wrapU: "clamp", wrapV: "clamp", minFilter: "linear", magFilter: "linear", anisotropy: 2 },
    }).resolve();

    expect(variant).toMatchObject({
      name: "painted-wood",
      opacity: 0.75,
      textures: { albedo: "painted-wood-albedo" },
    });
    expect(base.opacity).toBe(1);
    expect(base.textures.albedo).toBeUndefined();
  });

  it("ships the required preset material library", () => {
    const library = new MaterialLibrary();

    expect(library.listPresetNames()).toEqual(["fabric", "glass", "metal", "skin", "wood"]);
    expect(library.getPreset("glass")).toMatchObject({
      baseColor: "#d7f3ff",
      opacity: 0.25,
    });
  });

  it("builds a PBR pipeline with shader uniforms from a preset material", () => {
    const system = new MaterialSystem();
    system.registerProgram(new ShaderProgram(
      "pbr",
      "uniform mat4 uViewProjection; void main() { gl_Position = uViewProjection * vec4(1.0); }",
      [
        "uniform vec3 uBaseColor;",
        "uniform float uRoughness;",
        "uniform float uMetalness;",
        "uniform float uOpacity;",
        "uniform vec3 uEmissive;",
        "uniform float uNormalScale;",
        "void main() { }",
      ].join("\n"),
    ));

    const pipeline = system.buildPipeline("metal", {
      opacity: 0.8,
      textures: { albedo: "metal-albedo" },
    });

    expect(pipeline.material).toMatchObject({
      name: "metal",
      opacity: 0.8,
      textures: { albedo: "metal-albedo" },
    });
    expect(pipeline.program.isCompiled()).toBe(true);
    expect(pipeline.uniforms.toObject()).toMatchObject({
      uBaseColor: "#b0b7c3",
      uMetalness: 0.95,
      uOpacity: 0.8,
    });
  });
});
