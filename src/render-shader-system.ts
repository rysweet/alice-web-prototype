export type ShaderStage = "vertex" | "fragment";
export type ShaderDefineValue = string | number | boolean;

export interface CompiledShader {
  readonly stage: ShaderStage;
  readonly source: string;
  readonly transformedSource: string;
  readonly uniforms: readonly string[];
  readonly attributes: readonly string[];
  readonly defines: Readonly<Record<string, string>>;
}

function extractSymbols(source: string, pattern: RegExp): string[] {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1]))].sort();
}

function normalizeDefineValue(value: ShaderDefineValue): string {
  return typeof value === "boolean" ? (value ? "1" : "0") : String(value);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return [...value] as T;
  }
  if (value && typeof value === "object") {
    return { ...(value as Record<string, unknown>) } as T;
  }
  return value;
}

export class ShaderError extends Error {
  constructor(
    message: string,
    readonly stage?: ShaderStage,
    readonly diagnostics: readonly string[] = [],
  ) {
    super(message);
    this.name = "ShaderError";
  }
}

export class ShaderVariant {
  private readonly defines = new Map<string, string>();

  constructor(readonly name = "default", initialDefines: Record<string, ShaderDefineValue> = {}) {
    Object.entries(initialDefines).forEach(([key, value]) => this.setDefine(key, value));
  }

  setDefine(name: string, value: ShaderDefineValue = true): this {
    this.defines.set(name, normalizeDefineValue(value));
    return this;
  }

  removeDefine(name: string): this {
    this.defines.delete(name);
    return this;
  }

  hasDefine(name: string): boolean {
    return this.defines.has(name);
  }

  toObject(): Record<string, string> {
    return Object.fromEntries([...this.defines.entries()].sort(([left], [right]) => left.localeCompare(right)));
  }

  key(): string {
    const entries = Object.entries(this.toObject());
    return entries.length === 0
      ? this.name
      : `${this.name}:${entries.map(([key, value]) => `${key}=${value}`).join(",")}`;
  }

  renderPrefix(): string {
    return Object.entries(this.toObject())
      .map(([key, value]) => `#define ${key} ${value}`)
      .join("\n");
  }

  apply(source: string): string {
    const prefix = this.renderPrefix();
    return prefix.length > 0 ? `${prefix}\n${source}` : source;
  }
}

export class ShaderCompiler {
  compile(stage: ShaderStage, source: string, variant = new ShaderVariant()): CompiledShader {
    const transformedSource = variant.apply(source);
    const diagnostics: string[] = [];
    const openBraces = [...transformedSource].filter((token) => token === "{").length;
    const closeBraces = [...transformedSource].filter((token) => token === "}").length;
    if (!/void\s+main\s*\(/.test(transformedSource)) {
      diagnostics.push(`${stage} shader is missing void main()`);
    }
    if (openBraces !== closeBraces) {
      diagnostics.push(`${stage} shader has mismatched braces`);
    }
    if (diagnostics.length > 0) {
      throw new ShaderError(`Failed to compile ${stage} shader`, stage, diagnostics);
    }
    return {
      stage,
      source,
      transformedSource,
      uniforms: extractSymbols(transformedSource, /uniform\s+\w+\s+(\w+)\s*;/g),
      attributes: stage === "vertex"
        ? extractSymbols(transformedSource, /(?:in|attribute)\s+\w+\s+(\w+)\s*;/g)
        : [],
      defines: variant.toObject(),
    };
  }
}

export class ShaderProgram {
  private linked = false;
  private readonly uniforms = new Map<string, unknown>();
  private readonly attributeLocations = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly vertexShader: CompiledShader,
    readonly fragmentShader: CompiledShader,
  ) {}

  static fromSource(
    name: string,
    vertexSource: string,
    fragmentSource: string,
    compiler = new ShaderCompiler(),
    variant = new ShaderVariant(name),
  ): ShaderProgram {
    return new ShaderProgram(
      name,
      compiler.compile("vertex", vertexSource, variant),
      compiler.compile("fragment", fragmentSource, variant),
    );
  }

  link(): this {
    if (this.vertexShader.stage !== "vertex" || this.fragmentShader.stage !== "fragment") {
      throw new ShaderError("Shader stages are not link-compatible");
    }
    this.attributeLocations.clear();
    this.vertexShader.attributes.forEach((attribute, index) => {
      this.attributeLocations.set(attribute, index);
    });
    this.linked = true;
    return this;
  }

  isLinked(): boolean {
    return this.linked;
  }

  getUniformNames(): string[] {
    return [...new Set([...this.vertexShader.uniforms, ...this.fragmentShader.uniforms])].sort();
  }

  getAttributeNames(): string[] {
    return [...this.attributeLocations.keys()];
  }

  getAttributeLocation(name: string): number {
    const location = this.attributeLocations.get(name);
    if (location === undefined) {
      throw new ShaderError(`Unknown attribute: ${name}`);
    }
    return location;
  }

  setUniform(name: string, value: unknown): this {
    if (!this.getUniformNames().includes(name)) {
      throw new ShaderError(`Unknown uniform: ${name}`);
    }
    this.uniforms.set(name, cloneValue(value));
    return this;
  }

  getUniform(name: string): unknown {
    return this.uniforms.get(name);
  }
}

export class UniformBuffer {
  private readonly values = new Map<string, unknown>();
  private readonly dirty = new Set<string>();

  set(name: string, value: unknown): this {
    this.values.set(name, cloneValue(value));
    this.dirty.add(name);
    return this;
  }

  setMany(values: Record<string, unknown>): this {
    Object.entries(values).forEach(([name, value]) => this.set(name, value));
    return this;
  }

  get(name: string): unknown {
    return this.values.get(name);
  }

  dirtyCount(): number {
    return this.dirty.size;
  }

  flush(program?: ShaderProgram): Record<string, unknown> {
    const flushed: Record<string, unknown> = {};
    [...this.dirty].sort().forEach((name) => {
      const value = cloneValue(this.values.get(name));
      flushed[name] = value;
      if (program) {
        program.setUniform(name, value);
      }
      this.dirty.delete(name);
    });
    return flushed;
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries([...this.values.entries()].map(([name, value]) => [name, cloneValue(value)]));
  }
}

const BUILTIN_SHADERS = {
  phong: {
    vertex: `in vec3 position; in vec3 normal; uniform mat4 modelMatrix; uniform mat4 viewProjection; void main() { gl_Position = viewProjection * modelMatrix * vec4(position, 1.0); }`,
    fragment: `uniform vec3 diffuseColor; uniform vec3 lightDirection; out vec4 fragmentColor; void main() { float light = max(dot(normalize(lightDirection), vec3(0.0, 0.0, 1.0)), 0.0); fragmentColor = vec4(diffuseColor * light, 1.0); }`,
  },
  pbr: {
    vertex: `in vec3 position; in vec3 normal; in vec2 uv; uniform mat4 modelMatrix; uniform mat4 viewProjection; void main() { gl_Position = viewProjection * modelMatrix * vec4(position, 1.0); }`,
    fragment: `uniform vec3 baseColor; uniform float roughness; uniform float metalness; out vec4 fragmentColor; void main() { float surface = clamp(1.0 - roughness * 0.5 + metalness * 0.1, 0.0, 1.0); fragmentColor = vec4(baseColor * surface, 1.0); }`,
  },
  unlit: {
    vertex: `in vec3 position; uniform mat4 modelViewProjection; void main() { gl_Position = modelViewProjection * vec4(position, 1.0); }`,
    fragment: `uniform vec4 tintColor; out vec4 fragmentColor; void main() { fragmentColor = tintColor; }`,
  },
  wireframe: {
    vertex: `in vec3 position; uniform mat4 modelViewProjection; void main() { gl_Position = modelViewProjection * vec4(position, 1.0); }`,
    fragment: `uniform vec4 lineColor; out vec4 fragmentColor; void main() { fragmentColor = lineColor; }`,
  },
} as const;

export class ShaderLibrary {
  constructor(private readonly compiler = new ShaderCompiler()) {}

  list(): Array<keyof typeof BUILTIN_SHADERS> {
    return Object.keys(BUILTIN_SHADERS).sort() as Array<keyof typeof BUILTIN_SHADERS>;
  }

  getSource(name: keyof typeof BUILTIN_SHADERS): { vertex: string; fragment: string } {
    return { ...BUILTIN_SHADERS[name] };
  }

  createProgram(name: keyof typeof BUILTIN_SHADERS, variant = new ShaderVariant(name)): ShaderProgram {
    const source = this.getSource(name);
    return ShaderProgram.fromSource(name, source.vertex, source.fragment, this.compiler, variant).link();
  }
}
