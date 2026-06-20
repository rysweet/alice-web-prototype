#!/usr/bin/env python3
"""
LookingGlass — Blender glTF Export Pipeline

Exports Blender models to glTF/GLB format with Alice-compatible joint naming.
Run from command line:
  blender --background model.blend --python export-alice-gltf.py -- --output ./assets --format glb

Or batch-process a directory:
  for f in models/*.blend; do
    blender --background "$f" --python export-alice-gltf.py -- --output ./assets --format glb
  done

Requirements: Blender 3.0+ (ships with glTF exporter)
License: MIT
"""

import sys
import os
import argparse

# Defer bpy import so the script can be syntax-checked outside Blender
try:
    import bpy  # type: ignore[import-not-found]
except ImportError:
    bpy = None

# ── Configuration ───────────────────────────────────────────────────

OUTPUT_DIR = "./assets/gltf"
EXPORT_FORMAT = "GLB"
APPLY_MODIFIERS = True
EXPORT_ANIMATIONS = False

# Alice canonical bone name mapping (Blender default → Alice)
BONE_NAME_MAP = {
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
}


def parse_args():
    """Parse command-line arguments after '--' separator."""
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(
        description="Export Blender model to Alice-compatible glTF"
    )
    parser.add_argument("--output", default=OUTPUT_DIR, help="Output directory")
    parser.add_argument(
        "--format", default=EXPORT_FORMAT,
        choices=["GLTF", "GLB"],
        help="Export format"
    )
    parser.add_argument(
        "--no-rename", action="store_true",
        help="Skip bone renaming"
    )
    parser.add_argument(
        "--allow-modifier-failures", action="store_true",
        help=(
            "Continue exporting even if one or more modifiers fail to apply "
            "(default: abort export)"
        )
    )
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
    """Apply all modifiers on mesh objects.

    Returns:
        A list of modifier failures as (object name, modifier name, error) tuples.
    """
    failures = []
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
                    failures.append((obj.name, mod_name, str(e)))
                    print(f"  Error: Could not apply {mod_name} on {obj.name}: {e}")
    return failures


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
    if bpy is None:
        print("Error: This script must be run inside Blender.")
        print("Usage: blender --background model.blend --python export-alice-gltf.py")
        sys.exit(1)

    args = parse_args()
    output_dir = args.output
    export_format = args.format

    blend_name = os.path.splitext(
        os.path.basename(bpy.data.filepath or "untitled")
    )[0]
    ext = ".glb" if export_format == "GLB" else ".gltf"
    output_path = os.path.join(output_dir, blend_name + ext)

    print(f"\n{'=' * 60}")
    print("Alice glTF Export Pipeline")
    print(f"  Source: {bpy.data.filepath or 'untitled'}")
    print(f"  Output: {output_path}")
    print(f"  Format: {export_format}")
    print(f"{'=' * 60}\n")

    # Step 1: Rename bones
    if not args.no_rename:
        for obj in bpy.data.objects:
            if obj.type == "ARMATURE":
                count = rename_bones_to_alice(obj)
                print(f"  Renamed {count} bones in {obj.name}")

    # Step 2: Apply modifiers
    if APPLY_MODIFIERS:
        print("\nApplying modifiers...")
        modifier_failures = apply_all_modifiers()
        if modifier_failures:
            print("\nModifier application failed:")
            for obj_name, mod_name, error in modifier_failures:
                print(f"  - {obj_name}.{mod_name}: {error}")
            if not args.allow_modifier_failures:
                print(
                    "\nAborting export because modifiers failed to apply. "
                    "Pass --allow-modifier-failures to export anyway."
                )
                sys.exit(1)
            print(
                "\nContinuing despite modifier failures because "
                "--allow-modifier-failures was set."
            )

    # Step 3: Export
    print("\nExporting...")
    export_gltf(output_path, export_format)

    print(f"\nDone! Output: {output_path}")


if __name__ == "__main__":
    main()
