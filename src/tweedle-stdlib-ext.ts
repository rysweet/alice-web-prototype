export class MathFunctions {
  static abs(value: number): number { return Math.abs(value); }
  static sqrt(value: number): number { return Math.sqrt(value); }
  static pow(base: number, exponent: number): number { return Math.pow(base, exponent); }
  static sin(value: number): number { return Math.sin(value); }
  static cos(value: number): number { return Math.cos(value); }
  static floor(value: number): number { return Math.floor(value); }
  static ceil(value: number): number { return Math.ceil(value); }
  static round(value: number): number { return Math.round(value); }
  static random(min = 0, max = 1, rng: () => number = Math.random): number {
    if (max < min) {
      [min, max] = [max, min];
    }
    return min + (max - min) * rng();
  }
  static min(...values: number[]): number { return Math.min(...values); }
  static max(...values: number[]): number { return Math.max(...values); }
}

export class StringFunctions {
  static length(value: string): number { return value.length; }
  static substring(value: string, start: number, end?: number): string {
    return value.substring(Math.max(0, start), end === undefined ? undefined : Math.max(0, end));
  }
  static indexOf(value: string, search: string): number { return value.indexOf(search); }
  static toUpperCase(value: string): string { return value.toUpperCase(); }
  static toLowerCase(value: string): string { return value.toLowerCase(); }
  static trim(value: string): string { return value.trim(); }
  static concat(...values: string[]): string { return values.join(""); }
}

export class ListFunctions {
  static size<T>(values: readonly T[]): number { return values.length; }
  static get<T>(values: readonly T[], index: number): T | undefined { return values[index]; }
  static add<T>(values: T[], value: T): number { values.push(value); return values.length; }
  static remove<T>(values: T[], index: number): T | undefined {
    if (index < 0 || index >= values.length) return undefined;
    const [removed] = values.splice(index, 1);
    return removed;
  }
  static contains<T>(values: readonly T[], value: T): boolean { return values.includes(value); }
  static indexOf<T>(values: readonly T[], value: T): number { return values.indexOf(value); }
  static clear<T>(values: T[]): T[] { values.length = 0; return values; }
  static shuffle<T>(values: T[], rng: () => number = Math.random): T[] {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
  }
}

export class BooleanFunctions {
  static not(value: boolean): boolean { return !value; }
  static and(left: boolean, right: boolean): boolean { return left && right; }
  static or(left: boolean, right: boolean): boolean { return left || right; }
  static xor(left: boolean, right: boolean): boolean { return left !== right; }
}

export class ConversionFunctions {
  static intToDouble(value: number): number { return Number(value); }
  static doubleToInt(value: number): number { return value < 0 ? Math.ceil(value) : Math.floor(value); }
  static toString(value: unknown): string { return String(value); }
  static toBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["", "false", "0", "no", "off"].includes(normalized)) return false;
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
    }
    return Boolean(value);
  }
}
