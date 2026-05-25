# Image Editor

The TypeScript prototype now includes a focused image-editing subsystem for the
same high-value operations that Alice's Java `core/image-editor` module covers:
crop, resize, rotate, flip, transparent-border trimming, PNG decode/encode, and
edit-session undo/redo.

## Modules

| Export | Purpose |
|---|---|
| `createImage()` | Allocate a new RGBA image buffer with a fill color |
| `cloneImage()` | Defensive copy of image data |
| `cropImage()` | Crop to a region, with transparent padding outside bounds |
| `resizeImage()` | Resize using nearest-neighbor or bilinear sampling |
| `rotateImage()` | Rotate by 90° increments |
| `flipImage()` | Horizontal or vertical mirroring |
| `trimTransparentBorders()` | Tighten images to their opaque content |
| `decodePng()` / `encodePng()` | Convert between RGBA buffers and PNG bytes |
| `ImageEditorSession` | Stateful editor session with undo/redo history |

## Quick Start

```typescript
import {
  ImageEditorSession,
  createImage,
  encodePng,
} from "./image-editor";

const image = createImage(64, 64, [0, 0, 0, 0]);
const editor = new ImageEditorSession(image);

editor.crop({ x: 8, y: 8, width: 48, height: 48 });
editor.resize(96, 96, "bilinear");
editor.rotateClockwise();

const png = await encodePng(editor.image);
```

## Behavior Notes

- All image buffers use 8-bit RGBA channel order.
- Dimensions must be positive integers.
- Crop operations preserve the requested output size even when the source region
  extends outside the image; uncovered pixels are filled with transparent black
  unless a custom fill color is provided.
- `trimTransparentBorders()` returns both the trimmed image and the bounds that
  were removed from the original.
- `ImageEditorSession` keeps a bounded history (default: 32 states) and clears
  redo history whenever a new edit is committed.
