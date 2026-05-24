import * as THREE from "three";
import { SingleAppearance, TexturedAppearance } from "./scenegraph";

export interface TextureImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface EncodedTextureSource {
  readonly bytes: Uint8Array;
  readonly mimeType?: string | null;
}

export interface UrlTextureSource {
  readonly url: string;
}

export type TextureSource = TextureImageData | EncodedTextureSource | UrlTextureSource;

export interface TextureOptions {
  readonly mipMappingDesired?: boolean;
  readonly potentiallyAlphaBlended?: boolean;
}

export type TextureChangeReason = "image" | "mipmap" | "alpha";
export type TextureListener = (texture: ManagedTexture, reason: TextureChangeReason) => void;

export interface MaterialDefinition {
  readonly name?: string;
  readonly diffuseColor: number;
  readonly specularColor: number;
  readonly emissiveColor: number;
  readonly opacity: number;
  readonly shininess: number;
  readonly visible: boolean;
  readonly wireframe: boolean;
  readonly flatShading: boolean;
  readonly ethereal: boolean;
  readonly diffuseTextureKey?: string | null;
  readonly bumpTextureKey?: string | null;
  readonly alphaBlended: boolean;
  readonly clamped: boolean;
}

export interface ResolvedMaterialTextures {
  readonly diffuse?: ManagedTexture | THREE.Texture | null;
  readonly bump?: ManagedTexture | THREE.Texture | null;
}

export interface TextureCoordinateMapping {
  readonly repeatU?: number;
  readonly repeatV?: number;
  readonly offsetU?: number;
  readonly offsetV?: number;
  readonly flipV?: boolean;
}

function cloneTextureImageData(imageData: TextureImageData): TextureImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  };
}

function isTextureImageData(source: TextureSource): source is TextureImageData {
  return (
    typeof (source as TextureImageData).width === "number" &&
    typeof (source as TextureImageData).height === "number" &&
    ArrayBuffer.isView((source as TextureImageData).data)
  );
}

function cloneTextureSource(source: TextureSource): TextureSource {
  if (isTextureImageData(source)) {
    return cloneTextureImageData(source);
  }
  if ("bytes" in source) {
    return { ...source, bytes: new Uint8Array(source.bytes) };
  }
  return { ...source };
}

function containsTransparentPixels(data: Uint8Array | Uint8ClampedArray): boolean {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) {
      return true;
    }
  }
  return false;
}

async function decodeTextureSource(source: TextureSource): Promise<TextureImageData> {
  if (isTextureImageData(source)) {
    return cloneTextureImageData(source);
  }

  const { createCanvas, loadImage } = await import("canvas");
  const image = await loadImage(
    "bytes" in source
      ? Buffer.from(source.bytes.buffer, source.bytes.byteOffset, source.bytes.byteLength)
      : source.url,
  );
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, image.width, image.height);
  const imageData = context.getImageData(0, 0, image.width, image.height);
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(imageData.data),
  };
}

export class TextureCoordinate2 {
  constructor(
    public readonly u: number,
    public readonly v: number,
  ) {}

  static createNaN(): TextureCoordinate2 {
    return new TextureCoordinate2(Number.NaN, Number.NaN);
  }

  clone(): TextureCoordinate2 {
    return new TextureCoordinate2(this.u, this.v);
  }

  isNaN(): boolean {
    return Number.isNaN(this.u) || Number.isNaN(this.v);
  }

  equals(other: TextureCoordinate2): boolean {
    return Object.is(this.u, other.u) && Object.is(this.v, other.v);
  }
}

export function mapU(value: number, mapping: TextureCoordinateMapping = {}): number {
  return value * (mapping.repeatU ?? 1) + (mapping.offsetU ?? 0);
}

export function mapV(value: number, mapping: TextureCoordinateMapping = {}): number {
  const mapped = value * (mapping.repeatV ?? 1) + (mapping.offsetV ?? 0);
  return mapping.flipV ? 1 - mapped : mapped;
}

export function mapTextureCoordinate(
  coordinate: TextureCoordinate2 | { readonly u: number; readonly v: number },
  mapping: TextureCoordinateMapping = {},
): TextureCoordinate2 {
  return new TextureCoordinate2(
    mapU(coordinate.u, mapping),
    mapV(coordinate.v, mapping),
  );
}

export function mapTextureCoordinates(
  coordinates: readonly (TextureCoordinate2 | { readonly u: number; readonly v: number })[],
  mapping: TextureCoordinateMapping = {},
): TextureCoordinate2[] {
  return coordinates.map((coordinate) => mapTextureCoordinate(coordinate, mapping));
}

export class ManagedTexture {
  readonly #listeners = new Set<TextureListener>();
  #imageData: TextureImageData | null;
  #threeTexture: THREE.DataTexture | null = null;

  mipMappingDesired: boolean;
  potentiallyAlphaBlended: boolean;

  constructor(
    readonly key: string,
    imageData: TextureImageData | null = null,
    options: TextureOptions = {},
  ) {
    this.#imageData = imageData ? cloneTextureImageData(imageData) : null;
    this.mipMappingDesired = options.mipMappingDesired ?? true;
    this.potentiallyAlphaBlended = options.potentiallyAlphaBlended
      ?? (imageData ? containsTransparentPixels(imageData.data) : false);
  }

  get width(): number {
    return this.#imageData?.width ?? 0;
  }

  get height(): number {
    return this.#imageData?.height ?? 0;
  }

  get imageData(): TextureImageData | null {
    return this.#imageData ? cloneTextureImageData(this.#imageData) : null;
  }

  isValid(): boolean {
    return this.width > 0 && this.height > 0;
  }

  addListener(listener: TextureListener): void {
    this.#listeners.add(listener);
  }

  removeListener(listener: TextureListener): void {
    this.#listeners.delete(listener);
  }

  updateImage(imageData: TextureImageData): void {
    const next = cloneTextureImageData(imageData);
    this.#imageData = next;
    const inferredAlpha = containsTransparentPixels(next.data);
    const alphaChanged = inferredAlpha !== this.potentiallyAlphaBlended;
    this.potentiallyAlphaBlended = inferredAlpha;
    this.#fire("image");
    if (alphaChanged) {
      this.#fire("alpha");
    }
  }

  setMipMappingDesired(value: boolean): void {
    if (this.mipMappingDesired === value) {
      return;
    }
    this.mipMappingDesired = value;
    this.#fire("mipmap");
  }

  setPotentiallyAlphaBlended(value: boolean): void {
    if (this.potentiallyAlphaBlended === value) {
      return;
    }
    this.potentiallyAlphaBlended = value;
    this.#fire("alpha");
  }

  toThreeTexture(): THREE.DataTexture | null {
    if (!this.#imageData) {
      return null;
    }

    const pixels = new Uint8Array(this.#imageData.data);
    const currentWidth = this.#threeTexture?.image?.width ?? -1;
    const currentHeight = this.#threeTexture?.image?.height ?? -1;
    if (!this.#threeTexture || currentWidth !== this.#imageData.width || currentHeight !== this.#imageData.height) {
      this.#threeTexture = new THREE.DataTexture(
        pixels,
        this.#imageData.width,
        this.#imageData.height,
        THREE.RGBAFormat,
      );
    } else {
      this.#threeTexture.image = {
        data: pixels,
        width: this.#imageData.width,
        height: this.#imageData.height,
      };
    }

    this.#threeTexture.generateMipmaps = this.mipMappingDesired;
    this.#threeTexture.minFilter = this.mipMappingDesired
      ? THREE.LinearMipmapLinearFilter
      : THREE.LinearFilter;
    this.#threeTexture.magFilter = THREE.LinearFilter;
    this.#threeTexture.needsUpdate = true;
    this.#threeTexture.userData = {
      ...this.#threeTexture.userData,
      isPotentiallyAlphaBlended: this.potentiallyAlphaBlended,
      textureKey: this.key,
    };
    return this.#threeTexture;
  }

  #fire(reason: TextureChangeReason): void {
    for (const listener of this.#listeners) {
      listener(this, reason);
    }
  }
}

export class TextureManager {
  readonly #sources = new Map<string, TextureSource>();
  readonly #cache = new Map<string, ManagedTexture>();
  readonly #pending = new Map<string, Promise<ManagedTexture>>();
  readonly #references = new Map<string, number>();

  constructor(
    private readonly loader?: (key: string) => TextureSource | Promise<TextureSource>,
  ) {}

  register(key: string, source: TextureSource): void {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new TypeError("texture key must be a non-empty string");
    }
    if (this.#sources.has(normalizedKey)) {
      throw new TypeError(`texture \"${normalizedKey}\" is already registered`);
    }
    this.#sources.set(normalizedKey, cloneTextureSource(source));
  }

  has(key: string): boolean {
    return this.#sources.has(key) || this.#cache.has(key);
  }

  async load(key: string, options: TextureOptions = {}): Promise<ManagedTexture> {
    const cached = this.#cache.get(key);
    if (cached) {
      if (options.mipMappingDesired !== undefined) {
        cached.setMipMappingDesired(options.mipMappingDesired);
      }
      if (options.potentiallyAlphaBlended !== undefined) {
        cached.setPotentiallyAlphaBlended(options.potentiallyAlphaBlended);
      }
      return cached;
    }

    const inflight = this.#pending.get(key);
    if (inflight) {
      return inflight;
    }

    const promise = (async () => {
      const source = this.#sources.get(key) ?? await this.loader?.(key);
      if (!source) {
        throw new Error(`Unknown texture resource '${key}'`);
      }
      const imageData = await decodeTextureSource(source);
      const texture = new ManagedTexture(key, imageData, options);
      this.#cache.set(key, texture);
      if (!this.#sources.has(key)) {
        this.#sources.set(key, cloneTextureSource(source));
      }
      this.#pending.delete(key);
      return texture;
    })().catch((error) => {
      this.#pending.delete(key);
      throw error;
    });

    this.#pending.set(key, promise);
    return promise;
  }

  async acquire(key: string, options: TextureOptions = {}): Promise<ManagedTexture> {
    this.#references.set(key, this.referenceCount(key) + 1);
    try {
      return await this.load(key, options);
    } catch (error) {
      this.release(key);
      throw error;
    }
  }

  release(key: string): number {
    const next = Math.max(0, this.referenceCount(key) - 1);
    if (next === 0) {
      this.#references.delete(key);
    } else {
      this.#references.set(key, next);
    }
    return next;
  }

  referenceCount(key: string): number {
    return this.#references.get(key) ?? 0;
  }

  isReferenced(key: string): boolean {
    return this.referenceCount(key) > 0;
  }

  getIfLoaded(key: string): ManagedTexture | null {
    return this.#cache.get(key) ?? null;
  }

  remove(key: string): boolean {
    const hadEntry = this.#sources.delete(key);
    this.#cache.delete(key);
    this.#pending.delete(key);
    this.#references.delete(key);
    return hadEntry;
  }

  clear(): void {
    this.#sources.clear();
    this.#cache.clear();
    this.#pending.clear();
    this.#references.clear();
  }
}

export function createMaterialDefinition(overrides: Partial<MaterialDefinition> = {}): MaterialDefinition {
  const { opacity = 1, ...rest } = overrides;
  return {
    diffuseColor: 0xffffff,
    specularColor: 0x000000,
    emissiveColor: 0x000000,
    opacity: Math.max(0, Math.min(1, opacity)),
    shininess: 0,
    visible: true,
    wireframe: false,
    flatShading: false,
    ethereal: false,
    diffuseTextureKey: null,
    bumpTextureKey: null,
    alphaBlended: false,
    clamped: false,
    ...rest,
  };
}

function resolveThreeTexture(texture: ManagedTexture | THREE.Texture | null | undefined): THREE.Texture | null {
  if (!texture) {
    return null;
  }
  return texture instanceof ManagedTexture ? texture.toThreeTexture() : texture;
}

export function applyMaterialDefinition(
  appearance: SingleAppearance | TexturedAppearance,
  definition: MaterialDefinition,
  textures: ResolvedMaterialTextures = {},
): void {
  appearance.color = definition.diffuseColor;
  appearance.opacity = Math.max(0, Math.min(1, definition.opacity));
  appearance.visible = definition.visible;
  appearance.specularHighlightColor = definition.specularColor;
  appearance.emissiveColor = definition.emissiveColor;
  appearance.specularHighlightExponent = definition.shininess;
  appearance.isEthereal = definition.ethereal;
  appearance.fillingStyle = definition.wireframe ? "wireframe" : "solid";
  appearance.shadingStyle = definition.flatShading ? "flat" : "smooth";

  if (appearance instanceof TexturedAppearance) {
    appearance.setDiffuseColorTexture(resolveThreeTexture(textures.diffuse));
    appearance.setBumpTexture(resolveThreeTexture(textures.bump));
    appearance.setDiffuseColorTextureAlphaBlended(definition.alphaBlended);
    appearance.setDiffuseColorTextureClamped(definition.clamped);
  }
}

export function createAppearanceFromMaterial(
  definition: MaterialDefinition,
  textures: ResolvedMaterialTextures = {},
): SingleAppearance | TexturedAppearance {
  const hasTextures = Boolean(
    definition.diffuseTextureKey
      || definition.bumpTextureKey
      || textures.diffuse
      || textures.bump,
  );
  const appearance = hasTextures ? new TexturedAppearance() : new SingleAppearance();
  applyMaterialDefinition(appearance, definition, textures);
  return appearance;
}
