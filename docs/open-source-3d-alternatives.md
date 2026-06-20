# Open-Source 3D Alternatives for LookingGlass

> **Issue:** [#86](https://github.com/rysweet/alice-web-prototype/issues/86) —
> Alice 3's desktop client ships proprietary Sims-style 3D character models that
> cannot be redistributed. This document evaluates open-source alternatives for
> the web prototype.

## Executive Summary

Alice's web prototype needs replacement 3D assets for seven entity categories
(Biped, Quadruped, Flyer, Swimmer, Slitherer, Prop, Vehicle). The recommended
approach is:

1. **glTF 2.0** as the primary asset format (Khronos open standard, browser-native)
2. **Blender** as the primary authoring tool (open-source, glTF export built-in)
3. **Procedural placeholders** for immediate development (no external files needed)
4. **CC0-licensed repositories** for production-quality models when available

---

## 1. Open-Source 3D Model Formats

### glTF 2.0 / GLB (Recommended)

| Property | Value |
| --- | --- |
| Full name | GL Transmission Format 2.0 |
| Maintainer | Khronos Group (open standard) |
| Extensions | `.gltf` (JSON + separate binary) or `.glb` (single binary) |
| Features | Meshes, materials (PBR), skeletons, animations, morph targets |
| Browser support | Three.js `GLTFLoader`, Babylon.js, native WebGPU importers |
| License | Apache 2.0 (specification); assets are independently licensed |

**Why glTF:** It is the "JPEG of 3D" — a compact, GPU-friendly transmission
format designed for the web. Three.js (already an Alice dependency) includes a
production-quality loader. The format natively supports skeleton hierarchies
needed for Alice's joint system.

### OBJ / MTL (Fallback)

| Property | Value |
| --- | --- |
| Full name | Wavefront OBJ |
| Features | Static meshes and materials only — no skeletons or animations |
| Use case | Simple props that need no joint hierarchy |

OBJ is widely supported but lacks skeleton data. Suitable only for static props
(chairs, tables). Not recommended for character models.

### FBX (Via Conversion)

| Property | Value |
| --- | --- |
| Full name | Filmbox |
| Maintainer | Autodesk (proprietary format, but widely used) |
| Use case | Import into Blender for conversion to glTF |

Many free character libraries distribute as FBX. The recommended workflow is:
import into Blender → re-rig if needed → export as glTF via our pipeline script
(`scripts/blender/export-alice-gltf.py`).

### Format Recommendation

| Category | Format | Reason |
| --- | --- | --- |
| Characters (Biped, Quadruped, Flyer, Swimmer, Slitherer) | glTF/GLB | Skeleton + animation support required |
| Props | glTF/GLB or OBJ | glTF preferred for consistency; OBJ acceptable for static items |
| Vehicles | glTF/GLB | May need articulated parts (wheels, doors) |

---

## 2. Open-Source 3D Model Creation Tools

### Blender (Primary — Recommended)

| Property | Value |
| --- | --- |
| License | GPL v2+ |
| URL | <https://www.blender.org> |
| Version required | 3.0+ (built-in glTF 2.0 exporter) |
| Capabilities | Full modeling, rigging, animation, UV mapping, sculpting |
| Alice integration | `scripts/blender/export-alice-gltf.py` handles bone renaming and export |

Blender is the recommended tool for all asset creation and conversion. Our
export script automatically remaps Blender bone names to Alice's canonical joint
naming convention (e.g., `UpperArm.L` → `LEFT_SHOULDER`).

**Workflow:**
1. Model or import character in Blender
2. Rig with armature matching Blender's standard bone names
3. Run `blender --background model.blend --python scripts/blender/export-alice-gltf.py`
4. Output: Alice-compatible `.glb` file

### MakeHuman (Humanoid Characters)

| Property | Value |
| --- | --- |
| License | AGPL v3 (tool) / CC0 (generated models) |
| URL | <http://www.makehumancommunity.org> |
| Output | FBX, OBJ, Collada → convert to glTF via Blender |
| Capabilities | Parametric human body generation with customizable proportions |

MakeHuman generates realistic humanoid base meshes with full skeletons. Models
can be exported to Blender for final rigging adjustments and glTF export. The
generated meshes are CC0-licensed.

**Best for:** Biped category — generating diverse humanoid base bodies quickly.

### Mixamo (Animation Retargeting)

| Property | Value |
| --- | --- |
| License | Free for commercial use (Adobe account required) |
| URL | <https://www.mixamo.com> |
| Output | FBX (with auto-rigging and animation) |
| Capabilities | Auto-rigging, 2500+ animation library, character uploads |

Mixamo can auto-rig uploaded meshes and attach animations from its library.
The `gltf-loader.ts` module includes a complete Mixamo-to-Alice joint name
mapping (`mixamorigHips` → `ROOT`, etc.).

**Workflow:**
1. Upload mesh to Mixamo → auto-rig
2. Download as FBX with desired animations
3. Import to Blender → export via our pipeline
4. Load in Alice using `importGltfData()` with default joint map

**Limitation:** Mixamo is free but not open-source. Generated rigs use
Mixamo's naming convention, which our pipeline handles.

---

## 3. Open-Source Model Repositories

### CC0 (Public Domain) Sources

| Repository | URL | Content | License | Alice Categories |
| --- | --- | --- | --- | --- |
| **Kenney Assets** | <https://kenney.nl/assets> | 40,000+ game assets: characters, animals, vehicles, props | CC0 1.0 | All categories |
| **Quaternius** | <https://quaternius.com> | Low-poly character packs, animals, props | CC0 1.0 | Biped, Quadruped, Flyer, Prop |
| **Poly Pizza** | <https://poly.pizza> | Curated CC0 3D model search engine | CC0 1.0 | All categories |
| **OpenGameArt** | <https://opengameart.org> | Community-contributed game art | CC0, CC-BY (varies) | All categories |
| **Kay Lousberg** | <https://kaylousberg.com> | Stylized low-poly character packs | CC0 1.0 | Biped, Quadruped |

### CC-BY (Attribution Required) Sources

| Repository | URL | Content | License | Notes |
| --- | --- | --- | --- | --- |
| **Sketchfab** | <https://sketchfab.com> | 500,000+ downloadable models | CC-BY (filter) | Filter by license; many CC0 also available |
| **TurboSquid** | <https://turbosquid.com> | Professional models with free tier | Various | Check individual licenses carefully |

### Evaluated Model Packs for Alice

| Pack | Source | Category | Joint Compatibility | Quality | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Kenney Character Pack | kenney.nl | Biped | Requires remapping | Good (low-poly) | ✅ Use with Blender pipeline |
| Kenney Animal Pack | kenney.nl | Quadruped | Requires remapping | Good (low-poly) | ✅ Use with Blender pipeline |
| Quaternius Ultimate Characters | quaternius.com | Biped | Requires remapping | Good (stylized) | ✅ Good variety |
| Quaternius Animals | quaternius.com | Quadruped, Flyer | Requires remapping | Good (stylized) | ✅ Good variety |
| Kenney Furniture Kit | kenney.nl | Prop | N/A (static) | Excellent | ✅ Direct use |
| Kenney Vehicle Kit | kenney.nl | Vehicle | Minimal rigging | Good | ✅ Direct use |

---

## 4. Procedural Generation Approaches

The `open-asset-pipeline` module includes procedural geometry generators
(`procedural-generators.ts`) that create recognizable placeholder shapes for
all seven entity categories without requiring any external model files.

### Implementation Summary

| Category | Geometry | Scale | Joint Count |
| --- | --- | --- | --- |
| Biped | Capsule torso, sphere head, cylinder limbs | 1.7m tall | 46 joints |
| Quadruped | Elongated body, four cylinder legs, sphere head | 1.0m × 0.6m | 35 joints |
| Flyer | Ellipsoid body, flat wing planes, tail | 0.4m wingspan | 30 joints |
| Swimmer | Elongated ellipsoid body, fin planes | 0.8m long | 15 joints |
| Slitherer | Series of connected segments | 1.2m long | 12 joints |
| Prop | Box with optional detail shapes | 0.5m cube | 1 joint (ROOT) |
| Vehicle | Box body with cylinder wheels | 2.0m × 1.0m | 5 joints |

### Advantages

- **Zero dependencies** — no model files to download or host
- **Correct joint hierarchies** — skeleton metadata matches Alice's canonical
  definitions exactly (from `story-resources.ts`)
- **Instant availability** — generated synchronously at registration time
- **Consistent style** — all categories use the same geometric vocabulary

### Limitations

- Visual quality is basic (primitive shapes only)
- No textures or UV-mapped surfaces
- Not suitable for final production use — intended as development placeholders

### Upgrade Path

The `ModelProvider` interface supports seamless replacement:

```typescript
// Start with procedural
const defs = createAllProceduralDefinitions();

// Later, swap in glTF models per category
const defs = createModelDefinitions({
  sources: [
    { type: "gltf", category: "BIPED", url: "/models/character.glb", license: CC0_LICENSE },
  ],
  fallbackToProcedural: true, // other categories still use procedural
});
```

---

## 5. Compatibility Analysis

### Joint Name Mapping

Alice uses a canonical UPPER_SNAKE_CASE joint naming convention (e.g.,
`LEFT_SHOULDER`, `RIGHT_KNEE`). External models use different conventions:

| Source Convention | Example | Mapping Strategy |
| --- | --- | --- |
| Blender default | `UpperArm.L` | `blender-pipeline.ts` BONE_NAME_MAP |
| Mixamo | `mixamorigLeftArm` | `gltf-loader.ts` DEFAULT_GLTF_TO_ALICE_JOINT_MAP |
| Generic glTF | `LeftArm` / `Left_Arm` | `mapJointName()` with PascalCase→UPPER_SNAKE fallback |
| Custom | Varies | User-provided `jointNameMap` in `GltfImportOptions` |

### Skeleton Hierarchy Requirements

Each Alice entity category defines a specific joint hierarchy tree. Imported
models must provide joints that map to at least the core skeleton:

- **Biped:** ROOT → PELVIS → SPINE → NECK → HEAD; LEFT/RIGHT arms and legs
- **Quadruped:** ROOT → SPINE → NECK → HEAD; FRONT/BACK LEFT/RIGHT legs + TAIL
- **Flyer:** ROOT → BODY → NECK → HEAD; LEFT/RIGHT wings + TAIL
- **Swimmer:** ROOT → BODY → HEAD; DORSAL/PECTORAL/CAUDAL fins
- **Slitherer:** ROOT → linked spine segments + HEAD

Missing joints are tolerated — the procedural generator fills canonical joints
that the imported model lacks.

### License Compatibility

| License | Commercial Use | Redistribution | Attribution Required | Compatible |
| --- | --- | --- | --- | --- |
| CC0 1.0 | ✅ | ✅ | ❌ | ✅ Preferred |
| CC-BY 4.0 | ✅ | ✅ | ✅ | ✅ With attribution |
| CC-BY-SA 4.0 | ✅ | ✅ (share-alike) | ✅ | ⚠️ May affect project license |
| CC-BY-NC | ❌ | ❌ | ✅ | ❌ Not compatible |
| MIT | ✅ | ✅ | ✅ (minimal) | ✅ |
| GPL | ✅ | ✅ (copyleft) | ✅ | ⚠️ Copyleft implications |

**Recommendation:** Prefer CC0 models. CC-BY is acceptable with proper
attribution in the `AssetLicense` metadata. Avoid CC-BY-NC and CC-BY-SA.

---

## 6. Recommendations

### Immediate (Current Implementation)

1. ✅ **Procedural placeholders** — Already implemented in
   `procedural-generators.ts`. Covers all 7 categories with correct joint
   hierarchies.
2. ✅ **glTF loader** — Already implemented in `gltf-loader.ts`. Supports
   Mixamo and Blender bone name mapping.
3. ✅ **Blender export script** — Already in
   `scripts/blender/export-alice-gltf.py`. Ready for production use.

### Short-Term (Next Sprint)

4. Download and convert Kenney character pack (Biped) via Blender pipeline
5. Download and convert Quaternius animal pack (Quadruped, Flyer)
6. Add Kenney furniture/prop models directly (static, no rigging needed)
7. Add CC0 vehicle models from Kenney vehicle kit

### Medium-Term (Future Sprints)

8. Generate MakeHuman base meshes for diverse humanoid characters
9. Add Mixamo animations to imported character models
10. Implement runtime glTF loading from CDN (currently only bundled/procedural)
11. Build model preview thumbnails for gallery browser

### Long-Term

12. Community model contribution pipeline (upload .blend → auto-convert → PR)
13. Procedural texture generation for placeholder models
14. LOD (level of detail) system for performance on mobile browsers

---

## References

- [glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [Three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [Blender glTF Exporter](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)
- [Kenney Assets](https://kenney.nl/assets)
- [Quaternius](https://quaternius.com)
- [MakeHuman Community](http://www.makehumancommunity.org)
- [Mixamo](https://www.mixamo.com)
- [Creative Commons License Types](https://creativecommons.org/licenses/)
