import { describe, expect, it } from "vitest";
import {
  ComputedProperty,
  Property,
  PropertyAnimation,
  PropertyBinding,
  PropertyOwner,
  PropertySnapshot,
} from "../src/property-system.js";

describe("property-system", () => {
  it("tracks typed property changes with previous and current values", () => {
    const owner = new PropertyOwner();
    const property = owner.createProperty<number>("score", 1);
    const changes: Array<{ previous: number; value: number }> = [];

    property.addListener((change) => changes.push({ previous: change.previousValue, value: change.value }));
    property.setValue(5);

    expect(property.value).toBe(5);
    expect(changes).toEqual([{ previous: 1, value: 5 }]);
    expect(owner.listPropertyNames()).toEqual(["score"]);
  });

  it("animates property values over time", () => {
    const owner = new PropertyOwner();
    const opacity = owner.createProperty<number>("opacity", 0);
    const animation = new PropertyAnimation({ property: opacity, to: 1, durationMs: 1000, easing: (portion) => portion });

    expect(animation.update(500).value).toBeCloseTo(0.5, 5);
    expect(opacity.value).toBeCloseTo(0.5, 5);
    expect(animation.update(500).value).toBeCloseTo(1, 5);
    expect(animation.isComplete).toBe(true);
  });

  it("keeps bidirectionally bound properties in sync until disconnected", () => {
    const owner = new PropertyOwner();
    const left = owner.createProperty<number>("left", 2);
    const right = owner.createProperty<number>("right", 8);
    const binding = new PropertyBinding(left, right, "other");

    expect(left.value).toBe(8);
    expect(binding.isConnected).toBe(true);
    left.setValue(3);
    expect(right.value).toBe(3);

    binding.disconnect();
    left.setValue(4);
    expect(right.value).toBe(3);
  });

  it("recomputes derived properties when dependencies change", () => {
    const owner = new PropertyOwner();
    const width = owner.createProperty<number>("width", 2);
    const height = owner.createProperty<number>("height", 3);
    const area = new ComputedProperty<number>("area", [width, height], () => width.value * height.value, { owner });

    expect(area.value).toBe(6);
    height.setValue(4);
    expect(area.value).toBe(8);
  });

  it("captures and restores property snapshots for undo flows", () => {
    const owner = new PropertyOwner();
    const color = owner.createProperty<string>("color", "#112233");
    const size = owner.createProperty("size", { width: 1, height: 2, depth: 3 }, {
      clone: (value) => ({ ...value }),
      equals: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    });

    const snapshot = PropertySnapshot.capture(owner);
    color.setValue("#abcdef");
    size.setValue({ width: 4, height: 5, depth: 6 });

    snapshot.restore();

    expect(color.value).toBe("#112233");
    expect(size.value).toEqual({ width: 1, height: 2, depth: 3 });
    expect(snapshot.toJSON()).toEqual({
      color: "#112233",
      size: { width: 1, height: 2, depth: 3 },
    });
  });

  it("supports explicit property registration", () => {
    const owner = new PropertyOwner();
    const property = owner.registerProperty(new Property(owner, "name", "Alice"));

    expect(owner.getProperty<string>("name")).toBe(property);
    expect(property.value).toBe("Alice");
  });
});
