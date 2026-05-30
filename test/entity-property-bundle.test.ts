import { describe, expect, it } from "vitest";
import {
  ColorProperty,
  DEFAULT_COLOR,
  DEFAULT_ORIENTATION,
  DEFAULT_PAINT,
  DEFAULT_POSITION,
  DEFAULT_SCALE,
  EntityPropertyBundle,
  OpacityProperty,
  PaintProperty,
} from "../src/entity-property-bundle.js";
import { PropertyOwner } from "../src/property-system.js";

describe("ColorProperty", () => {
  it("accepts valid RGBA color", () => {
    const owner = new PropertyOwner();
    const prop = new ColorProperty(owner);

    expect(prop.value).toEqual(DEFAULT_COLOR);
    prop.setValue({ r: 0.5, g: 0.3, b: 0.8, a: 1.0 });
    expect(prop.value.r).toBeCloseTo(0.5);
  });

  it("rejects out-of-range values", () => {
    const owner = new PropertyOwner();
    const prop = new ColorProperty(owner);
    const before = prop.value;

    prop.setValue({ r: 2, g: 0, b: 0, a: 1 });
    expect(prop.value).toEqual(before);
  });

  it("rejects non-finite values", () => {
    const owner = new PropertyOwner();
    const prop = new ColorProperty(owner);
    const before = prop.value;

    prop.setValue({ r: Number.NaN, g: 0, b: 0, a: 1 });
    expect(prop.value).toEqual(before);
  });
});

describe("OpacityProperty", () => {
  it("defaults to 1.0", () => {
    const owner = new PropertyOwner();
    const prop = new OpacityProperty(owner);

    expect(prop.value).toBe(1);
  });

  it("accepts values between 0 and 1", () => {
    const owner = new PropertyOwner();
    const prop = new OpacityProperty(owner);

    prop.setValue(0.5);
    expect(prop.value).toBe(0.5);
    prop.setValue(0);
    expect(prop.value).toBe(0);
    prop.setValue(1);
    expect(prop.value).toBe(1);
  });

  it("rejects values outside 0-1", () => {
    const owner = new PropertyOwner();
    const prop = new OpacityProperty(owner);

    prop.setValue(1.5);
    expect(prop.value).toBe(1);
    prop.setValue(-0.1);
    expect(prop.value).toBe(1);
  });
});

describe("PaintProperty", () => {
  it("defaults to color paint", () => {
    const owner = new PropertyOwner();
    const prop = new PaintProperty(owner);

    expect(prop.value).toEqual(DEFAULT_PAINT);
  });

  it("accepts texture paint", () => {
    const owner = new PropertyOwner();
    const prop = new PaintProperty(owner);

    prop.setValue({ type: "texture", textureRef: "wood.png" });
    expect(prop.value.type).toBe("texture");
    expect(prop.value.textureRef).toBe("wood.png");
  });

  it("rejects invalid paint type", () => {
    const owner = new PropertyOwner();
    const prop = new PaintProperty(owner);

    prop.setValue({ type: "invalid" as never });
    expect(prop.value).toEqual(DEFAULT_PAINT);
  });
});

describe("EntityPropertyBundle", () => {
  it("creates with all 8 default properties", () => {
    const bundle = new EntityPropertyBundle();

    expect(bundle.propertyNames).toHaveLength(8);
    expect(bundle.color.value).toEqual(DEFAULT_COLOR);
    expect(bundle.opacity.value).toBe(1);
    expect(bundle.paint.value).toEqual(DEFAULT_PAINT);
    expect(bundle.vehicle.value).toBeNull();
    expect(bundle.isShowing.value).toBe(true);
    expect(bundle.position.value).toEqual(DEFAULT_POSITION);
    expect(bundle.orientation.value).toEqual(DEFAULT_ORIENTATION);
    expect(bundle.scale.value).toEqual(DEFAULT_SCALE);
  });

  it("creates with custom initial values", () => {
    const bundle = new EntityPropertyBundle({
      color: { r: 1, g: 0, b: 0, a: 1 },
      opacity: 0.5,
      isShowing: false,
      position: { x: 1, y: 2, z: 3 },
    });

    expect(bundle.color.value.r).toBe(1);
    expect(bundle.color.value.g).toBe(0);
    expect(bundle.opacity.value).toBe(0.5);
    expect(bundle.isShowing.value).toBe(false);
    expect(bundle.position.value.x).toBe(1);
  });

  it("typed getters and setters work correctly", () => {
    const bundle = new EntityPropertyBundle();

    bundle.position.setValue({ x: 10, y: 20, z: 30 });
    expect(bundle.position.value.x).toBe(10);

    bundle.orientation.setValue({ x: 0, y: 0.707, z: 0, w: 0.707 });
    expect(bundle.orientation.value.y).toBeCloseTo(0.707);

    bundle.scale.setValue({ width: 2, height: 3, depth: 4 });
    expect(bundle.scale.value.width).toBe(2);
  });

  it("change listeners fire on property changes", () => {
    const bundle = new EntityPropertyBundle();
    const changes: Array<{ name: string; old: unknown; next: unknown }> = [];

    const unsubscribe = bundle.onAnyChange((name, oldValue, newValue) => {
      changes.push({ name, old: oldValue, next: newValue });
    });

    bundle.opacity.setValue(0.5);
    bundle.isShowing.setValue(false);

    expect(changes).toHaveLength(2);
    expect(changes[0]).toEqual({ name: "opacity", old: 1, next: 0.5 });
    expect(changes[1]).toEqual({ name: "isShowing", old: true, next: false });

    unsubscribe();
    bundle.opacity.setValue(0.3);
    expect(changes).toHaveLength(2);
  });

  it("snapshot and restore preserves state", () => {
    const bundle = new EntityPropertyBundle();

    bundle.position.setValue({ x: 10, y: 20, z: 30 });
    bundle.opacity.setValue(0.7);

    const snapshot = bundle.snapshot();

    bundle.position.setValue({ x: 0, y: 0, z: 0 });
    bundle.opacity.setValue(1.0);

    bundle.restore(snapshot);
    expect(bundle.position.value.x).toBe(10);
    expect(bundle.opacity.value).toBe(0.7);
  });

  it("vehicle property works", () => {
    const bundle = new EntityPropertyBundle();

    expect(bundle.vehicle.value).toBeNull();
    bundle.vehicle.setValue("ground");
    expect(bundle.vehicle.value).toBe("ground");
  });

  it("is a PropertyOwner with 8 registered properties", () => {
    const bundle = new EntityPropertyBundle();

    expect(bundle.listPropertyNames()).toHaveLength(8);
    expect(bundle.getProperty("color")).toBeDefined();
    expect(bundle.getProperty("opacity")).toBeDefined();
    expect(bundle.getProperty("nonexistent")).toBeUndefined();
  });

  it("type safety: opacity rejects invalid values via bundle", () => {
    const bundle = new EntityPropertyBundle();

    bundle.opacity.setValue(1.5);
    expect(bundle.opacity.value).toBe(1);
  });

  it("type safety: color rejects invalid via bundle", () => {
    const bundle = new EntityPropertyBundle();

    bundle.color.setValue({ r: -1, g: 0, b: 0, a: 1 });
    expect(bundle.color.value).toEqual(DEFAULT_COLOR);
  });
});
