import { InstanceProperty, PropertyValidationError, arrayClone, asConstraintMessage, sameArray, type PropertyChangeEvent, type PropertyConstraint, type PropertyEquality } from "./core.js";
import type { PropertyOwner } from "./core.js";

export interface IndexedListPropertyChangeEvent<T> extends PropertyChangeEvent<T[]> {
  kind: "add" | "remove" | "set" | "clear";
  index: number;
  added: readonly T[];
  removed: readonly T[];
}
export type IndexedListPropertyListener<T> = (event: IndexedListPropertyChangeEvent<T>) => void;
export interface ListPropertyOptions<T> { validate?: PropertyConstraint<T[]>; constraints?: Iterable<PropertyConstraint<T[]>>; itemConstraints?: Iterable<PropertyConstraint<T>>; equals?: PropertyEquality<T>; }

export class ListProperty<T> extends InstanceProperty<T[]> implements Iterable<T> {
  readonly #indexedListeners = new Set<IndexedListPropertyListener<T>>();
  readonly #itemConstraints: PropertyConstraint<T>[];

  constructor(owner: PropertyOwner, name: string, initialValue: Iterable<T> = [], options: ListPropertyOptions<T> = {}) {
    const itemEquals = options.equals ?? Object.is;
    super(owner, name, Array.from(initialValue), {
      validate: options.validate,
      constraints: options.constraints,
      clone: arrayClone,
      normalize: (value) => Array.from(value),
      equals: (left, right) => sameArray(left, right, itemEquals),
    });
    this.#itemConstraints = [...(options.itemConstraints ?? [])];
    this.#validateItems(Array.from(initialValue), 0);
  }

  get size(): number { return this.getValue().length; }
  get(index: number): T { return this.getValue()[index]; }
  toArray(): T[] { return this.getValue(); }
  addIndexedListener(listener: IndexedListPropertyListener<T>): void { this.#indexedListeners.add(listener); }
  removeIndexedListener(listener: IndexedListPropertyListener<T>): void { this.#indexedListeners.delete(listener); }
  add(...items: T[]): number { return this.addAt(this.size, ...items); }

  addAt(index: number, ...items: T[]): number {
    if (items.length === 0) return this.size;
    this.#assertIndex(index, true);
    this.#validateItems(items, index);
    const next = this.toArray(); next.splice(index, 0, ...items);
    const change = this.commitValue(next); if (!change) return this.size;
    this.emitChange(change); this.#emitIndexedChange({ ...change, kind: "add", index, added: arrayClone(items), removed: [] });
    return change.value.length;
  }

  set(index: number, ...items: T[]): boolean {
    if (items.length === 0) return false;
    this.#assertIndex(index, false);
    if (index + items.length > this.size) throw new RangeError(`Cannot replace ${items.length} item(s) at index ${index}.`);
    this.#validateItems(items, index);
    const previous = this.toArray().slice(index, index + items.length);
    const next = this.toArray(); next.splice(index, items.length, ...items);
    const change = this.commitValue(next); if (!change) return false;
    this.emitChange(change); this.#emitIndexedChange({ ...change, kind: "set", index, added: arrayClone(items), removed: previous });
    return true;
  }

  removeAt(index: number, count = 1): T[] {
    this.#assertIndex(index, false);
    if (!Number.isInteger(count) || count < 1) throw new RangeError(`Remove count must be a positive integer, got ${count}.`);
    const next = this.toArray(); const removed = next.splice(index, count);
    if (removed.length === 0) return [];
    const change = this.commitValue(next); if (!change) return [];
    this.emitChange(change); this.#emitIndexedChange({ ...change, kind: "remove", index, added: [], removed });
    return removed;
  }

  clear(): boolean {
    const removed = this.toArray(); if (removed.length === 0) return false;
    const change = this.commitValue([]); if (!change) return false;
    this.emitChange(change); this.#emitIndexedChange({ ...change, kind: "clear", index: 0, added: [], removed });
    return true;
  }

  [Symbol.iterator](): Iterator<T> { return this.toArray()[Symbol.iterator](); }

  #emitIndexedChange(event: IndexedListPropertyChangeEvent<T>): void { for (const listener of this.#indexedListeners) listener(event); }
  #validateItems(items: readonly T[], startIndex: number): void {
    for (const [offset, item] of items.entries()) {
      const reasons: string[] = [];
      for (const constraint of this.#itemConstraints) {
        const message = asConstraintMessage(constraint(item), `Item ${startIndex + offset} violates a list constraint.`);
        if (message) reasons.push(message);
      }
      if (reasons.length > 0) throw new PropertyValidationError(this.name, item, reasons.map((reason) => `[${startIndex + offset}] ${reason}`));
    }
  }
  #assertIndex(index: number, allowEnd: boolean): void {
    const upperBound = allowEnd ? this.size : this.size - 1;
    if (!Number.isInteger(index) || index < 0 || index > upperBound) throw new RangeError(`Index ${index} is out of bounds for ${this.name}.`);
  }
}
