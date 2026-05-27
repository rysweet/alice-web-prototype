import { ActionTrigger, Codec, IntegerCodec, StateChange, StateCommand, StateListener, StateOptions, StringCodec, booleanCodec, codecEquals, doubleCodec, identityClone } from "./croquet-codec-core";

export class State<T> {
  private readonly listeners = new Set<StateListener<T>>();
  private readonly changingListeners = new Set<StateListener<T>>();
  private readonly validateValue: (value: T) => boolean;
  private readonly cloneValue: (value: T) => T;
  private readonly valuesEqual: (left: T, right: T) => boolean;
  protected currentValue: T;

  constructor(initialValue: T, private readonly options: StateOptions<T> = {}) {
    this.validateValue = options.validate ?? (() => true);
    this.cloneValue = options.clone ?? identityClone;
    this.valuesEqual = options.equals ?? codecEquals(options.codec);
    if (!this.validateValue(initialValue)) {
      throw new TypeError(`invalid initial value for ${this.name}`);
    }
    this.currentValue = this.cloneValue(initialValue);
  }

  get name(): string {
    return this.options.name ?? "state";
  }

  get codec(): Codec<T> | undefined {
    return this.options.codec;
  }

  get value(): T {
    return this.cloneValue(this.currentValue);
  }

  set value(nextValue: T) {
    this.setValue(nextValue);
  }

  get hasCodec(): boolean {
    return this.codec !== undefined;
  }

  addListener(listener: StateListener<T>): void {
    this.listeners.add(listener);
  }

  removeListener(listener: StateListener<T>): void {
    this.listeners.delete(listener);
  }

  addChangingListener(listener: StateListener<T>): void {
    this.changingListeners.add(listener);
  }

  removeChangingListener(listener: StateListener<T>): void {
    this.changingListeners.delete(listener);
  }

  setValue(nextValue: T, trigger?: ActionTrigger): void {
    if (!this.validateValue(nextValue)) {
      throw new TypeError(`invalid value for ${this.name}`);
    }
    const normalizedNextValue = this.cloneValue(nextValue);
    if (this.valuesEqual(this.currentValue, normalizedNextValue)) {
      return;
    }
    const previousValue = this.cloneValue(this.currentValue);
    if (this.options.undoRedo) {
      this.options.undoRedo.execute(
        new StateCommand(this, previousValue, normalizedNextValue, trigger),
      );
      return;
    }
    this.applyValue(normalizedNextValue, trigger);
  }

  applyValue(nextValue: T, trigger?: ActionTrigger): void {
    if (!this.validateValue(nextValue)) {
      throw new TypeError(`invalid value for ${this.name}`);
    }
    const normalizedNextValue = this.cloneValue(nextValue);
    if (this.valuesEqual(this.currentValue, normalizedNextValue)) {
      return;
    }
    const previousValue = this.cloneValue(this.currentValue);
    const changingEvent: StateChange<T> = {
      state: this,
      previousValue,
      value: this.cloneValue(normalizedNextValue),
      trigger,
    };
    for (const listener of this.changingListeners) {
      listener(changingEvent);
    }
    this.currentValue = normalizedNextValue;
    const changedEvent: StateChange<T> = {
      state: this,
      previousValue,
      value: this.cloneValue(normalizedNextValue),
      trigger,
    };
    for (const listener of this.listeners) {
      listener(changedEvent);
    }
  }

  serializeValue(value = this.currentValue): string {
    if (!this.codec) {
      throw new Error(`${this.name} does not have an associated codec`);
    }
    return this.codec.encode(value);
  }

  restoreValue(serialized: string, trigger?: ActionTrigger): void {
    if (!this.codec) {
      throw new Error(`${this.name} does not have an associated codec`);
    }
    this.setValue(this.codec.decode(serialized), trigger);
  }

  appendRepresentation(value = this.currentValue): string {
    return this.codec?.appendRepresentation(value) ?? `${value}`;
  }
}

export class StringState extends State<string> {
  textForBlankCondition: string | null = null;

  constructor(initialValue = "", options: Omit<StateOptions<string>, "validate" | "codec"> = {}) {
    super(initialValue, {
      ...options,
      codec: new StringCodec(),
      validate: (value) => typeof value === "string",
    });
  }

  get isBlank(): boolean {
    return this.value.trim().length === 0;
  }
}

export class BooleanState extends State<boolean> {
  private trueText = "true";
  private falseText = "false";

  constructor(initialValue = false, options: Omit<StateOptions<boolean>, "validate" | "codec"> = {}) {
    super(initialValue, {
      ...options,
      codec: booleanCodec,
      validate: (value) => typeof value === "boolean",
    });
  }

  toggle(trigger?: ActionTrigger): void {
    this.setValue(!this.value, trigger);
  }

  getTextFor(value: boolean): string {
    return value ? this.trueText : this.falseText;
  }

  setTextForBothTrueAndFalse(text: string): void {
    this.trueText = text;
    this.falseText = text;
  }

  setTextForTrueAndTextForFalse(trueText: string, falseText: string): void {
    this.trueText = trueText;
    this.falseText = falseText;
  }
}

export class IntegerState extends State<number> {
  constructor(initialValue = 0, options: Omit<StateOptions<number>, "validate" | "codec"> = {}) {
    super(initialValue, {
      ...options,
      codec: new IntegerCodec(),
      validate: Number.isInteger,
    });
  }
}

export class DoubleState extends State<number> {
  constructor(initialValue = 0, options: Omit<StateOptions<number>, "validate" | "codec"> = {}) {
    super(initialValue, {
      ...options,
      codec: doubleCodec,
      validate: Number.isFinite,
    });
  }
}
