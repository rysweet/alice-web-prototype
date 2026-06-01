import type { Size } from "./story-api/types.js";

export interface GalleryModel {
  id: string;
  name: string;
  className: string;
  category: string;
  tags: string[];
  resourceType: string | null;
  placeOnGround: boolean;
  defaultSize?: Size;
}

export interface GallerySearchOptions {
  category?: string;
  tags?: string[];
}

const DEFAULT_MODELS: GalleryModel[] = [
  {
    id: "people/biped",
    name: "Biped",
    className: "org.lgna.story.SBiped",
    category: "people",
    tags: ["person", "character", "walker"],
    resourceType: null,
    placeOnGround: true,
    defaultSize: { width: 1, height: 1.8, depth: 1 },
  },
  {
    id: "animals/flyer",
    name: "Flyer",
    className: "org.lgna.story.SFlyer",
    category: "animals",
    tags: ["bird", "animal", "flying"],
    resourceType: null,
    placeOnGround: false,
    defaultSize: { width: 1.2, height: 0.8, depth: 1.2 },
  },
  {
    id: "animals/quadruped",
    name: "Quadruped",
    className: "org.lgna.story.SQuadruped",
    category: "animals",
    tags: ["animal", "four-legged", "pet"],
    resourceType: null,
    placeOnGround: true,
    defaultSize: { width: 1.5, height: 1.1, depth: 2 },
  },
  {
    id: "props/prop",
    name: "Prop",
    className: "org.lgna.story.SProp",
    category: "props",
    tags: ["object", "prop", "scenery"],
    resourceType: null,
    placeOnGround: true,
    defaultSize: { width: 1, height: 1, depth: 1 },
  },
  {
    id: "scene/camera",
    name: "Camera",
    className: "org.lgna.story.SCamera",
    category: "scene",
    tags: ["camera", "view", "scene"],
    resourceType: null,
    placeOnGround: false,
  },
  {
    id: "vehicles/transport",
    name: "Transport",
    className: "org.lgna.story.STransport",
    category: "vehicles",
    tags: ["vehicle", "transport", "car", "bus"],
    resourceType: null,
    placeOnGround: true,
    defaultSize: { width: 2, height: 1.5, depth: 4 },
  },
  {
    id: "vr/hand",
    name: "VR Hand",
    className: "org.lgna.story.SVRHand",
    category: "vr",
    tags: ["vr", "hand", "controller"],
    resourceType: null,
    placeOnGround: false,
    defaultSize: { width: 0.15, height: 0.1, depth: 0.2 },
  },
  {
    id: "vr/headset",
    name: "VR Headset",
    className: "org.lgna.story.SVRHeadset",
    category: "vr",
    tags: ["vr", "headset", "hmd"],
    resourceType: null,
    placeOnGround: false,
    defaultSize: { width: 0.2, height: 0.15, depth: 0.25 },
  },
  {
    id: "vr/user",
    name: "VR User",
    className: "org.lgna.story.SVRUser",
    category: "vr",
    tags: ["vr", "user", "player", "avatar"],
    resourceType: null,
    placeOnGround: true,
    defaultSize: { width: 0.5, height: 1.8, depth: 0.5 },
  },
];

export class GalleryCatalog {
  private readonly models = new Map<string, GalleryModel>();

  constructor(seed: GalleryModel[] = DEFAULT_MODELS) {
    for (const model of seed) {
      this.add(model);
    }
  }

  list(): GalleryModel[] {
    return [...this.models.values()].map(cloneModel);
  }

  get(id: string): GalleryModel | null {
    const model = this.models.get(id);
    return model ? cloneModel(model) : null;
  }

  add(model: GalleryModel): void {
    if (!model.id.trim()) {
      throw new TypeError("gallery model id must be a non-empty string");
    }
    if (this.models.has(model.id)) {
      throw new TypeError(`gallery model \"${model.id}\" already exists`);
    }
    if (!model.name.trim()) {
      throw new TypeError("gallery model name must be a non-empty string");
    }
    if (!model.className.trim()) {
      throw new TypeError("gallery model className must be a non-empty string");
    }
    this.models.set(model.id, cloneModel(model));
  }

  remove(id: string): boolean {
    return this.models.delete(id);
  }

  byCategory(category: string): GalleryModel[] {
    return this.search("", { category });
  }

  search(query: string, options: GallerySearchOptions = {}): GalleryModel[] {
    const queryText = query.trim().toLowerCase();
    const requiredTags = new Set((options.tags ?? []).map((tag) => tag.toLowerCase()));
    const category = options.category?.trim().toLowerCase();
    const results: GalleryModel[] = [];

    for (const model of this.models.values()) {
      if (category && model.category.toLowerCase() !== category) {
        continue;
      }
      if (requiredTags.size > 0) {
        const modelTags = new Set(model.tags.map((tag) => tag.toLowerCase()));
        let allMatch = true;
        for (const tag of requiredTags) {
          if (!modelTags.has(tag)) { allMatch = false; break; }
        }
        if (!allMatch) continue;
      }
      if (queryText && !(
        model.id.toLowerCase().includes(queryText) ||
        model.name.toLowerCase().includes(queryText) ||
        model.className.toLowerCase().includes(queryText) ||
        model.tags.some((tag) => tag.toLowerCase().includes(queryText))
      )) {
        continue;
      }
      results.push(cloneModel(model));
    }
    return results;
  }
}

function cloneModel(model: GalleryModel): GalleryModel {
  return {
    ...model,
    tags: [...model.tags],
    ...(model.defaultSize ? { defaultSize: { ...model.defaultSize } } : {}),
  };
}
