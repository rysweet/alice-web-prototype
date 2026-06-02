/**
 * Open-Source Model Provider — Pluggable model source that produces
 * ModelResourceDefinition[] for registration with ModelResourceCatalog.
 *
 * Uses lazy loaders: geometry is only generated when load() is called.
 * Falls back to procedural placeholders when no external asset is available.
 */

import type { ModelResourceDefinition, KnownModelClassKey } from "../model-resources/definitions.js";
import { MODEL_CLASS_DATA } from "../model-resources/definitions.js";
import type { ModelProviderOptions, ModelProviderSource, EntityCategory, AssetLicense } from "./types.js";
import { PROCEDURAL_LICENSE } from "./types.js";
import { generateProceduralModel, getCanonicalJoints } from "./procedural-generators.js";
import {
  BipedResource,
  FlyerResource,
  QuadrupedResource,
  SwimmerResource,
  FishResource,
  MarineMammalResource,
  SlithererResource,
  PropResource,
  AutomobileResource,
  AircraftResource,
  WatercraftResource,
  TrainResource,
} from "../model-resources/individual-resources.js";
import type { IndividualModelResource } from "../model-resources/individual-resources.js";

// ── Category → ModelClass mapping ──────────────────────────────────

const CATEGORY_TO_MODEL_CLASS: Record<EntityCategory, KnownModelClassKey> = {
  BIPED: "BIPED",
  QUADRUPED: "QUADRUPED",
  FLYER: "FLYER",
  SWIMMER: "SWIMMER",
  SLITHERER: "SLITHERER",
  PROP: "PROP",
  VEHICLE: "AUTOMOBILE",
};

// ── Resource catalog entries for each category ─────────────────────

const CATEGORY_RESOURCES: Record<EntityCategory, Readonly<Record<string, IndividualModelResource>>> = {
  BIPED: BipedResource,
  QUADRUPED: QuadrupedResource,
  FLYER: FlyerResource,
  SWIMMER: SwimmerResource,
  SLITHERER: SlithererResource,
  PROP: PropResource,
  VEHICLE: AutomobileResource,
};

// ── Sub-model-class mappings (share parent category joints/colors) ──

interface SubModelClassEntry {
  readonly modelClass: KnownModelClassKey;
  readonly parentCategory: EntityCategory;
  readonly resources: Readonly<Record<string, IndividualModelResource>>;
}

const SUB_MODEL_CLASS_ENTRIES: readonly SubModelClassEntry[] = [
  { modelClass: "FISH", parentCategory: "SWIMMER", resources: FishResource },
  { modelClass: "MARINE_MAMMAL", parentCategory: "SWIMMER", resources: MarineMammalResource },
  { modelClass: "AIRCRAFT", parentCategory: "VEHICLE", resources: AircraftResource },
  { modelClass: "WATERCRAFT", parentCategory: "VEHICLE", resources: WatercraftResource },
  { modelClass: "TRAIN", parentCategory: "VEHICLE", resources: TrainResource },
];

// ── Color palette for procedural models ────────────────────────────

const CATEGORY_COLORS: Record<EntityCategory, number> = {
  BIPED: 0x8CA6D9,
  QUADRUPED: 0xB8946B,
  FLYER: 0xD9BF66,
  SWIMMER: 0x66B3D9,
  SLITHERER: 0x80BF73,
  PROP: 0xA6A6A6,
  VEHICLE: 0xBF5959,
};

// ── Definition builders ────────────────────────────────────────────

function buildProceduralDefinition(
  resource: IndividualModelResource,
  category: EntityCategory,
  license: AssetLicense,
): ModelResourceDefinition {
  const modelClass = CATEGORY_TO_MODEL_CLASS[category];
  const color = CATEGORY_COLORS[category];

  return {
    id: `open-source/${category.toLowerCase()}/${resource.id}`,
    name: resource.name,
    modelName: resource.modelName,
    category: MODEL_CLASS_DATA[modelClass].category,
    modelClass,
    tags: ["open-source", "procedural", license.spdxId],
    treePath: ["Open Source", category, resource.name],
    classInfo: {
      joints: [...getCanonicalJoints(category)],
    },
    loader: () => {
      const result = generateProceduralModel({
        category,
        id: resource.id,
        name: resource.name,
        modelName: resource.modelName,
        color,
      });
      return {
        geometry: result.geometry,
        materials: result.materials,
        classInfo: { joints: result.joints },
      };
    },
  };
}

function buildSubModelClassDefinition(
  resource: IndividualModelResource,
  entry: SubModelClassEntry,
  license: AssetLicense,
): ModelResourceDefinition {
  const { modelClass, parentCategory } = entry;
  const color = CATEGORY_COLORS[parentCategory];
  const classLabel = modelClass.toLowerCase().replace(/_/g, "-");

  return {
    id: `open-source/${classLabel}/${resource.id}`,
    name: resource.name,
    modelName: resource.modelName,
    category: MODEL_CLASS_DATA[modelClass].category,
    modelClass,
    tags: ["open-source", "procedural", license.spdxId],
    treePath: ["Open Source", modelClass, resource.name],
    classInfo: {
      joints: [...getCanonicalJoints(parentCategory)],
    },
    loader: () => {
      const result = generateProceduralModel({
        category: parentCategory,
        id: resource.id,
        name: resource.name,
        modelName: resource.modelName,
        color,
      });
      return {
        geometry: result.geometry,
        materials: result.materials,
        classInfo: { joints: result.joints },
      };
    },
  };
}

// ── Source → Definition conversion ─────────────────────────────────

function buildSourceDefinition(
  source: ModelProviderSource,
  index: number,
): ModelResourceDefinition {
  const category = source.category;
  const modelClass = CATEGORY_TO_MODEL_CLASS[category];
  const categoryData = MODEL_CLASS_DATA[modelClass];

  switch (source.type) {
    case "procedural": {
      const config = source.proceduralConfig;
      if (config) {
        return {
          id: `source/${category.toLowerCase()}/${config.id.toLowerCase()}`,
          name: config.name,
          modelName: config.modelName,
          category: categoryData.category,
          modelClass,
          tags: ["open-source", "procedural", source.license.spdxId],
          treePath: ["Open Source", category, config.name],
          classInfo: { joints: [...getCanonicalJoints(category)] },
          loader: () => {
            const result = generateProceduralModel(config);
            return {
              geometry: result.geometry,
              materials: result.materials,
              classInfo: { joints: result.joints },
            };
          },
        };
      }
      // No config — use first known resource as a fallback
      const firstResource = Object.values(CATEGORY_RESOURCES[category])[0];
      if (firstResource) {
        return buildProceduralDefinition(firstResource, category, source.license);
      }
      // Defensive fallback: no config and no known resources for this category
      return {
        id: `source/${category.toLowerCase()}/procedural-${index}`,
        name: `${category} (procedural)`,
        modelName: category,
        category: categoryData.category,
        modelClass,
        tags: ["open-source", "procedural", source.license.spdxId],
        treePath: ["Open Source", category, `Procedural ${index}`],
        classInfo: { joints: [...getCanonicalJoints(category)] },
        loader: () => {
          const result = generateProceduralModel({
            category,
            id: `procedural-${index}`,
            name: `${category} (procedural)`,
            modelName: category,
          });
          return {
            geometry: result.geometry,
            materials: result.materials,
            classInfo: { joints: result.joints },
          };
        },
      };
    }
    case "gltf": {
      const url = source.gltfOptions?.url ?? source.url ?? `gltf-${index}`;
      const basename = url.split("/").pop()?.replace(/\.[^.]+$/, "") ?? `gltf-${index}`;
      return {
        id: `source/${category.toLowerCase()}/gltf/${basename}`,
        name: basename,
        modelName: basename,
        category: categoryData.category,
        modelClass,
        tags: ["open-source", "gltf", source.license.spdxId],
        treePath: ["Open Source", category, basename],
        classInfo: { joints: [...getCanonicalJoints(category)] },
      };
    }
    case "url": {
      const url = source.url ?? `url-${index}`;
      const basename = url.split("/").pop()?.replace(/\.[^.]+$/, "") ?? `url-${index}`;
      return {
        id: `source/${category.toLowerCase()}/url/${basename}`,
        name: basename,
        modelName: basename,
        category: categoryData.category,
        modelClass,
        tags: ["open-source", "external", source.license.spdxId],
        treePath: ["Open Source", category, basename],
      };
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Creates procedural model definitions for all known resources in a category.
 */
export function createProceduralDefinitions(
  category: EntityCategory,
  license: AssetLicense = PROCEDURAL_LICENSE,
): ModelResourceDefinition[] {
  const resources = CATEGORY_RESOURCES[category];
  return Object.values(resources).map(r => buildProceduralDefinition(r, category, license));
}

/**
 * Creates procedural model definitions for ALL categories plus sub-model-classes
 * (FISH, MARINE_MAMMAL, AIRCRAFT, WATERCRAFT, TRAIN), providing a complete set
 * of open-source replacement models.
 */
export function createAllProceduralDefinitions(): ModelResourceDefinition[] {
  const categories: EntityCategory[] = [
    "BIPED", "QUADRUPED", "FLYER", "SWIMMER", "SLITHERER", "PROP", "VEHICLE",
  ];
  const defs = categories.flatMap(cat => createProceduralDefinitions(cat));

  // Add sub-model-class definitions (FISH, MARINE_MAMMAL, vehicle subtypes)
  for (const entry of SUB_MODEL_CLASS_ENTRIES) {
    for (const resource of Object.values(entry.resources)) {
      defs.push(buildSubModelClassDefinition(resource, entry, PROCEDURAL_LICENSE));
    }
  }

  return defs;
}

/**
 * Creates model definitions from the given provider options,
 * falling back to procedural generation for any missing sources.
 */
export function createModelDefinitions(options: ModelProviderOptions = {}): ModelResourceDefinition[] {
  const fallback = options.fallbackToProcedural ?? true;
  const sourcesByCategory = new Map<EntityCategory, ModelProviderSource[]>();

  for (const source of options.sources ?? []) {
    const list = sourcesByCategory.get(source.category) ?? [];
    list.push(source);
    sourcesByCategory.set(source.category, list);
  }

  const definitions: ModelResourceDefinition[] = [];

  if (fallback) {
    const allCategories: EntityCategory[] = [
      "BIPED", "QUADRUPED", "FLYER", "SWIMMER", "SLITHERER", "PROP", "VEHICLE",
    ];
    for (const cat of allCategories) {
      if (!sourcesByCategory.has(cat)) {
        definitions.push(...createProceduralDefinitions(cat));
      }
    }
    // Include sub-model-class definitions for categories without provided sources
    for (const entry of SUB_MODEL_CLASS_ENTRIES) {
      if (!sourcesByCategory.has(entry.parentCategory)) {
        for (const resource of Object.values(entry.resources)) {
          definitions.push(buildSubModelClassDefinition(resource, entry, PROCEDURAL_LICENSE));
        }
      }
    }
  }

  // Convert provided sources into definitions
  for (const [, sources] of sourcesByCategory) {
    for (let i = 0; i < sources.length; i++) {
      definitions.push(buildSourceDefinition(sources[i]!, i));
    }
  }

  return definitions;
}

/**
 * Returns summary statistics about what the open-source pipeline provides.
 */
export function getOpenSourcePipelineSummary(): {
  totalDefinitions: number;
  byCategory: Record<string, number>;
  license: string;
} {
  const allDefs = createAllProceduralDefinitions();
  const byCategory: Record<string, number> = {};
  for (const def of allDefs) {
    byCategory[def.category] = (byCategory[def.category] ?? 0) + 1;
  }
  return {
    totalDefinitions: allDefs.length,
    byCategory,
    license: PROCEDURAL_LICENSE.spdxId,
  };
}
