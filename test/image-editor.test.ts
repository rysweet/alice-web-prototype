import { describe, expect, it } from "vitest";
import {
  ImageEditorSession,
  createImage,
  cropImage,
  decodePng,
  encodePng,
  flipImage,
  getPixel,
  resizeImage,
  rotateImage,
  trimTransparentBorders,
  type RgbaColor,
} from "../src/image-editor.js";

function paint(image: ReturnType<typeof createImage>, x: number, y: number, color: RgbaColor): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}

describe("image-editor", () => {
  it("crops with transparent padding when the region extends past the image", () => {
    const image = createImage(2, 2, [0, 0, 0, 0]);
    paint(image, 0, 0, [255, 0, 0, 255]);
    paint(image, 1, 0, [0, 255, 0, 255]);
    paint(image, 0, 1, [0, 0, 255, 255]);
    paint(image, 1, 1, [255, 255, 0, 255]);

    const cropped = cropImage(image, { x: 1, y: 1, width: 2, height: 2 });

    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
    expect(getPixel(cropped, 0, 0)).toEqual([255, 255, 0, 255]);
    expect(getPixel(cropped, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it("resizes with nearest-neighbor sampling", () => {
    const image = createImage(2, 2, [0, 0, 0, 0]);
    paint(image, 0, 0, [255, 0, 0, 255]);
    paint(image, 1, 0, [0, 255, 0, 255]);
    paint(image, 0, 1, [0, 0, 255, 255]);
    paint(image, 1, 1, [255, 255, 0, 255]);

    const resized = resizeImage(image, 4, 4);

    expect(getPixel(resized, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(resized, 3, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(resized, 0, 3)).toEqual([0, 0, 255, 255]);
    expect(getPixel(resized, 3, 3)).toEqual([255, 255, 0, 255]);
  });

  it("rotates and flips images without losing channel data", () => {
    const image = createImage(2, 3, [0, 0, 0, 0]);
    paint(image, 0, 0, [10, 0, 0, 255]);
    paint(image, 1, 0, [20, 0, 0, 255]);
    paint(image, 0, 1, [30, 0, 0, 255]);
    paint(image, 1, 1, [40, 0, 0, 255]);
    paint(image, 0, 2, [50, 0, 0, 255]);
    paint(image, 1, 2, [60, 0, 0, 255]);

    const rotated = rotateImage(image, 1);
    const flipped = flipImage(rotated, "horizontal");

    expect(rotated.width).toBe(3);
    expect(rotated.height).toBe(2);
    expect(getPixel(rotated, 0, 0)).toEqual([50, 0, 0, 255]);
    expect(getPixel(rotated, 2, 1)).toEqual([20, 0, 0, 255]);
    expect(getPixel(flipped, 0, 0)).toEqual([10, 0, 0, 255]);
    expect(getPixel(flipped, 2, 1)).toEqual([60, 0, 0, 255]);
  });

  it("trims transparent borders to the opaque content bounds", () => {
    const image = createImage(4, 4, [0, 0, 0, 0]);
    paint(image, 1, 1, [255, 0, 0, 255]);
    paint(image, 2, 2, [0, 255, 0, 255]);

    const trimmed = trimTransparentBorders(image);

    expect(trimmed.bounds).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(trimmed.image.width).toBe(2);
    expect(trimmed.image.height).toBe(2);
    expect(getPixel(trimmed.image, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(trimmed.image, 1, 1)).toEqual([0, 255, 0, 255]);
  });

  it("tracks undo/redo history across editing operations", () => {
    const image = createImage(2, 2, [0, 0, 0, 0]);
    paint(image, 0, 0, [255, 0, 0, 255]);
    paint(image, 1, 1, [0, 255, 0, 255]);

    const session = new ImageEditorSession(image);
    session.rotateClockwise();
    session.flipVertical();

    expect(session.canUndo).toBe(true);
    expect(getPixel(session.image, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(session.undo()).toBe(true);
    expect(getPixel(session.image, 0, 1)).toEqual([0, 255, 0, 255]);
    expect(session.redo()).toBe(true);
    expect(getPixel(session.image, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it("round-trips encoded PNG image data", async () => {
    const image = createImage(2, 1, [0, 0, 0, 0]);
    paint(image, 0, 0, [255, 0, 0, 255]);
    paint(image, 1, 0, [0, 0, 255, 128]);

    const encoded = await encodePng(image);
    const decoded = await decodePng(encoded);

    expect(encoded[0]).toBe(0x89);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect(getPixel(decoded, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(decoded, 1, 0)).toEqual([0, 0, 255, 128]);
  });
});
