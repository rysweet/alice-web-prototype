import { InstanceProperty, PropertyValidationError, asConstraintMessage, sameSet, setClone, type PropertyChangeEvent, type PropertyConstraint } from "./core.js";
import type { PropertyOwner } from "./core.js";

export interface SetPropertyChangeEvent<T> extends PropertyChangeEvent<Set<T>> { kind: "add" | "remove" | "clear"; values: readonly T[]; }
export type SetPropertyListener<T> = (event: SetPropertyChangeEvent<T>) => void;
export interface SetPropertyOptions<T> { validate?: PropertyConstraint<Set<T>>; constraints?: Iterable<PropertyConstraint<Set<T>>>; itemConstraints?: Iterable<PropertyConstraint<T>>; }

export class SetProperty<T> extends InstanceProperty<Set<T>> implements Iterable<T> {
  readonly #setListeners = new Set<SetPropertyListener<T>>();
  readonly #itemConstraints: PropertyConstraint<T>[];

  constructor(owner: PropertyOwner, name: string, initialValue: Iterable<T> = [], options: SetPropertyOptions<T> = {}) {
    const initialSet = new Set(initialValue);
    super(owner, name, initialSet, {
      validate: options.validate,
      constraints: options.constraints,
      clone: setClone,
      normalize: (value) => new Set(value),
      equals: sameSet,
    });
    this.#itemConstraints = [...(options.itemConstraints ?? [])];
    this.#validateItems(initialSet);
  }

  get size(): number { return this.getValue().size; }
  has(value: T): boolean { return this.getValue().has(value); }
  toArray(): T[] { return [...this.getValue()]; }
  addSetListener(listener: SetPropertyListener<T>): void { this.#setListeners.add(listener); }
  removeSetListener(listener: SetPropertyListener<T>): void { this.#setListeners.delete(listener); }

  add(...values: T[]): number {
    if (values.length === 0) return this.size;
    this.#validateItems(values);
    const next = this.getValue(); const added: T[] = [];
    for (const value of values) if (!next.has(value)) { next.add(value); added.push(value); }
    if (added.length === 0) return this.size;
    const change = this.commitValue(next); if (!change) return this.size;
    this.emitChange(change); this.#emitSetChange({ ...change, kind: "add", values: added });
    return change.value.size;
  }

  remove(...values: T[]): T[] {
    if (values.length === 0) return [];
    const next = this.getValue(); const removed: T[] = [];
    for (const value of values) if (next.delete(value)) removed.push(value);
    if (removed.length === 0) return [];
    const change = this.commitValue(next); if (!change) return [];
    this.emitChange(change); this.#emitSetChange({ ...change, kind: "remove", values: removed });
    return removed;
  }

  clear(): boolean {
    const removed = this.toArray(); if (removed.length === 0) return false;
    const change = this.commitValue(new Set<T>()); if (!change) return false;
    this.emitChange(change); this.#emitSetChange({ ...change, kind: "clear", values: removed });
    return true;
  }

  [Symbol.iterator](): Iterator<T> { return this.getValue()[Symbol.iterator](); }
  #emitSetChange(event: SetPropertyChangeEvent<T>): void { for (const listener of this.#setListeners) listener(event); }
  #validateItems(values: Iterable<T>): void {
    for (const value of values) {
      const reasons: string[] = [];
      for (const constraint of this.#itemConstraints) {
        const message = asConstraintMessage(constraint(value), `Set value for "${this.name}" violates a constraint.`);
        if (message) reasons.push(message);
      }
      if (reasons.length > 0) throw new PropertyValidationError(this.name, value, reasons);
    }
  }
}
