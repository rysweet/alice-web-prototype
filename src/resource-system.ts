export type ResourceKind = "model" | "audio" | "image" | "dynamic";

export class ResourceBase {
  public readonly tags: readonly string[];

  constructor(
    public readonly kind: ResourceKind,
    public readonly id: string,
    public readonly name: string,
    tags: readonly string[] = [],
  ) {
    if (!id.trim()) {
      throw new Error("Resource id cannot be empty");
    }
    if (!name.trim()) {
      throw new Error("Resource name cannot be empty");
    }
    this.tags = [...tags];
  }

  hasTag(tag: string): boolean {
    return this.tags.includes(tag);
  }
}

export class ImageResource extends ResourceBase {
  constructor(
    id: string,
    name: string,
    public readonly width: number,
    public readonly height: number,
    public readonly role: "texture" | "thumbnail" | "icon" = "texture",
    tags: readonly string[] = [],
  ) {
    super("image", id, name, tags);
  }

  get aspectRatio(): number {
    return this.height === 0 ? 0 : this.width / this.height;
  }
}

export class AudioResource extends ResourceBase {
  constructor(
    id: string,
    name: string,
    public readonly durationSeconds: number,
    public readonly format: string = "wav",
    public readonly looping: boolean = false,
    tags: readonly string[] = [],
  ) {
    super("audio", id, name, tags);
  }

  playbackFrames(sampleRate: number): number {
    return Math.round(this.durationSeconds * sampleRate);
  }
}

export class ModelResource extends ResourceBase {
  private readonly jointList: string[];
  private readonly animationList: string[];
  private readonly textureMap = new Map<string, ImageResource>();

  constructor(
    id: string,
    name: string,
    joints: readonly string[] = [],
    tags: readonly string[] = [],
  ) {
    super("model", id, name, tags);
    this.jointList = [...joints];
    this.animationList = [];
  }

  get joints(): readonly string[] {
    return [...this.jointList];
  }

  get animations(): readonly string[] {
    return [...this.animationList];
  }

  get textures(): ReadonlyMap<string, ImageResource> {
    return this.textureMap;
  }

  addJoint(name: string): this {
    if (!this.jointList.includes(name)) {
      this.jointList.push(name);
    }
    return this;
  }

  addAnimation(name: string): this {
    if (!this.animationList.includes(name)) {
      this.animationList.push(name);
    }
    return this;
  }

  attachTexture(slot: string, texture: ImageResource): this {
    this.textureMap.set(slot, texture);
    return this;
  }
}

export class DynamicResource extends ResourceBase {
  readonly data: ArrayBuffer;
  readonly source: "runtime" = "runtime";

  constructor(
    kind: ResourceKind,
    id: string,
    name: string,
    data: ArrayBuffer,
    tags?: readonly string[],
  ) {
    super(kind, id, name, tags);
    this.data = data.slice(0);
  }
}

export class DynamicModelResource extends DynamicResource {
  constructor(id: string, name: string, data: ArrayBuffer, tags?: readonly string[]) {
    super("model", id, name, data, tags);
  }
}

export class DynamicAudioResource extends DynamicResource {
  constructor(id: string, name: string, data: ArrayBuffer, tags?: readonly string[]) {
    super("audio", id, name, data, tags);
  }
}

export class DynamicImageResource extends DynamicResource {
  constructor(id: string, name: string, data: ArrayBuffer, tags?: readonly string[]) {
    super("image", id, name, data, tags);
  }
}

export type ProjectResource = ModelResource | AudioResource | ImageResource | DynamicResource;

export class ResourceBundle {
  private readonly resources = new Map<string, ProjectResource>();

  constructor(
    public readonly id: string,
    public readonly name: string,
  ) {
    if (!id.trim()) {
      throw new Error("Bundle id cannot be empty");
    }
    if (!name.trim()) {
      throw new Error("Bundle name cannot be empty");
    }
  }

  add(resource: ProjectResource): this {
    this.resources.set(resource.id, resource);
    return this;
  }

  replace(resource: ProjectResource): this {
    if (!this.resources.has(resource.id)) {
      throw new Error(`Bundle '${this.id}' does not contain resource '${resource.id}'`);
    }
    this.resources.set(resource.id, resource);
    return this;
  }

  get(resourceId: string): ProjectResource | null {
    return this.resources.get(resourceId) ?? null;
  }

  remove(resourceId: string): boolean {
    return this.resources.delete(resourceId);
  }

  list(kind?: ResourceKind): readonly ProjectResource[] {
    const values = [...this.resources.values()];
    return kind ? values.filter((resource) => resource.kind === kind) : values;
  }

  resourceIds(): readonly string[] {
    return [...this.resources.keys()];
  }
}

export class ResourceManifest {
  private readonly bundles = new Map<string, ResourceBundle>();

  registerBundle(bundle: ResourceBundle): this {
    this.bundles.set(bundle.id, bundle);
    return this;
  }

  listBundleIds(): readonly string[] {
    return [...this.bundles.keys()];
  }

  listResources(kind?: ResourceKind): readonly ProjectResource[] {
    return [...this.bundles.values()].flatMap((bundle) => bundle.list(kind));
  }

  findResource(resourceId: string): ProjectResource | null {
    for (const bundle of this.bundles.values()) {
      const resource = bundle.get(resourceId);
      if (resource) {
        return resource;
      }
    }
    return null;
  }

  findBundle(bundleId: string): ResourceBundle | null {
    return this.bundles.get(bundleId) ?? null;
  }
}

export class LazyResource<TResource extends ProjectResource> {
  private loadedResource: TResource | null = null;
  private pendingLoad: Promise<TResource> | null = null;
  public loadCount = 0;

  constructor(
    public readonly placeholder: TResource,
    private readonly loader: () => Promise<TResource> | TResource,
  ) {}

  get isLoaded(): boolean {
    return this.loadedResource !== null;
  }

  peek(): TResource {
    return this.loadedResource ?? this.placeholder;
  }

  async load(): Promise<TResource> {
    if (this.loadedResource) {
      return this.loadedResource;
    }
    if (!this.pendingLoad) {
      this.loadCount += 1;
      this.pendingLoad = Promise.resolve(this.loader()).then((resource) => {
        if (resource.id !== this.placeholder.id) {
          throw new Error(`Lazy resource id mismatch for '${this.placeholder.id}'`);
        }
        this.loadedResource = resource;
        this.pendingLoad = null;
        return resource;
      }).catch((error) => {
        this.pendingLoad = null;
        throw error;
      });
    }
    return this.pendingLoad;
  }

  reset(): void {
    this.loadedResource = null;
    this.pendingLoad = null;
  }
}

interface LazyRegistryEntry<TResource extends ProjectResource> {
  readonly bundleId: string;
  readonly lazy: LazyResource<TResource>;
}

export class ResourceManager {
  public readonly manifest = new ResourceManifest();
  private readonly bundles = new Map<string, ResourceBundle>();
  private readonly cache = new Map<string, ProjectResource>();
  private readonly lazyResources = new Map<string, LazyRegistryEntry<ProjectResource>>();

  constructor(bundles: readonly ResourceBundle[] = []) {
    bundles.forEach((bundle) => this.registerBundle(bundle));
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  registerBundle(bundle: ResourceBundle): this {
    this.bundles.set(bundle.id, bundle);
    this.manifest.registerBundle(bundle);
    for (const resource of bundle.list()) {
      this.cache.set(resource.id, resource);
    }
    return this;
  }

  registerResource(resource: ProjectResource, bundleId = "default"): this {
    const bundle = this.ensureBundle(bundleId);
    bundle.add(resource);
    this.cache.set(resource.id, resource);
    return this;
  }

  registerDynamic(resource: DynamicResource, bundleId = "dynamic"): this {
    return this.registerResource(resource, bundleId);
  }

  registerLazyResource<TResource extends ProjectResource>(bundleId: string, lazyResource: LazyResource<TResource>): this {
    const bundle = this.ensureBundle(bundleId);
    bundle.add(lazyResource.placeholder);
    this.lazyResources.set(lazyResource.placeholder.id, {
      bundleId,
      lazy: lazyResource as LazyResource<ProjectResource>,
    });
    this.cache.delete(lazyResource.placeholder.id);
    return this;
  }

  hasResource(resourceId: string): boolean {
    return this.cache.has(resourceId) || this.lazyResources.has(resourceId) || this.manifest.findResource(resourceId) !== null;
  }

  getResource(resourceId: string): ProjectResource | null {
    const cached = this.cache.get(resourceId);
    if (cached) {
      return cached;
    }
    const lazyEntry = this.lazyResources.get(resourceId);
    if (lazyEntry) {
      return lazyEntry.lazy.peek();
    }
    return this.manifest.findResource(resourceId);
  }

  requireResource(resourceId: string): ProjectResource {
    const resource = this.getResource(resourceId);
    if (!resource) {
      throw new Error(`Unknown resource '${resourceId}'`);
    }
    return resource;
  }

  async load(resourceId: string): Promise<ProjectResource> {
    const cached = this.cache.get(resourceId);
    if (cached) {
      return cached;
    }
    const lazyEntry = this.lazyResources.get(resourceId);
    if (!lazyEntry) {
      throw new Error(`Unknown resource '${resourceId}'`);
    }
    const loaded = await lazyEntry.lazy.load();
    this.cache.set(resourceId, loaded);
    this.bundles.get(lazyEntry.bundleId)?.replace(loaded);
    return loaded;
  }

  async preloadBundle(bundleId: string): Promise<readonly ProjectResource[]> {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Unknown bundle '${bundleId}'`);
    }
    return Promise.all(bundle.resourceIds().map((resourceId) => this.load(resourceId).catch(() => this.requireResource(resourceId))));
  }

  clearCache(): void {
    this.cache.clear();
    for (const bundle of this.bundles.values()) {
      for (const resource of bundle.list()) {
        if (!this.lazyResources.has(resource.id)) {
          this.cache.set(resource.id, resource);
        }
      }
    }
    for (const [resourceId, entry] of this.lazyResources) {
      entry.lazy.reset();
      this.bundles.get(entry.bundleId)?.replace(entry.lazy.placeholder);
      this.cache.delete(resourceId);
    }
  }

  listResources(kind?: ResourceKind): readonly ProjectResource[] {
    return this.manifest.listResources(kind);
  }

  private ensureBundle(bundleId: string): ResourceBundle {
    let bundle = this.bundles.get(bundleId);
    if (!bundle) {
      bundle = new ResourceBundle(bundleId, bundleId);
      this.registerBundle(bundle);
    }
    return bundle;
  }
}
