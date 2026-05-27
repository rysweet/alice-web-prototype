export type WrapMode = "repeat" | "clamp" | "mirror";
export type FilterMode = "nearest" | "linear";

export interface SamplerDescriptor {
  wrapU: WrapMode;
  wrapV: WrapMode;
  minFilter: FilterMode;
  magFilter: FilterMode;
  anisotropy: number;
}

export interface PbrMaterialDefinition {
  name: string;
  baseColor: string;
  roughness: number;
  metalness: number;
  opacity: number;
  emissive: string;
  normalScale: number;
  textures: {
    albedo?: string;
    normal?: string;
    orm?: string;
    emissive?: string;
  };
  shaderProgram: string;
  sampler: SamplerDescriptor;
}

export interface ShaderCompileResult {
  success: boolean;
  uniforms: string[];
  errors: string[];
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function cloneSampler(descriptor: SamplerDescriptor): SamplerDescriptor {
  return { ...descriptor };
}

function cloneMaterial(material: PbrMaterialDefinition): PbrMaterialDefinition {
  return {
    ...material,
    textures: { ...material.textures },
    sampler: cloneSampler(material.sampler),
  };
}

function detectUniformNames(source: string): string[] {
  const matches = source.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g);
  return [...new Set([...matches].map((match) => match[1]))].sort();
}

export class ShaderProgram {
  private compiled = false;
  private compileResult: ShaderCompileResult | null = null;

  constructor(
    readonly name: string,
    readonly vertexSource: string,
    readonly fragmentSource: string,
  ) {}

  compile(): ShaderCompileResult {
    const errors: string[] = [];
    if (!this.vertexSource.includes("void main")) {
      errors.push("vertex shader is missing void main");
    }
    if (!this.fragmentSource.includes("void main")) {
      errors.push("fragment shader is missing void main");
    }
    const uniforms = [...new Set([
      ...detectUniformNames(this.vertexSource),
      ...detectUniformNames(this.fragmentSource),
    ])].sort();
    this.compiled = errors.length === 0;
    this.compileResult = {
      success: this.compiled,
      uniforms,
      errors,
    };
    return this.compileResult;
  }

  isCompiled(): boolean {
    return this.compiled;
  }

  getUniformNames(): string[] {
    return this.compileResult?.uniforms ?? [];
  }
}

export class ShaderUniforms {
  private readonly values = new Map<string, unknown>();

  static detect(source: string | readonly string[]): ShaderUniforms {
    const combined = typeof source === "string" ? source : source.join("\n");
    const uniforms = new ShaderUniforms();
    detectUniformNames(combined).forEach((name) => uniforms.bind(name, null));
    return uniforms;
  }

  bind(name: string, value: unknown): void {
    this.values.set(name, value);
  }

  bindAll(values: Record<string, unknown>): void {
    Object.entries(values).forEach(([name, value]) => this.bind(name, value));
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  get(name: string): unknown {
    return this.values.get(name);
  }

  toObject(): Record<string, unknown> {
    return Object.fromEntries(this.values.entries());
  }
}

export class TextureSampler {
  private descriptor: SamplerDescriptor = {
    wrapU: "repeat",
    wrapV: "repeat",
    minFilter: "linear",
    magFilter: "linear",
    anisotropy: 1,
  };

  setWrapModes(wrapU: WrapMode, wrapV: WrapMode): this {
    this.descriptor.wrapU = wrapU;
    this.descriptor.wrapV = wrapV;
    return this;
  }

  setFiltering(minFilter: FilterMode, magFilter: FilterMode): this {
    this.descriptor.minFilter = minFilter;
    this.descriptor.magFilter = magFilter;
    return this;
  }

  setAnisotropy(anisotropy: number): this {
    this.descriptor.anisotropy = Math.min(Math.max(Math.round(anisotropy), 1), 16);
    return this;
  }

  toDescriptor(): SamplerDescriptor {
    return cloneSampler(this.descriptor);
  }
}

export class MaterialVariant {
  constructor(
    private readonly base: PbrMaterialDefinition,
    private readonly overrides: Partial<PbrMaterialDefinition>,
  ) {}

  resolve(): PbrMaterialDefinition {
    return {
      ...cloneMaterial(this.base),
      ...this.overrides,
      textures: {
        ...this.base.textures,
        ...(this.overrides.textures ?? {}),
      },
      sampler: {
        ...this.base.sampler,
        ...(this.overrides.sampler ?? {}),
      },
      roughness: clamp01(this.overrides.roughness ?? this.base.roughness),
      metalness: clamp01(this.overrides.metalness ?? this.base.metalness),
      opacity: clamp01(this.overrides.opacity ?? this.base.opacity),
    };
  }
}

export class MaterialLibrary {
  private readonly presets = new Map<string, PbrMaterialDefinition>([
    ["wood", this.createPreset("wood", "#8b5a2b", 0.65, 0.05)],
    ["metal", this.createPreset("metal", "#b0b7c3", 0.2, 0.95)],
    ["glass", this.createPreset("glass", "#d7f3ff", 0.05, 0.0, 0.25)],
    ["skin", this.createPreset("skin", "#f1c7a0", 0.55, 0.05)],
    ["fabric", this.createPreset("fabric", "#4456aa", 0.85, 0.0)],
  ]);

  listPresetNames(): string[] {
    return [...this.presets.keys()].sort();
  }

  getPreset(name: string): PbrMaterialDefinition {
    const preset = this.presets.get(name);
    if (!preset) {
      throw new Error(`material preset "${name}" does not exist`);
    }
    return cloneMaterial(preset);
  }

  createVariant(name: string, overrides: Partial<PbrMaterialDefinition>): MaterialVariant {
    return new MaterialVariant(this.getPreset(name), overrides);
  }

  private createPreset(
    name: string,
    baseColor: string,
    roughness: number,
    metalness: number,
    opacity = 1,
  ): PbrMaterialDefinition {
    return {
      name,
      baseColor,
      roughness,
      metalness,
      opacity,
      emissive: "#000000",
      normalScale: 1,
      textures: {},
      shaderProgram: "pbr",
      sampler: new TextureSampler().setAnisotropy(4).toDescriptor(),
    };
  }
}

export class MaterialSystem {
  private readonly programs = new Map<string, ShaderProgram>();
  private readonly materials = new Map<string, PbrMaterialDefinition>();

  constructor(private readonly library = new MaterialLibrary()) {}

  registerProgram(program: ShaderProgram): void {
    this.programs.set(program.name, program);
  }

  registerMaterial(material: PbrMaterialDefinition): void {
    this.materials.set(material.name, cloneMaterial(material));
  }

  resolveMaterial(
    materialOrName: string | PbrMaterialDefinition,
    overrides: Partial<PbrMaterialDefinition> = {},
  ): PbrMaterialDefinition {
    const base = typeof materialOrName === "string"
      ? (this.materials.get(materialOrName) ?? this.library.getPreset(materialOrName))
      : materialOrName;
    return new MaterialVariant(base, overrides).resolve();
  }

  buildPipeline(
    materialOrName: string | PbrMaterialDefinition,
    overrides: Partial<PbrMaterialDefinition> = {},
  ): {
    material: PbrMaterialDefinition;
    program: ShaderProgram;
    uniforms: ShaderUniforms;
    sampler: SamplerDescriptor;
  } {
    const material = this.resolveMaterial(materialOrName, overrides);
    const program = this.programs.get(material.shaderProgram);
    if (!program) {
      throw new Error(`shader program "${material.shaderProgram}" is not registered`);
    }
    if (!program.isCompiled()) {
      const result = program.compile();
      if (!result.success) {
        throw new Error(result.errors.join(", "));
      }
    }
    const uniforms = ShaderUniforms.detect([program.vertexSource, program.fragmentSource]);
    uniforms.bindAll({
      uBaseColor: material.baseColor,
      uRoughness: material.roughness,
      uMetalness: material.metalness,
      uOpacity: material.opacity,
      uEmissive: material.emissive,
      uNormalScale: material.normalScale,
    });
    return {
      material,
      program,
      uniforms,
      sampler: cloneSampler(material.sampler),
    };
  }
}
