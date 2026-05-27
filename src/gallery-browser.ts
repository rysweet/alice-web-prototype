export interface GalleryItemInit {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail?: string;
  tags?: string[];
}

export interface GallerySearchOptions {
  category?: string;
  tags?: string[];
}

export interface ImportedGalleryItem {
  itemId: string;
  sceneName: string;
}

export class GalleryItem {
  readonly tags: string[];
  readonly thumbnail: string;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly category: string,
    thumbnail = "",
    tags: string[] = [],
  ) {
    this.thumbnail = thumbnail;
    this.tags = [...tags];
  }

  matches(query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return [this.id, this.name, this.description, this.category, ...this.tags]
      .some((value) => value.toLowerCase().includes(needle));
  }

  toPreview(): string {
    return `${this.name}: ${this.description}`;
  }
}

export class GalleryCategory {
  private readonly items = new Map<string, GalleryItem>();

  constructor(
    public readonly id: string,
    public readonly label: string,
    items: GalleryItem[] = [],
  ) {
    for (const item of items) {
      this.add(item);
    }
  }

  add(item: GalleryItem): void {
    if (item.category !== this.id) {
      throw new TypeError(`gallery item "${item.id}" belongs to ${item.category}, not ${this.id}`);
    }
    this.items.set(item.id, item);
  }

  list(): GalleryItem[] {
    return [...this.items.values()];
  }

  search(query: string): GalleryItem[] {
    return this.list().filter((item) => item.matches(query));
  }
}

export class GallerySearch {
  constructor(private readonly categories: GalleryCategory[]) {}

  find(query: string, options: GallerySearchOptions = {}): GalleryItem[] {
    const requiredTags = new Set((options.tags ?? []).map((tag) => tag.toLowerCase()));
    const requestedCategory = options.category?.trim().toLowerCase();

    return this.categories
      .flatMap((category) => category.list())
      .filter((item) => {
        if (requestedCategory && item.category.toLowerCase() !== requestedCategory) {
          return false;
        }
        if (!item.matches(query)) {
          return false;
        }
        return [...requiredTags].every((tag) => item.tags.some((candidate) => candidate.toLowerCase() === tag));
      });
  }
}

export class GalleryImporter {
  private readonly imported: ImportedGalleryItem[] = [];

  constructor(private readonly importFn: (item: GalleryItem) => ImportedGalleryItem) {}

  import(item: GalleryItem): ImportedGalleryItem {
    const result = this.importFn(item);
    this.imported.push(result);
    return result;
  }

  history(): ImportedGalleryItem[] {
    return [...this.imported];
  }
}

export class GalleryThumbnail {
  private readonly cache = new Map<string, string>();

  constructor(private readonly render: (item: GalleryItem) => string = defaultThumbnailRenderer) {}

  get(item: GalleryItem): string {
    let cached = this.cache.get(item.id);
    if (!cached) {
      cached = this.render(item);
      this.cache.set(item.id, cached);
    }
    return cached;
  }

  invalidate(itemId: string): void {
    this.cache.delete(itemId);
  }
}

export class ClassGallery {
  private readonly classes = new Map<string, GalleryItem>();

  register(definition: GalleryItem | GalleryItemInit): GalleryItem {
    const item = definition instanceof GalleryItem
      ? definition
      : new GalleryItem(
          definition.id,
          definition.name,
          definition.description,
          definition.category,
          definition.thumbnail ?? "",
          definition.tags ?? [],
        );
    this.classes.set(item.id, item);
    return item;
  }

  browse(query = ""): GalleryItem[] {
    return [...this.classes.values()].filter((item) => item.matches(query));
  }
}

function defaultThumbnailRenderer(item: GalleryItem): string {
  return `thumbnail:${item.id}:${item.name.toLowerCase()}`;
}
