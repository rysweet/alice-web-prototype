export type PropertyConstraintResult = boolean | string | void;
export type PropertyConstraint<T> = (value: T) => PropertyConstraintResult;
export type PropertyEquality<T> = (left: T, right: T) => boolean;
export type PropertyClone<T> = (value: T) => T;
export type PropertyNormalize<T> = (value: T) => T;

export interface PropertyChangeEvent<T> {
  property: InstanceProperty<T>;
  owner: PropertyOwner;
  name: string;
  previousValue: T;
  value: T;
}

export type PropertyListener<T> = (event: PropertyChangeEvent<T>) => void;

export interface PropertyOwner {
  registerProperty(property: InstanceProperty<any>): void;
  getProperties(): Iterable<InstanceProperty<any>>;
  getPropertyNamed(name: string): InstanceProperty<any> | undefined;
  lookupNameFor(property: InstanceProperty<any>): string | undefined;
}

export class PropertyOwnerBase implements PropertyOwner {
  readonly #properties = new Map<string, InstanceProperty<any>>();
  registerProperty(property: InstanceProperty<any>): void {
    const existing = this.#properties.get(property.name);
    if (existing && existing !== property) {
      throw new Error(`Property "${property.name}" is already registered.`);
    }
    this.#properties.set(property.name, property);
  }
  getProperties(): Iterable<InstanceProperty<any>> { return this.#properties.values(); }
  getPropertyNamed(name: string): InstanceProperty<any> | undefined { return this.#properties.get(name); }
  lookupNameFor(property: InstanceProperty<any>): string | undefined {
    for (const [name, candidate] of this.#properties.entries()) if (candidate === property) return name;
    return undefined;
  }
}

export class PropertyValidationError extends TypeError {
  constructor(readonly propertyName: string, readonly value: unknown, readonly reasons: readonly string[]) {
    super(`Invalid value for property "${propertyName}": ${reasons.join("; ")}`);
    this.name = "PropertyValidationError";
  }
}

export interface InstancePropertyOptions<T> {
  validate?: PropertyConstraint<T>;
  constraints?: Iterable<PropertyConstraint<T>>;
  clone?: PropertyClone<T>;
  equals?: PropertyEquality<T>;
  normalize?: PropertyNormalize<T>;
}

function identityClone<T>(value: T): T { return value; }
export function arrayClone<T>(value: readonly T[]): T[] { return [...value]; }
export function setClone<T>(value: ReadonlySet<T>): Set<T> { return new Set(value); }
export function sameArray<T>(left: readonly T[], right: readonly T[], equals: PropertyEquality<T> = Object.is): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (!equals(left[index], right[index])) return false;
  return true;
}
export function sameSet<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}
export function asConstraintMessage(result: PropertyConstraintResult, fallback: string): string | null {
  if (result === false) return fallback;
  if (typeof result === "string") return result;
  return null;
}

export class InstanceProperty<T> {
  readonly #listeners = new Set<PropertyListener<T>>();
  readonly #validate: PropertyConstraint<T> | undefined;
  readonly #constraints: PropertyConstraint<T>[];
  readonly #clone: PropertyClone<T>;
  readonly #equals: PropertyEquality<T>;
  readonly #normalize: PropertyNormalize<T> | undefined;
  #value: T;

  constructor(readonly owner: PropertyOwner, readonly name: string, initialValue: T, options: InstancePropertyOptions<T> = {}) {
    this.#validate = options.validate;
    this.#constraints = [...(options.constraints ?? [])];
    this.#clone = options.clone ?? identityClone;
    this.#equals = options.equals ?? Object.is;
    this.#normalize = options.normalize;
    this.#value = this.#prepare(initialValue);
    this.owner.registerProperty(this);
  }

  get value(): T { return this.getValue(); }
  set value(nextValue: T) { this.setValue(nextValue); }
  getValue(): T { return this.#clone(this.#value); }

  setValue(nextValue: T): boolean {
    const event = this.commitValue(nextValue);
    if (!event) return false;
    this.emitChange(event);
    return true;
  }

  addListener(listener: PropertyListener<T>): void { this.#listeners.add(listener); }
  removeListener(listener: PropertyListener<T>): void { this.#listeners.delete(listener); }

  protected commitValue(nextValue: T): PropertyChangeEvent<T> | null {
    const normalizedNextValue = this.#prepare(nextValue);
    if (this.#equals(this.#value, normalizedNextValue)) return null;
    const previousValue = this.#clone(this.#value);
    this.#value = normalizedNextValue;
    return { property: this, owner: this.owner, name: this.name, previousValue, value: this.#clone(this.#value) };
  }

  protected emitChange(event: PropertyChangeEvent<T>): void {
    for (const listener of this.#listeners) listener(event);
  }

  protected cloneValue(value: T): T { return this.#clone(value); }

  #prepare(nextValue: T): T {
    const normalizedValue = this.#clone(this.#normalize ? this.#normalize(nextValue) : nextValue);
    const reasons: string[] = [];
    const validationMessage = asConstraintMessage(this.#validate?.(normalizedValue), `Value for "${this.name}" failed validation.`);
    if (validationMessage) reasons.push(validationMessage);
    for (const constraint of this.#constraints) {
      const message = asConstraintMessage(constraint(normalizedValue), `Value for "${this.name}" violates a constraint.`);
      if (message) reasons.push(message);
    }
    if (reasons.length > 0) {
      throw new PropertyValidationError(this.name, nextValue, reasons);
    }
    return normalizedValue;
  }
}
