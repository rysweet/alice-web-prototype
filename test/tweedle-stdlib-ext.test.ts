import { describe, expect, it } from "vitest";
import {
  BooleanFunctions,
  ConversionFunctions,
  ListFunctions,
  MathFunctions,
  StringFunctions,
} from "../src/tweedle-stdlib-ext.js";

describe("tweedle-stdlib-ext", () => {
  it("MathFunctions covers core numeric helpers", () => {
    expect(MathFunctions.abs(-4)).toBe(4);
    expect(MathFunctions.sqrt(81)).toBe(9);
    expect(MathFunctions.pow(2, 5)).toBe(32);
    expect(MathFunctions.sin(Math.PI / 2)).toBeCloseTo(1);
    expect(MathFunctions.cos(Math.PI)).toBeCloseTo(-1);
    expect(MathFunctions.floor(2.9)).toBe(2);
    expect(MathFunctions.ceil(2.1)).toBe(3);
    expect(MathFunctions.round(2.5)).toBe(3);
    expect(MathFunctions.random(10, 20, () => 0.25)).toBe(12.5);
    expect(MathFunctions.min(7, 2, 5)).toBe(2);
    expect(MathFunctions.max(7, 2, 5)).toBe(7);
  });

  it("StringFunctions exposes the expected string helpers", () => {
    expect(StringFunctions.length("Alice")).toBe(5);
    expect(StringFunctions.substring("Round84", 1, 6)).toBe("ound8");
    expect(StringFunctions.indexOf("Round84", "84")).toBe(5);
    expect(StringFunctions.toUpperCase("Alice")).toBe("ALICE");
    expect(StringFunctions.toLowerCase("ALICE")).toBe("alice");
    expect(StringFunctions.trim("  demo  ")).toBe("demo");
    expect(StringFunctions.concat("Alice", " ", "3")).toBe("Alice 3");
  });

  it("ListFunctions mutates and queries arrays in place", () => {
    const values = ["rabbit", "hole"];

    expect(ListFunctions.size(values)).toBe(2);
    expect(ListFunctions.get(values, 1)).toBe("hole");
    expect(ListFunctions.add(values, "round84")).toBe(3);
    expect(ListFunctions.contains(values, "round84")).toBe(true);
    expect(ListFunctions.indexOf(values, "hole")).toBe(1);
    expect(ListFunctions.remove(values, 1)).toBe("hole");
    expect(ListFunctions.shuffle(values, () => 0)).toEqual(["round84", "rabbit"]);
    expect(ListFunctions.clear(values)).toEqual([]);
  });

  it("BooleanFunctions implements boolean algebra helpers", () => {
    expect(BooleanFunctions.not(true)).toBe(false);
    expect(BooleanFunctions.and(true, false)).toBe(false);
    expect(BooleanFunctions.or(true, false)).toBe(true);
    expect(BooleanFunctions.xor(true, false)).toBe(true);
    expect(BooleanFunctions.xor(true, true)).toBe(false);
  });

  it("ConversionFunctions converts common primitive-like values", () => {
    expect(ConversionFunctions.intToDouble(7)).toBe(7);
    expect(ConversionFunctions.doubleToInt(7.9)).toBe(7);
    expect(ConversionFunctions.doubleToInt(-7.9)).toBe(-7);
    expect(ConversionFunctions.toString(84)).toBe("84");
    expect(ConversionFunctions.toBoolean("true")).toBe(true);
    expect(ConversionFunctions.toBoolean("0")).toBe(false);
    expect(ConversionFunctions.toBoolean(3)).toBe(true);
    expect(ConversionFunctions.toBoolean(0)).toBe(false);
  });
});
