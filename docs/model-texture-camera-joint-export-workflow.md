---
title: Model, texture, camera, joint, and export workflow
description: Browser workflow contract for importing Alice assets, framing scenes, managing joints, and exporting shareable packages.
last_updated: 2026-06-21
review_schedule: quarterly
doc_type: reference
---

# Model, texture, camera, joint, and export workflow

This document describes the Alice browser workflow for importing a model,
attaching texture resources, saving camera state, managing joints, and exporting
or sharing the finished project.

The package identity remains **`alice-web`**. The current `package.json` package
name is `alice-web`, and the public TypeScript boundary is `src/index.ts`.
Consumers should use the namespace exports from that barrel. Any future
`package.json` `exports` entry must keep `alice-web` as the package name and
route the root package export through the same public barrel contract.

## Contents

- [User workflow](#user-workflow)
- [Supported files](#supported-files)
- [Validation behavior](#validation-behavior)
- [Public TypeScript API](#public-typescript-api)
- [Data included in exports](#data-included-in-exports)
- [Server route compatibility](#server-route-compatibility)
- [Related docs](#related-docs)

## User workflow

The browser workflow is:

1. Import an Alice project or model asset.
2. Import one or more image resources for textures.
3. Assign texture resources to the selected model where the model supports
   material texture assignment.
4. Frame the scene with the camera controls.
5. Save optional camera markers for repeatable views.
6. Register or edit joints for jointed objects.
7. Export an `.a3p` project archive or an `alice-web` web package.
8. Optionally create share metadata from the validated web package.

Each step must either update the active project state or fail visibly with a
specific validation error. Invalid files, invalid camera state, unknown joints,
and invalid package data must not partially mutate the project.

## Supported files

| Asset | Supported by this workflow | Notes |
| --- | --- | --- |
| Alice project | `.a3p` | Full project archive handled by `ProjectIo.readProject()` and `ProjectIo.writeProject()`. |
| Authored model import | `.glb`, `.gltf` | Uses the open asset pipeline conversion path. `.fbx` and `.obj` should be converted to glTF/GLB before browser import. |
| Project model resources | `.a3r`, `.a3t`, `.dae`, `.fbx`, `.glb`, `.gltf`, `.obj`, `.ply`, `.stl` | Project IO can classify these as model resources in an existing archive. Browser import and runtime loading support `.glb` and `.gltf`. |
| Texture/image resources | `.png`, `.jpg`, `.jpeg`, `.webp` | Imported as image resources. Material texture assignment uses browser-decodable raster formats supported by the import helper. |

Unsupported extensions are rejected before the active project changes.

## Validation behavior

| Area | Required behavior |
| --- | --- |
| Archive import | Reject unreadable ZIP data, unsafe paths, missing project XML, invalid manifests, XML parse failures, and archive size limit violations using `ProjectIoError` codes. |
| Resource paths | Store imported resources under archive-relative POSIX paths such as `resources/models/robot.glb` or `resources/textures/robot.png`; reject traversal, absolute paths, backslashes, Windows drive paths, and UNC paths. |
| Model import | Require a supported model extension and non-empty bytes. glTF/GLB conversion must surface parse, geometry, and joint mapping errors instead of falling back to fake geometry. |
| Texture import | Require a supported image extension and non-empty bytes. Failed browser image decode should block assignment while still leaving the project unchanged. |
| Camera state | Use `CameraWorkflow.validateCameraWorkflowState()`. Camera vectors and deltas must be finite numbers; pitch is clamped to `-89` through `89`; field of view must stay within `1` through `120`; orbit distance must stay at or above `1`. |
| Joint state | `JointSystem.JointStateStore` requires at least one joint per registered object, rejects duplicate joints, rejects empty poses, and throws `UnknownJointError` or `UnknownJointArrayError` for invalid mutations. |
| Export/share | Validate generated web packages with `ProjectExport.validateWebPackage()` before sharing. Invalid base64, unreadable ZIPs, missing required files, unsafe paths, broken Alice identity, and non-playable entrypoints must produce validation errors. |

## Public TypeScript API

Use the public namespace exports from `alice-web`. Do not document or build
against conceptual helpers such as `createCameraWorkflow()`,
`importProjectAssets()`, `exportProject()`, or `createJointSystem()` unless those
helpers are added to `src/index.ts`.

```typescript
import {
  CameraWorkflow,
  JointSystem,
  ProjectExport,
  ProjectIo,
} from "alice-web";
```

### Import project and attach resources

```typescript
import { ProjectIo } from "alice-web";

const archive = await ProjectIo.readProject(await projectFile.arrayBuffer());

const modelBytes = new Uint8Array(await modelFile.arrayBuffer());
const textureBytes = new Uint8Array(await textureFile.arrayBuffer());

archive.resources.set("resources/models/robot.glb", modelBytes);
archive.resources.set("resources/textures/robot.png", textureBytes);
archive.project.textureRefs = [
  ...(archive.project.textureRefs ?? []),
  "resources/textures/robot.png",
];

const savedProjectBytes = await ProjectIo.writeProject(archive);
console.log(savedProjectBytes.byteLength);
```

`ProjectIo.readProject()` and `ProjectIo.writeProject()` own `.a3p` archive
round-tripping. Browser and server workflows call these APIs instead of
duplicating ZIP, XML, manifest, thumbnail, or resource-path handling.

### Save camera state

```typescript
import { CameraWorkflow } from "alice-web";

let cameraState = CameraWorkflow.createDefaultCameraWorkflowState();

cameraState = CameraWorkflow.applyCameraPreset(cameraState, "isometric");
cameraState = CameraWorkflow.focusCamera(cameraState, {
  target: { x: 0, y: 1, z: 0 },
  distance: 8,
});
cameraState = CameraWorkflow.saveCameraMarker(cameraState, {
  name: "Export view",
});

const validatedCameraState =
  CameraWorkflow.validateCameraWorkflowState(cameraState);
console.log(validatedCameraState.markers.map((marker) => marker.name));
```

Project state persists `CameraWorkflow.CameraWorkflowState` with the exported
project so reopening the project restores the same position, target, mode, field
of view, active preset, and marker list.

### Manage joints

```typescript
import { JointSystem } from "alice-web";

const jointState = new JointSystem.JointStateStore();

jointState.registerObject({
  objectName: "robotArm",
  className: "org.lgna.story.SProp",
  hierarchy: [
    {
      name: "ROOT",
      parentName: null,
      localTransform: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
      children: [
        {
          name: "SHOULDER",
          parentName: "ROOT",
          localTransform: {
            position: { x: 0, y: 1, z: 0 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
          children: [],
        },
      ],
    },
  ],
});

jointState.defineJointArray({
  objectName: "robotArm",
  name: "arm",
  joints: ["SHOULDER"],
});

jointState.applyPose({
  objectName: "robotArm",
  poseName: "raised",
  joints: {
    SHOULDER: {
      orientation: { x: 0, y: 0, z: 0.707, w: 0.707 },
    },
  },
});

const exportedJointState = jointState.toJSON();
console.log(exportedJointState.objects.robotArm.jointArrays.arm);
```

The export path includes this joint snapshot or an equivalent project metadata
representation. Joint sidecar evidence is useful for server verification, but
browser export must not depend on an external sidecar to restore exported joint
data.

### Export and share a web package

```typescript
import { ProjectExport } from "alice-web";

const webPackage = await ProjectExport.exportWebPackage(archive.project, {
  title: archive.project.projectName,
  description: "Robot arm scene with a saved camera view.",
  teacher: {
    audience: "Middle school creative coding",
    lessonFocus: "Reusable camera and joint-state lesson",
    remix: "with-attribution",
    tags: ["classroom", "remix"],
    standards: ["CSTA 2-AP-10"],
  },
});

const validation = await ProjectExport.validateWebPackage({
  packageBase64: webPackage.package.base64,
});

if (!validation.valid) {
  throw new Error(
    validation.errors.map((error) => error.message).join("; "),
  );
}

const shareArtifacts = await ProjectExport.generateShareArtifacts({
  packageBase64: webPackage.package.base64,
  title: archive.project.projectName,
  teacher: {
    audience: "Middle school creative coding",
    lessonFocus: "Reusable camera and joint-state lesson",
    remix: "with-attribution",
  },
});
console.log(shareArtifacts.share.links.html);
```

`ProjectExport.exportWebPackage()` creates the runnable `alice-web` ZIP package.
`ProjectExport.generateShareArtifacts()` only accepts a package that validates.
When `teacher` metadata is provided, `share.json` contains
`alice-web.teacher-share/v1` metadata and validation evidence includes
`teacher-share-metadata`.
The existing `exportWebPackage(project)` function receives an `AliceProject`.
The browser workflow places imported resources, camera state, and joint state
into the project payload or an explicit wrapper before export so the web package
is self-contained.

## Data included in exports

The workflow has two export targets.

| Export target | Data that must be included |
| --- | --- |
| `.a3p` project archive | Project XML, manifest when present, `version.txt`, thumbnail when present or generated, imported model resources, imported texture/image resources, camera workflow state, joint state, and project metadata. |
| `alice-web` web package | `index.html`, `manifest.json`, `share.json`, `preview.png`, `project/project.json`, `validation.json`, package filename, MIME type, byte size, SHA-256 digest, Alice runtime identity, model resources, texture/image resources, camera workflow state, joint state, and project metadata. |

The existing web-package ZIP structure is:

```text
ProjectName.alice-web/
|-- index.html
|-- manifest.json
|-- share.json
|-- preview.png
|-- project/
|   `-- project.json
`-- validation.json
```

The browser workflow keeps that structure and ensures `project/project.json`
contains enough project state to reopen the model, textures, camera view, and
joints without reading local files outside the package.

## Server route compatibility

Server camera routes are compatibility endpoints for automation and local server
workflows. They expose the same camera state and validation behavior as the
TypeScript `CameraWorkflow` module:

| Route family | Purpose |
| --- | --- |
| `/api/camera/*` | Move, pan, zoom, focus, orbit, preset, mode, marker read/write, and route-level token protection for camera workflows. |
| `/api/joints/*` | Register jointed objects, define arrays, apply poses, queue animations, and verify runtime joint state. |
| `/api/project/export/web-package` | Export the active server project as a runnable `alice-web` package. |
| `/api/project/validate-web-package` | Validate a package before playback, storage, or sharing. |
| `/api/project/share` | Generate share metadata from a validated package. |

Browser-only editing should be able to use the TypeScript modules without a
server round trip. Server support is required for `eatme`, local REST
automation, and server-driven export/share flows.

## Related docs

- [Project IO API reference](./project-io-api.md)
- [Project IO usage guide](./project-io-usage.md)
- [Camera workflow API](./camera-workflow-api.md)
- [Camera workflow usage](./camera-workflow-usage.md)
- [Joint manipulation](./joint-manipulation.md)
- [Creating, using, and testing 3D character assets](./creating-using-testing-3d-character-assets.md)
- [Web package API routes](./api-reference.md#post-apiprojectexportweb-package)
