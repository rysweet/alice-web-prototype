/**
 * Blender Asset Pipeline — Configuration and script generation for
 * exporting Blender models to glTF format with Alice-compatible joint naming.
 *
 * Generates a Blender Python script that can be run from the command line:
 *   blender --background --python scripts/blender/export-alice-gltf.py -- --output ./assets --format glb
 *
 * The generated script handles:
 * - Applying modifiers before export
 * - Renaming bones to Alice joint naming convention
 * - Exporting as glTF 2.0 or GLB
 * - Batch processing multiple .blend files
 */

import type { BlenderExportConfig, EntityCategory } from "./types.js";

// ── Joint name mapping for Blender ─────────────────────────────────

const BLENDER_TO_ALICE_BIPED: Record<string, string> = {
  "Hips": "ROOT",
  "Pelvis": "PELVIS_LOWER_BODY",
  "Spine": "SPINE_BASE",
  "Spine.001": "SPINE_MIDDLE",
  "Spine.002": "SPINE_UPPER",
  "Neck": "NECK",
  "Head": "HEAD",
  "Jaw": "MOUTH",
  "Eye.L": "LEFT_EYE",
  "Eye.R": "RIGHT_EYE",
  "Clavicle.L": "LEFT_CLAVICLE",
  "UpperArm.L": "LEFT_SHOULDER",
  "LowerArm.L": "LEFT_ELBOW",
  "Hand.L": "LEFT_WRIST",
  "Clavicle.R": "RIGHT_CLAVICLE",
  "UpperArm.R": "RIGHT_SHOULDER",
  "LowerArm.R": "RIGHT_ELBOW",
  "Hand.R": "RIGHT_WRIST",
  "UpperLeg.L": "LEFT_HIP",
  "LowerLeg.L": "LEFT_KNEE",
  "Foot.L": "LEFT_ANKLE",
  "Toe.L": "LEFT_FOOT",
  "UpperLeg.R": "RIGHT_HIP",
  "LowerLeg.R": "RIGHT_KNEE",
  "Foot.R": "RIGHT_ANKLE",
  "Toe.R": "RIGHT_FOOT",
};

export function getBlenderJointMap(category?: EntityCategory): Record<string, string> {
  // Phase 1: biped mapping. Other categories can be added later.
  if (!category || category === "BIPED") {
    return { ...BLENDER_TO_ALICE_BIPED };
  }
  return {};
}

// ── Script generation ──────────────────────────────────────────────

function escapePythonString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\0/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "");
}

export function generateBlenderExportScript(config?: BlenderExportConfig): string {
  const outputDir = config?.outputDir ?? "./assets/gltf";
  const format = config?.format ?? "glb";
  const applyModifiers = config?.applyModifiers ?? true;
  const exportAnimations = config?.exportAnimations ?? false;

  return `#!/usr/bin/env python3
"""
LookingGlass - Blender glTF Export Pipeline

Exports Blender models to glTF/GLB format with Alice-compatible joint naming.
Run from command line:
  blender --background model.blend --python export-alice-gltf.py -- --output ./assets --format glb

Or batch-process a directory:
  for f in models/*.blend; do
    blender --background "$f" --python export-alice-gltf.py -- --output ./assets --format glb
  done

Requirements: Blender 3.0+ (ships with glTF exporter)
"""

import bpy
import sys
import os
import argparse

# ── Configuration ───────────────────────────────────────────────────

OUTPUT_DIR = "${escapePythonString(outputDir)}"
EXPORT_FORMAT = "${format.toUpperCase()}"
APPLY_MODIFIERS = ${applyModifiers ? "True" : "False"}
EXPORT_ANIMATIONS = ${exportAnimations ? "True" : "False"}

# Alice canonical bone name mapping (Blender default → Alice)
BONE_NAME_MAP = {
${Object.entries(BLENDER_TO_ALICE_BIPED).map(([k, v]) => `    "${k}": "${v}",`).join("\n")}
}


def parse_args():
    """Parse command-line arguments after '--' separator."""
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="Export Blender model to Alice-compatible glTF")
    parser.add_argument("--output", default=OUTPUT_DIR, help="Output directory")
    parser.add_argument("--format", default=EXPORT_FORMAT, choices=["GLTF", "GLB"], help="Export format")
    parser.add_argument("--no-rename", action="store_true", help="Skip bone renaming")
    return parser.parse_args(argv)


def rename_bones_to_alice(armature_obj):
    """Rename bones in the armature to Alice joint naming convention."""
    if not armature_obj or armature_obj.type != "ARMATURE":
        return 0

    renamed = 0
    for bone in armature_obj.data.bones:
        if bone.name in BONE_NAME_MAP:
            new_name = BONE_NAME_MAP[bone.name]
            print(f"  Renamed bone: {bone.name} -> {new_name}")
            bone.name = new_name
            renamed += 1

    return renamed


def apply_all_modifiers():
    """Apply all modifiers on mesh objects."""
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            bpy.context.view_layer.objects.active = obj
            # Snapshot modifier names to avoid skipping during iteration
            mod_names = [mod.name for mod in obj.modifiers]
            for mod_name in mod_names:
                try:
                    bpy.ops.object.modifier_apply(modifier=mod_name)
                    print(f"  Applied modifier: {mod_name} on {obj.name}")
                except Exception as e:
                    print(f"  Warning: Could not apply {mod_name}: {e}")


def export_gltf(output_path, export_format):
    """Export the scene as glTF/GLB."""
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format=export_format,
        use_selection=False,
        export_apply=True,
        export_animations=EXPORT_ANIMATIONS,
        export_skins=True,
    )
    print(f"Exported: {output_path}")


def main():
    args = parse_args()
    output_dir = args.output
    export_format = args.format

    blend_name = os.path.splitext(os.path.basename(bpy.data.filepath or "untitled"))[0]
    ext = ".glb" if export_format == "GLB" else ".gltf"
    output_path = os.path.join(output_dir, blend_name + ext)

    print(f"\\n{'=' * 60}")
    print(f"Alice glTF Export Pipeline")
    print(f"  Source: {bpy.data.filepath or 'untitled'}")
    print(f"  Output: {output_path}")
    print(f"  Format: {export_format}")
    print(f"{'=' * 60}\\n")

    # Step 1: Rename bones
    if not args.no_rename:
        for obj in bpy.data.objects:
            if obj.type == "ARMATURE":
                count = rename_bones_to_alice(obj)
                print(f"  Renamed {count} bones in {obj.name}")

    # Step 2: Apply modifiers
    if APPLY_MODIFIERS:
        print("\\nApplying modifiers...")
        apply_all_modifiers()

    # Step 3: Export
    print("\\nExporting...")
    export_gltf(output_path, export_format)

    print(f"\\nDone! Output: {output_path}")


if __name__ == "__main__":
    main()
`;
}

/**
 * Returns documentation on recommended open-source model sources
 * and how to use the Blender pipeline.
 */
export function getAssetSourceGuide(): string {
  return `# Open-Source 3D Asset Sources for LookingGlass

## Recommended Sources (CC0 / CC-BY compatible)

### Character Models (Biped)
- **Mixamo** (mixamo.com): Free rigged humanoid characters with animations.
  Download as FBX, import into Blender, export as glTF using our pipeline.
- **ReadyPlayerMe** (readyplayer.me): Avatar generator, exports as glTF.
- **Quaternius** (quaternius.com): CC0 low-poly character packs.
- **Kenney Assets** (kenney.nl): CC0 game-ready character models.

### Animal Models (Quadruped, Flyer, Swimmer)
- **Quaternius**: CC0 animal packs (quadrupeds, birds, fish).
- **OpenGameArt** (opengameart.org): Community CC0/CC-BY animal models.
- **Poly Pizza** (poly.pizza): Searchable CC0 3D model library.

### Props & Vehicles
- **Kenney Assets**: Extensive CC0 furniture, vehicle, and prop libraries.
- **Quaternius**: CC0 props and vehicles.
- **Sketchfab** (sketchfab.com): Filter by CC0 license for free models.

## Blender Pipeline Usage

### Single Model Export
\`\`\`bash
blender --background model.blend --python scripts/blender/export-alice-gltf.py -- \\
  --output ./assets/gltf --format glb
\`\`\`

### Batch Export
\`\`\`bash
for f in models/*.blend; do
  blender --background "$f" --python scripts/blender/export-alice-gltf.py -- \\
    --output ./assets/gltf --format glb
done
\`\`\`

### Joint Name Mapping
The pipeline automatically renames Blender bones to Alice's canonical naming:
- Hips → ROOT
- Spine → SPINE_BASE
- Head → HEAD
- UpperArm.L → LEFT_SHOULDER
- etc.

Custom mappings can be added to the BONE_NAME_MAP in the export script.

## Integration with Alice Web

After exporting models, register them with the ModelResourceCatalog:

\`\`\`typescript
import { createAllProceduralDefinitions } from "./open-asset-pipeline";
import { ModelResourceCatalog } from "./model-resources";

const catalog = new ModelResourceCatalog();
const definitions = createAllProceduralDefinitions();
for (const def of definitions) {
  catalog.register(def);
}
\`\`\`
`;
}
