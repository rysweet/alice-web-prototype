import { Property, PropertyOwner } from "./property-system.js";
import type { PropertyListener } from "./property-system.js";

export interface Color4 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export type PaintType = "color" | "texture" | "gradient" | "none";

export interface Paint {
  readonly type: PaintType;
  readonly color?: Color4;
  readonly textureRef?: string;
}

export interface EntityPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface EntityOrientation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface EntityScale {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export const DEFAULT_COLOR: Color4 = Object.freeze({ r: 1, g: 1, b: 1, a: 1 });
export const DEFAULT_PAINT: Paint = Object.freeze({ type: "color", color: DEFAULT_COLOR });
export const DEFAULT_POSITION: EntityPosition = Object.freeze({ x: 0, y: 0, z: 0 });
export const DEFAULT_ORIENTATION: EntityOrientation = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
export const DEFAULT_SCALE: EntityScale = Object.freeze({ width: 1, height: 1, depth: 1 });

const ENTITY_PROPERTY_NAMES = [
  "color",
  "opacity",
  "paint",
  "vehicle",
  "isShowing",
  "position",
  "orientation",
  "scale",
] as const;

const PAINT_TYPES = new Set<PaintType>(["color", "texture", "gradient", "none"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isUnitIntervalNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function cloneColor(value: Color4): Color4 {
  return { ...value };
}

function colorsEqual(left: Color4, right: Color4): boolean {
  return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a;
}

function isColor4(value: unknown): value is Color4 {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Color4>;
  return (
    isUnitIntervalNumber(candidate.r) &&
    isUnitIntervalNumber(candidate.g) &&
    isUnitIntervalNumber(candidate.b) &&
    isUnitIntervalNumber(candidate.a)
  );
}

function clonePaint(value: Paint): Paint {
  return {
    type: value.type,
    ...(value.color ? { color: cloneColor(value.color) } : {}),
    ...(value.textureRef !== undefined ? { textureRef: value.textureRef } : {}),
  };
}

function paintsEqual(left: Paint, right: Paint): boolean {
  return (
    left.type === right.type &&
    left.textureRef === right.textureRef &&
    ((left.color === undefined && right.color === undefined) ||
      (left.color !== undefined && right.color !== undefined && colorsEqual(left.color, right.color)))
  );
}

function isPaint(value: unknown): value is Paint {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Paint>;
  if (!candidate.type || !PAINT_TYPES.has(candidate.type)) {
    return false;
  }
  if (candidate.color !== undefined && !isColor4(candidate.color)) {
    return false;
  }
  return candidate.textureRef === undefined || typeof candidate.textureRef === "string";
}

function clonePosition(value: EntityPosition): EntityPosition {
  return { ...value };
}

function positionsEqual(left: EntityPosition, right: EntityPosition): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function isPosition(value: unknown): value is EntityPosition {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<EntityPosition>;
  return isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y) && isFiniteNumber(candidate.z);
}

function cloneOrientation(value: EntityOrientation): EntityOrientation {
  return { ...value };
}

function orientationsEqual(left: EntityOrientation, right: EntityOrientation): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z && left.w === right.w;
}

function isOrientation(value: unknown): value is EntityOrientation {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<EntityOrientation>;
  return (
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    isFiniteNumber(candidate.z) &&
    isFiniteNumber(candidate.w)
  );
}

function cloneScale(value: EntityScale): EntityScale {
  return { ...value };
}

function scalesEqual(left: EntityScale, right: EntityScale): boolean {
  return left.width === right.width && left.height === right.height && left.depth === right.depth;
}

function isScale(value: unknown): value is EntityScale {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<EntityScale>;
  return (
    isFiniteNumber(candidate.width) &&
    isFiniteNumber(candidate.height) &&
    isFiniteNumber(candidate.depth)
  );
}

function cloneSnapshotValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return [...value] as T;
  }
  if (value && typeof value === "object") {
    return { ...(value as Record<string, unknown>) } as T;
  }
  return value;
}

export class ColorProperty extends Property<Color4> {
  constructor(owner: PropertyOwner, name = "color", initial: Color4 = DEFAULT_COLOR) {
    super(owner, name, cloneColor(initial), {
      validate: isColor4,
      clone: cloneColor,
      equals: colorsEqual,
    });
  }
}

export class PaintProperty extends Property<Paint> {
  constructor(owner: PropertyOwner, name = "paint", initial: Paint = DEFAULT_PAINT) {
    super(owner, name, clonePaint(initial), {
      validate: isPaint,
      clone: clonePaint,
      equals: paintsEqual,
    });
  }
}

export class OpacityProperty extends Property<number> {
  constructor(owner: PropertyOwner, name = "opacity", initial = 1) {
    super(owner, name, initial, {
      validate: isUnitIntervalNumber,
      interpolate: (left, right, portion) => left + (right - left) * portion,
    });
  }
}

export class EntityPropertyBundle extends PropertyOwner {
  readonly color: ColorProperty;
  readonly opacity: OpacityProperty;
  readonly paint: PaintProperty;
  readonly vehicle: Property<string | null>;
  readonly isShowing: Property<boolean>;
  readonly position: Property<EntityPosition>;
  readonly orientation: Property<EntityOrientation>;
  readonly scale: Property<EntityScale>;

  constructor(options: {
    color?: Color4;
    opacity?: number;
    paint?: Paint;
    vehicle?: string | null;
    isShowing?: boolean;
    position?: EntityPosition;
    orientation?: EntityOrientation;
    scale?: EntityScale;
  } = {}) {
    super();
    this.color = this.registerProperty(new ColorProperty(this, "color", options.color ?? DEFAULT_COLOR)) as ColorProperty;
    this.opacity = this.registerProperty(new OpacityProperty(this, "opacity", options.opacity ?? 1)) as OpacityProperty;
    this.paint = this.registerProperty(new PaintProperty(this, "paint", options.paint ?? DEFAULT_PAINT)) as PaintProperty;
    this.vehicle = this.createProperty<string | null>("vehicle", options.vehicle ?? null, {
      validate: (value) => value === null || typeof value === "string",
    });
    this.isShowing = this.createProperty<boolean>("isShowing", options.isShowing ?? true, {
      validate: (value) => typeof value === "boolean",
    });
    this.position = this.createProperty<EntityPosition>("position", options.position ?? DEFAULT_POSITION, {
      validate: isPosition,
      clone: clonePosition,
      equals: positionsEqual,
    });
    this.orientation = this.createProperty<EntityOrientation>(
      "orientation",
      options.orientation ?? DEFAULT_ORIENTATION,
      {
        validate: isOrientation,
        clone: cloneOrientation,
        equals: orientationsEqual,
      },
    );
    this.scale = this.createProperty<EntityScale>("scale", options.scale ?? DEFAULT_SCALE, {
      validate: isScale,
      clone: cloneScale,
      equals: scalesEqual,
    });
  }

  get propertyNames(): readonly string[] {
    return ENTITY_PROPERTY_NAMES;
  }

  onAnyChange(callback: (propertyName: string, oldValue: unknown, newValue: unknown) => void): () => void {
    const unsubscribes: Array<() => void> = [];
    for (const [name, property] of this.properties) {
      const listener: PropertyListener<unknown> = (change) => {
        callback(name, change.previousValue, change.value);
      };
      property.addListener(listener);
      unsubscribes.push(() => property.removeListener(listener));
    }
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }

  snapshot(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const name of this.propertyNames) {
      const property = this.getProperty<unknown>(name);
      if (property) {
        result[name] = cloneSnapshotValue(property.value);
      }
    }
    return result;
  }

  restore(snapshot: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(snapshot)) {
      this.getProperty<unknown>(name)?.setValue(cloneSnapshotValue(value));
    }
  }
}
