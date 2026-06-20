import { describe, expect, it } from "vitest";
import {
  ShaderCompiler,
  ShaderError,
  ShaderLibrary,
  ShaderProgram,
  ShaderVariant,
  UniformBuffer,
} from "../src/render-shader-system.js";

describe("render-shader-system", () => {
  const vertexSource = `in vec3 position; in vec3 normal; uniform mat4 modelViewProjection; void main() { gl_Position = modelViewProjection * vec4(position, 1.0); }`;
  const fragmentSource = `uniform vec4 tintColor; void main() { }`;

  it("compiles shaders and extracts attributes, uniforms, and defines", () => {
    const compiler = new ShaderCompiler();
    const variant = new ShaderVariant("lit", { USE_FOG: true, MAX_LIGHTS: 4 });
    const shader = compiler.compile("vertex", vertexSource, variant);

    expect(shader.attributes).toEqual(["normal", "position"]);
    expect(shader.uniforms).toEqual(["modelViewProjection"]);
    expect(shader.transformedSource).toContain("#define MAX_LIGHTS 4");
    expect(shader.defines).toEqual({ MAX_LIGHTS: "4", USE_FOG: "1" });
  });

  it("reports compilation errors with stage diagnostics", () => {
    const compiler = new ShaderCompiler();

    expect(() => compiler.compile("fragment", "uniform vec4 color; {", new ShaderVariant("broken"))).toThrowError(ShaderError);
    try {
      compiler.compile("fragment", "uniform vec4 color; {", new ShaderVariant("broken"));
    } catch (error) {
      expect(error).toBeInstanceOf(ShaderError);
      expect((error as ShaderError).stage).toBe("fragment");
      expect((error as ShaderError).diagnostics.join(" ")).toMatch(/missing void main|mismatched braces/);
    }
  });

  it("links programs and applies uniform buffer batches", () => {
    const program = ShaderProgram.fromSource("basic", vertexSource, fragmentSource).link();
    const buffer = new UniformBuffer().setMany({
      modelViewProjection: [1, 0, 0, 1],
      tintColor: [1, 0.5, 0.25, 1],
    });

    expect(program.isLinked()).toBe(true);
    expect(program.getAttributeLocation("normal")).toBe(0);
    expect(program.getAttributeLocation("position")).toBe(1);
    expect(buffer.dirtyCount()).toBe(2);
    expect(buffer.flush(program)).toEqual({
      modelViewProjection: [1, 0, 0, 1],
      tintColor: [1, 0.5, 0.25, 1],
    });
    expect(buffer.dirtyCount()).toBe(0);
    expect(program.getUniform("tintColor")).toEqual([1, 0.5, 0.25, 1]);
  });

  it("ships built-in library programs and supports variant keys", () => {
    const library = new ShaderLibrary();
    const variant = new ShaderVariant("pbr", { USE_SKINNING: true });
    const program = library.createProgram("pbr", variant);

    expect(library.list()).toEqual(["pbr", "phong", "unlit", "wireframe"]);
    expect(program.getUniformNames()).toContain("baseColor");
    expect(variant.key()).toBe("pbr:USE_SKINNING=1");
    expect(() => program.setUniform("missingUniform", 1)).toThrow(/Unknown uniform/);
  });

  it("ships built-in fragment shaders that write fragment output", () => {
    const library = new ShaderLibrary();

    library.list().forEach((name) => {
      const { fragment } = library.getSource(name);
      const program = library.createProgram(name);

      expect(fragment).not.toMatch(/void\s+main\s*\(\s*\)\s*\{\s*\}/);
      expect(fragment).toMatch(/out\s+vec4\s+fragmentColor\s*;/);
      expect(fragment).toMatch(/fragmentColor\s*=/);
      expect(program.fragmentShader.transformedSource).toContain("fragmentColor");
    });
  });
});
