import {
  type LoadedModelResource,
  type ModelBrowserNode,
  type ModelClassInfoSource,
  type ModelDiscoveryOptions,
  type ModelGeometryData,
  type ModelResourceDefinition,
  type ModelResourceSummary,
} from "./definitions.js";
import {
  cloneClassInfoSource,
  cloneGeometry,
  cloneLoadedResource,
  cloneMaterialDefinitions,
  cloneSummary,
  cloneTextureRecord,
  computeBoundsFromGeometry,
  normalizeClassInfo,
  normalizeTreePath,
  resolveModelClass,
} from "./helpers.js";

export class ModelResourceCatalog {
  readonly #definitions = new Map<string, ModelResourceDefinition>();
  readonly #loaded = new Map<string, LoadedModelResource>();
  readonly #pending = new Map<string, Promise<LoadedModelResource>>();
  readonly #summaryCache = new Map<string, ModelResourceSummary>();

  constructor(seed: readonly ModelResourceDefinition[] = []) {
    for (const definition of seed) {
      this.register(definition);
    }
  }

  register(definition: ModelResourceDefinition): void {
    const id = definition.id.trim();
    if (!id) {
      throw new TypeError("model resource id must be a non-empty string");
    }
    if (this.#definitions.has(id)) {
      throw new TypeError(`model resource \"${id}\" already exists`);
    }
    if (!definition.name.trim() || !definition.modelName.trim() || !definition.category.trim()) {
      throw new TypeError("model resource must define non-empty name, modelName, and category");
    }
    this.#definitions.set(id, {
      ...definition,
      id,
      tags: [...(definition.tags ?? [])],
      treePath: normalizeTreePath(definition),
      ...(definition.geometry ? { geometry: cloneGeometry(definition.geometry) } : {}),
      ...(definition.materials ? { materials: cloneMaterialDefinitions(definition.materials) } : {}),
      ...(definition.textures ? { textures: cloneTextureRecord(definition.textures) } : {}),
      ...(definition.thumbnail ? { thumbnail: new Uint8Array(definition.thumbnail) } : {}),
      ...(definition.classInfo ? { classInfo: cloneClassInfoSource(definition.classInfo) } : {}),
    });
    this.#summaryCache.delete(id);
  }

  remove(id: string): boolean {
    const removed = this.#definitions.delete(id);
    this.#loaded.delete(id);
    this.#pending.delete(id);
    this.#summaryCache.delete(id);
    return removed;
  }

  get(id: string): ModelResourceSummary | null {
    const definition = this.#definitions.get(id);
    return definition ? cloneSummary(this.#cachedSummary(definition)) : null;
  }

  list(): ModelResourceSummary[] {
    return this.discover();
  }

  categories(): string[] {
    const cats = new Set<string>();
    for (const definition of this.#definitions.values()) {
      cats.add(definition.category);
    }
    return [...cats].sort((left, right) => left.localeCompare(right));
  }

  byCategory(category: string): ModelResourceSummary[] {
    return this.discover({ category });
  }

  discover(options: ModelDiscoveryOptions = {}): ModelResourceSummary[] {
    const normalizedCategory = options.category?.trim().toLowerCase();
    const query = options.query?.trim().toLowerCase() ?? "";
    const rawTags = options.tags ?? [];
    const requiredTags = rawTags.map((tag) => tag.toLowerCase());

    return [...this.#definitions.values()]
      .map((definition) => cloneSummary(this.#cachedSummary(definition)))
      .filter((resource) => {
        if (normalizedCategory && resource.category.toLowerCase() !== normalizedCategory) {
          return false;
        }
        if (requiredTags.length > 0) {
          const lowerTags = resource.tags.map((tag) => tag.toLowerCase());
          for (const tag of requiredTags) {
            if (!lowerTags.includes(tag)) {
              return false;
            }
          }
        }
        if (!query) {
          return true;
        }
        return (
          resource.id.toLowerCase().includes(query)
          || resource.name.toLowerCase().includes(query)
          || resource.modelName.toLowerCase().includes(query)
          || resource.tags.some((tag) => tag.toLowerCase().includes(query))
          || resource.modelClass.resourceClassName.toLowerCase().includes(query)
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getIfLoaded(id: string): LoadedModelResource | null {
    const loaded = this.#loaded.get(id);
    return loaded ? cloneLoadedResource(loaded) : null;
  }

  async load(id: string): Promise<LoadedModelResource> {
    const cached = this.#loaded.get(id);
    if (cached) {
      return cloneLoadedResource(cached);
    }

    const inflight = this.#pending.get(id);
    if (inflight) {
      return cloneLoadedResource(await inflight);
    }

    const definition = this.#definitions.get(id);
    if (!definition) {
      throw new Error(`Unknown model resource '${id}'`);
    }

    const summary = cloneSummary(this.#cachedSummary(definition));
    const promise = (async () => {
      const loaded = definition.loader ? await definition.loader(summary) : {};
      const geometry = loaded.geometry ?? definition.geometry;
      if (!geometry) {
        throw new Error(`Model resource '${id}' does not define geometry data`);
      }
      const normalizedGeometry: ModelGeometryData = {
        ...cloneGeometry(geometry),
        bounds: computeBoundsFromGeometry(geometry),
      };
      const materialDefinitions = loaded.materials ?? definition.materials ?? [];
      const textures = loaded.textures ?? definition.textures ?? {};
      const classInfo: ModelClassInfoSource = loaded.classInfo ?? definition.classInfo ?? {};
      const resource: LoadedModelResource = {
        ...summary,
        geometry: normalizedGeometry,
        materials: cloneMaterialDefinitions(materialDefinitions),
        textures: cloneTextureRecord(textures),
        thumbnail: loaded.thumbnail
          ? new Uint8Array(loaded.thumbnail)
          : definition.thumbnail
            ? new Uint8Array(definition.thumbnail)
            : null,
        classInfo: normalizeClassInfo(summary.modelClass, normalizedGeometry, classInfo),
      };
      this.#loaded.set(id, resource);
      this.#pending.delete(id);
      return resource;
    })().catch((error) => {
      this.#pending.delete(id);
      throw error;
    });

    this.#pending.set(id, promise);
    return cloneLoadedResource(await promise);
  }

  buildTree(rootName = "Gallery"): ModelBrowserNode {
    const root: {
      id: string;
      name: string;
      kind: "folder";
      children: ModelBrowserNode[];
    } = {
      id: "root",
      name: rootName,
      kind: "folder",
      children: [],
    };

    for (const resource of this.list()) {
      let current = root;
      const folderPath = resource.treePath.length > 0 ? resource.treePath : [resource.category];
      let currentPath = "";
      for (const segment of folderPath) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        let folder = current.children.find(
          (child): child is ModelBrowserNode & { kind: "folder"; children: ModelBrowserNode[] } => child.kind === "folder" && child.name === segment,
        );
        if (!folder) {
          folder = {
            id: `folder:${currentPath}`,
            name: segment,
            kind: "folder",
            children: [],
          };
          current.children.push(folder);
        }
        current = folder;
      }
      current.children.push({
        id: `model:${resource.id}`,
        name: resource.name,
        kind: "model",
        children: [],
        resourceId: resource.id,
        category: resource.category,
        modelClass: { ...resource.modelClass },
      });
    }

    const sortChildren = (node: ModelBrowserNode): ModelBrowserNode => {
      const sortedChildren = [...node.children]
        .map(sortChildren)
        .sort((left, right) => {
          if (left.kind !== right.kind) {
            return left.kind === "folder" ? -1 : 1;
          }
          return left.name.localeCompare(right.name);
        });
      return { ...node, children: sortedChildren };
    };

    return sortChildren(root);
  }

  #cachedSummary(definition: ModelResourceDefinition): ModelResourceSummary {
    const cached = this.#summaryCache.get(definition.id);
    if (cached) return cached;
    const summary = cloneSummary({
      id: definition.id,
      name: definition.name,
      modelName: definition.modelName,
      category: definition.category,
      tags: [...(definition.tags ?? [])],
      treePath: normalizeTreePath(definition),
      modelClass: resolveModelClass(definition.modelClass),
    });
    this.#summaryCache.set(definition.id, summary);
    return summary;
  }
}
