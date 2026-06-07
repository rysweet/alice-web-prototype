import type { AnimationEasing } from "./animation-loop.js";
import type { Vec3 } from "./story-api/types.js";

export interface ScreenPosition {
  readonly x: number;
  readonly y: number;
  readonly visible?: boolean;
}

const COLOR_KEYWORDS: Readonly<Record<string, { r: number; g: number; b: number }>> = Object.freeze({
  WHITE: { r: 1, g: 1, b: 1 },
  BLACK: { r: 0, g: 0, b: 0 },
  RED: { r: 1, g: 0, b: 0 },
  GREEN: { r: 0, g: 1, b: 0 },
  BLUE: { r: 0, g: 0, b: 1 },
  YELLOW: { r: 1, g: 1, b: 0 },
  ORANGE: { r: 1, g: 0.5, b: 0 },
  PURPLE: { r: 0.5, g: 0, b: 0.5 },
  PINK: { r: 1, g: 0.75, b: 0.8 },
  GRAY: { r: 0.5, g: 0.5, b: 0.5 },
  GREY: { r: 0.5, g: 0.5, b: 0.5 },
  BROWN: { r: 0.6, g: 0.4, b: 0.2 },
  CYAN: { r: 0, g: 1, b: 1 },
  MAGENTA: { r: 1, g: 0, b: 1 },
});

export function numericValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function finiteVec3(value: unknown, fallback: Vec3): Vec3 {
  if (typeof value !== "object" || value === null) {
    return { ...fallback };
  }
  const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
  const x = numericValue(candidate.x, Number.NaN);
  const y = numericValue(candidate.y, Number.NaN);
  const z = numericValue(candidate.z, Number.NaN);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? { x, y, z }
    : { ...fallback };
}

export function durationMs(value: unknown): number {
  const parsed = numericValue(value, 0);
  const milliseconds = parsed * 1000;
  return parsed > 0 && Number.isFinite(milliseconds) ? milliseconds : 0;
}

export function easeFor(value: unknown): AnimationEasing {
  if (typeof value === "string" && value.toUpperCase().includes("GENT")) {
    return "ease-in-out";
  }
  return "linear";
}

export function toColor3(value: unknown): { r: number; g: number; b: number } | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[\da-fA-F]{6}$/.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16) / 255,
      g: Number.parseInt(hex.slice(2, 4), 16) / 255,
      b: Number.parseInt(hex.slice(4, 6), 16) / 255,
    };
  }

  return COLOR_KEYWORDS[trimmed.toUpperCase()] ?? null;
}

export function screenPositionOf(worldPosition: Vec3): ScreenPosition {
  return {
    x: numericValue(worldPosition.x, 0) * 100,
    y: numericValue(worldPosition.y, 0) * -100,
    visible: true,
  };
}

export function finiteScreenPosition(value: ScreenPosition): ScreenPosition {
  return {
    x: numericValue(value.x, 0),
    y: numericValue(value.y, 0),
    visible: value.visible === false ? false : true,
  };
}
