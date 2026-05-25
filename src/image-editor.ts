import type { TextureImageData } from "./materials.js";

export type RgbaColor = readonly [number, number, number, number];
export type ResizeInterpolation = "nearest" | "bilinear";

export interface ImageRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EditableImage extends TextureImageData {
  readonly data: Uint8ClampedArray;
}

export interface ImageEditorSessionOptions {
  readonly historyLimit?: number;
}

const TRANSPARENT: RgbaColor = [0, 0, 0, 0];

export function createImage(
  width: number,
  height: number,
  fillColor: RgbaColor = TRANSPARENT,
): EditableImage {
  const normalizedWidth = normalizeDimension(width, "width");
  const normalizedHeight = normalizeDimension(height, "height");
  const data = new Uint8ClampedArray(normalizedWidth * normalizedHeight * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = fillColor[0];
    data[index + 1] = fillColor[1];
    data[index + 2] = fillColor[2];
    data[index + 3] = fillColor[3];
  }

  return { width: normalizedWidth, height: normalizedHeight, data };
}

export function cloneImage(image: TextureImageData): EditableImage {
  const normalized = normalizeImage(image);
  return {
    width: normalized.width,
    height: normalized.height,
    data: new Uint8ClampedArray(normalized.data),
  };
}

export function getPixel(image: TextureImageData, x: number, y: number): RgbaColor {
  const normalized = normalizeImage(image);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= normalized.width || y >= normalized.height) {
    throw new RangeError(`Pixel (${x}, ${y}) is outside ${normalized.width}x${normalized.height}.`);
  }
  const offset = pixelOffset(normalized.width, x, y);
  return [
    normalized.data[offset],
    normalized.data[offset + 1],
    normalized.data[offset + 2],
    normalized.data[offset + 3],
  ];
}

export function cropImage(
  image: TextureImageData,
  region: ImageRegion,
  fillColor: RgbaColor = TRANSPARENT,
): EditableImage {
  const source = normalizeImage(image);
  const normalizedRegion = normalizeRegion(region);
  const cropped = createImage(normalizedRegion.width, normalizedRegion.height, fillColor);

  for (let y = 0; y < cropped.height; y += 1) {
    for (let x = 0; x < cropped.width; x += 1) {
      const sourceX = normalizedRegion.x + x;
      const sourceY = normalizedRegion.y + y;
      if (sourceX < 0 || sourceY < 0 || sourceX >= source.width || sourceY >= source.height) {
        continue;
      }
      writePixel(cropped, x, y, getPixel(source, sourceX, sourceY));
    }
  }

  return cropped;
}

export function flipImage(image: TextureImageData, axis: "horizontal" | "vertical"): EditableImage {
  const source = normalizeImage(image);
  const flipped = createImage(source.width, source.height);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceX = axis === "horizontal" ? source.width - 1 - x : x;
      const sourceY = axis === "vertical" ? source.height - 1 - y : y;
      writePixel(flipped, x, y, getPixel(source, sourceX, sourceY));
    }
  }

  return flipped;
}

export function rotateImage(image: TextureImageData, quarterTurns: number): EditableImage {
  const source = normalizeImage(image);
  const turns = normalizeQuarterTurns(quarterTurns);
  if (turns === 0) {
    return cloneImage(source);
  }

  const rotated = createImage(
    turns % 2 === 0 ? source.width : source.height,
    turns % 2 === 0 ? source.height : source.width,
  );

  for (let y = 0; y < rotated.height; y += 1) {
    for (let x = 0; x < rotated.width; x += 1) {
      const [sourceX, sourceY] = mapRotatedPixel(source.width, source.height, x, y, turns);
      writePixel(rotated, x, y, getPixel(source, sourceX, sourceY));
    }
  }

  return rotated;
}

export function resizeImage(
  image: TextureImageData,
  width: number,
  height: number,
  interpolation: ResizeInterpolation = "nearest",
): EditableImage {
  const source = normalizeImage(image);
  const targetWidth = normalizeDimension(width, "width");
  const targetHeight = normalizeDimension(height, "height");
  const resized = createImage(targetWidth, targetHeight);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const color = interpolation === "bilinear"
        ? sampleBilinear(source, x, y, targetWidth, targetHeight)
        : sampleNearest(source, x, y, targetWidth, targetHeight);
      writePixel(resized, x, y, color);
    }
  }

  return resized;
}

export function trimTransparentBorders(image: TextureImageData): { image: EditableImage; bounds: ImageRegion | null } {
  const source = normalizeImage(image);
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (getPixel(source, x, y)[3] === 0) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return { image: cloneImage(source), bounds: null };
  }

  const bounds = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  return {
    image: cropImage(source, bounds),
    bounds,
  };
}

export async function decodePng(bytes: Uint8Array): Promise<EditableImage> {
  const { createCanvas, loadImage } = await import("canvas");
  const image = await loadImage(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, image.width, image.height);
  const imageData = context.getImageData(0, 0, image.width, image.height);
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(imageData.data),
  };
}

export async function encodePng(image: TextureImageData): Promise<Uint8Array> {
  const normalized = normalizeImage(image);
  const { createCanvas, ImageData } = await import("canvas");
  const canvas = createCanvas(normalized.width, normalized.height);
  const context = canvas.getContext("2d");
  const imageData = new ImageData(new Uint8ClampedArray(normalized.data), normalized.width, normalized.height);
  context.putImageData(imageData, 0, 0);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

export class ImageEditorSession {
  readonly #history: EditableImage[] = [];
  readonly #future: EditableImage[] = [];
  readonly #historyLimit: number;
  #image: EditableImage;

  constructor(image: TextureImageData, options: ImageEditorSessionOptions = {}) {
    this.#image = cloneImage(image);
    this.#historyLimit = normalizeHistoryLimit(options.historyLimit ?? 32);
  }

  get image(): EditableImage {
    return cloneImage(this.#image);
  }

  get canUndo(): boolean {
    return this.#history.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  replace(image: TextureImageData): void {
    this.#commit(cloneImage(image));
  }

  crop(region: ImageRegion, fillColor: RgbaColor = TRANSPARENT): void {
    this.#commit(cropImage(this.#image, region, fillColor));
  }

  resize(width: number, height: number, interpolation: ResizeInterpolation = "nearest"): void {
    this.#commit(resizeImage(this.#image, width, height, interpolation));
  }

  rotateClockwise(): void {
    this.#commit(rotateImage(this.#image, 1));
  }

  rotateCounterClockwise(): void {
    this.#commit(rotateImage(this.#image, 3));
  }

  rotate180(): void {
    this.#commit(rotateImage(this.#image, 2));
  }

  flipHorizontal(): void {
    this.#commit(flipImage(this.#image, "horizontal"));
  }

  flipVertical(): void {
    this.#commit(flipImage(this.#image, "vertical"));
  }

  trimTransparentBorders(): ImageRegion | null {
    const trimmed = trimTransparentBorders(this.#image);
    this.#commit(trimmed.image);
    return trimmed.bounds;
  }

  undo(): boolean {
    const previous = this.#history.pop();
    if (!previous) {
      return false;
    }
    this.#future.push(cloneImage(this.#image));
    this.#image = previous;
    return true;
  }

  redo(): boolean {
    const next = this.#future.pop();
    if (!next) {
      return false;
    }
    this.#history.push(cloneImage(this.#image));
    this.#image = next;
    return true;
  }

  #commit(next: EditableImage): void {
    this.#history.push(cloneImage(this.#image));
    while (this.#history.length > this.#historyLimit) {
      this.#history.shift();
    }
    this.#image = next;
    this.#future.length = 0;
  }
}

function normalizeImage(image: TextureImageData): EditableImage {
  const width = normalizeDimension(image.width, "width");
  const height = normalizeDimension(image.height, "height");
  const data = new Uint8ClampedArray(image.data);
  if (data.length !== width * height * 4) {
    throw new RangeError(`Image data length ${data.length} does not match ${width}x${height}.`);
  }
  return { width, height, data };
}

function normalizeDimension(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`Image ${name} must be a positive integer. Received ${value}.`);
  }
  return value;
}

function normalizeRegion(region: ImageRegion): ImageRegion {
  if (!Number.isInteger(region.x) || !Number.isInteger(region.y)) {
    throw new RangeError(`Crop origin must use integer coordinates. Received (${region.x}, ${region.y}).`);
  }
  return {
    x: region.x,
    y: region.y,
    width: normalizeDimension(region.width, "crop width"),
    height: normalizeDimension(region.height, "crop height"),
  };
}

function normalizeQuarterTurns(quarterTurns: number): number {
  if (!Number.isInteger(quarterTurns)) {
    throw new RangeError(`quarterTurns must be an integer. Received ${quarterTurns}.`);
  }
  return ((quarterTurns % 4) + 4) % 4;
}

function normalizeHistoryLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`historyLimit must be a positive integer. Received ${limit}.`);
  }
  return limit;
}

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function writePixel(image: EditableImage, x: number, y: number, color: RgbaColor): void {
  const offset = pixelOffset(image.width, x, y);
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}

function mapRotatedPixel(width: number, height: number, x: number, y: number, turns: number): readonly [number, number] {
  switch (turns) {
    case 1:
      return [y, height - 1 - x];
    case 2:
      return [width - 1 - x, height - 1 - y];
    case 3:
      return [width - 1 - y, x];
    default:
      return [x, y];
  }
}

function sampleNearest(
  image: EditableImage,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
): RgbaColor {
  const sourceX = Math.min(image.width - 1, Math.floor(((targetX + 0.5) * image.width) / targetWidth));
  const sourceY = Math.min(image.height - 1, Math.floor(((targetY + 0.5) * image.height) / targetHeight));
  return getPixel(image, sourceX, sourceY);
}

function sampleBilinear(
  image: EditableImage,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
): RgbaColor {
  const sourceX = ((targetX + 0.5) * image.width) / targetWidth - 0.5;
  const sourceY = ((targetY + 0.5) * image.height) / targetHeight - 0.5;
  const x0 = clamp(Math.floor(sourceX), 0, image.width - 1);
  const y0 = clamp(Math.floor(sourceY), 0, image.height - 1);
  const x1 = clamp(x0 + 1, 0, image.width - 1);
  const y1 = clamp(y0 + 1, 0, image.height - 1);
  const xWeight = sourceX - x0;
  const yWeight = sourceY - y0;
  const topLeft = getPixel(image, x0, y0);
  const topRight = getPixel(image, x1, y0);
  const bottomLeft = getPixel(image, x0, y1);
  const bottomRight = getPixel(image, x1, y1);
  const channels = [0, 1, 2, 3].map((channel) => Math.round(
    topLeft[channel] * (1 - xWeight) * (1 - yWeight)
      + topRight[channel] * xWeight * (1 - yWeight)
      + bottomLeft[channel] * (1 - xWeight) * yWeight
      + bottomRight[channel] * xWeight * yWeight,
  ));
  return [channels[0], channels[1], channels[2], channels[3]];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
