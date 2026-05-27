import {
  CompositeCommand,
  type Command,
  type UndoRedoManager,
} from "./undo-redo";
import { Operation } from "./croquet-action-operations";
import { Composite } from "./croquet-composite-panel";
import { State } from "./croquet-state-core";
import { ListData, TreeData, TreeNode } from "./croquet-state-list";

export interface Codec<T> {
  readonly name: string;
  encode(value: T): string;
  decode(serialized: string): T;
  appendRepresentation(value: T): string;
}

export type ItemCodec<T> = Codec<T>;

export interface ActionTrigger {
  readonly type: string;
  readonly timestamp: number;
  readonly source?: unknown;
}

export class SimulatedActionTrigger implements ActionTrigger {
  readonly type: string = "simulated";
  readonly timestamp: number;

  constructor(
    public readonly source?: unknown,
    timestamp = Date.now(),
  ) {
    this.timestamp = timestamp;
  }

  static create(source?: unknown): SimulatedActionTrigger {
    return new SimulatedActionTrigger(source);
  }
}

export class KeyPressedTrigger extends SimulatedActionTrigger {
  readonly type = "keyPressed";

  constructor(
    public readonly key: string,
    public readonly options: {
      readonly code?: string;
      readonly altKey?: boolean;
      readonly ctrlKey?: boolean;
      readonly metaKey?: boolean;
      readonly shiftKey?: boolean;
      readonly source?: unknown;
      readonly timestamp?: number;
    } = {},
  ) {
    super(options.source, options.timestamp);
  }

  get code(): string {
    return this.options.code ?? this.key;
  }

  get altKey(): boolean {
    return this.options.altKey ?? false;
  }

  get ctrlKey(): boolean {
    return this.options.ctrlKey ?? false;
  }

  get metaKey(): boolean {
    return this.options.metaKey ?? false;
  }

  get shiftKey(): boolean {
    return this.options.shiftKey ?? false;
  }

  get chord(): string {
    return [
      this.ctrlKey ? "Ctrl" : null,
      this.altKey ? "Alt" : null,
      this.shiftKey ? "Shift" : null,
      this.metaKey ? "Meta" : null,
      this.code,
    ]
      .filter((part): part is string => part !== null)
      .join("+");
  }
}

export interface StateChange<T> {
  readonly state: State<T>;
  readonly previousValue: T;
  readonly value: T;
  readonly trigger?: ActionTrigger;
}

export type StateListener<T> = (change: StateChange<T>) => void;

export interface StateOptions<T> {
  readonly name?: string;
  readonly undoRedo?: UndoRedoManager;
  readonly validate?: (value: T) => boolean;
  readonly clone?: (value: T) => T;
  readonly equals?: (left: T, right: T) => boolean;
  readonly codec?: Codec<T>;
}

export interface OperationOptions {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly undoRedo?: UndoRedoManager;
}

export type OperationResult = Command | Command[] | void;

export type OperationHandler = (trigger: ActionTrigger) => OperationResult;

export interface OperationFireEvent {
  readonly operation: Operation;
  readonly trigger: ActionTrigger;
  readonly result: OperationResult;
}

export type OperationListener = (event: OperationFireEvent) => void;

export interface ViewLifecycleEvent<TView> {
  readonly composite: Composite<TView>;
  readonly view: TView;
}

export type ListDataEventType = "add" | "remove" | "move" | "set" | "clear" | "reset";

export interface ListDataEvent<T> {
  readonly source: ListData<T>;
  readonly type: ListDataEventType;
  readonly items: readonly T[];
  readonly index?: number;
  readonly fromIndex?: number;
  readonly toIndex?: number;
  readonly previousItems?: readonly T[];
}

export type ListDataListener<T> = (event: ListDataEvent<T>) => void;

export type TreeDataEventType = "add" | "remove" | "move" | "update" | "reset";

export interface TreeDataEvent<T> {
  readonly source: TreeData<T>;
  readonly type: TreeDataEventType;
  readonly node: TreeNode<T> | null;
  readonly parent?: TreeNode<T> | null;
  readonly previousParent?: TreeNode<T> | null;
  readonly index?: number;
  readonly previousIndex?: number;
  readonly previousValue?: T;
}

export type TreeDataListener<T> = (event: TreeDataEvent<T>) => void;

export const identityClone = <T>(value: T): T => value;

export function arrayClone<T>(value: readonly T[]): readonly T[] {
  return [...value];
}

export function arrayEquals<T>(
  left: readonly T[],
  right: readonly T[],
  equals: (leftValue: T, rightValue: T) => boolean,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => equals(value, right[index]));
}

export function normalizeIndex(index: number, length: number, allowEnd = true): number {
  const upperBound = allowEnd ? length : Math.max(0, length - 1);
  return Math.max(0, Math.min(index, upperBound));
}

export function codecEquals<T>(codec?: Codec<T>): (left: T, right: T) => boolean {
  return (left, right) => {
    if (Object.is(left, right)) {
      return true;
    }
    if (!codec) {
      return false;
    }
    return codec.encode(left) === codec.encode(right);
  };
}

export class StateCommand<T> implements Command {
  constructor(
    private readonly state: State<T>,
    private readonly previousValue: T,
    private readonly nextValue: T,
    private readonly trigger?: ActionTrigger,
  ) {}

  get description(): string {
    return `Set ${this.state.name}`;
  }

  execute(): void {
    this.state.applyValue(this.nextValue, this.trigger);
  }

  undo(): void {
    this.state.applyValue(this.previousValue, this.trigger);
  }
}

export class NullableCodec<T> implements Codec<T | null> {
  readonly name: string;

  constructor(private readonly baseCodec: Codec<T>) {
    this.name = `${baseCodec.name}?`;
  }

  encode(value: T | null): string {
    return value === null ? "__null__" : this.baseCodec.encode(value);
  }

  decode(serialized: string): T | null {
    return serialized === "__null__" ? null : this.baseCodec.decode(serialized);
  }

  appendRepresentation(value: T | null): string {
    return value === null ? "null" : this.baseCodec.appendRepresentation(value);
  }
}

export class ArrayCodec<T> implements Codec<readonly T[]> {
  readonly name: string;

  constructor(private readonly itemCodec: Codec<T>) {
    this.name = `${itemCodec.name}[]`;
  }

  encode(value: readonly T[]): string {
    return JSON.stringify(value.map((item) => this.itemCodec.encode(item)));
  }

  decode(serialized: string): readonly T[] {
    return (JSON.parse(serialized) as string[]).map((item) => this.itemCodec.decode(item));
  }

  appendRepresentation(value: readonly T[]): string {
    return `[${value.map((item) => this.itemCodec.appendRepresentation(item)).join(", ")}]`;
  }
}

class JsonCodec<T> implements Codec<T> {
  readonly name: string;

  constructor(name = "json") {
    this.name = name;
  }

  encode(value: T): string {
    return JSON.stringify(value);
  }

  decode(serialized: string): T {
    return JSON.parse(serialized) as T;
  }

  appendRepresentation(value: T): string {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
}

export function defaultCodecFactory<T>(): Codec<T> {
  return new JsonCodec<T>();
}

export function lookupCodecFactory<T>(
  name: string,
  lookup: () => readonly T[],
  keyOf: (value: T) => string,
): Codec<T> {
  return {
    name,
    encode: (value) => keyOf(value),
    decode: (serialized) => {
      const match = lookup().find((candidate) => keyOf(candidate) === serialized);
      if (match === undefined) {
        throw new TypeError(`invalid ${name} encoding: ${serialized}`);
      }
      return match;
    },
    appendRepresentation: (value) => keyOf(value),
  };
}

export const booleanCodec: Codec<boolean> = {
  name: "boolean",
  encode: (value) => (value ? "true" : "false"),
  decode: (serialized) => {
    if (serialized !== "true" && serialized !== "false") {
      throw new TypeError(`invalid boolean encoding: ${serialized}`);
    }
    return serialized === "true";
  },
  appendRepresentation: (value) => String(value),
};

export const doubleCodec: Codec<number> = {
  name: "double",
  encode: (value) => {
    if (!Number.isFinite(value)) {
      throw new TypeError(`cannot encode non-finite double ${value}`);
    }
    return JSON.stringify(value);
  },
  decode: (serialized) => {
    const value = Number.parseFloat(serialized);
    if (!Number.isFinite(value)) {
      throw new TypeError(`invalid double encoding: ${serialized}`);
    }
    return value;
  },
  appendRepresentation: (value) => `${value}`,
};

export class StringCodec implements Codec<string> {
  readonly name = "string";

  encode(value: string): string {
    return JSON.stringify(value);
  }

  decode(serialized: string): string {
    return JSON.parse(serialized) as string;
  }

  appendRepresentation(value: string): string {
    return value;
  }
}

export class IntegerCodec implements Codec<number> {
  readonly name = "integer";

  encode(value: number): string {
    if (!Number.isInteger(value)) {
      throw new TypeError(`cannot encode non-integer ${value}`);
    }
    return `${value}`;
  }

  decode(serialized: string): number {
    const value = Number.parseInt(serialized, 10);
    if (!Number.isInteger(value) || `${value}` !== serialized.trim()) {
      throw new TypeError(`invalid integer encoding: ${serialized}`);
    }
    return value;
  }

  appendRepresentation(value: number): string {
    return `${value}`;
  }
}

export class EnumCodec<T extends string | number> implements Codec<T> {
  readonly name: string;
  private readonly decodeMap = new Map<string, T>();

  constructor(
    private readonly values: readonly T[],
    private readonly options: {
      readonly name?: string;
      readonly localization?: Partial<Record<`${T}`, string>>;
    } = {},
  ) {
    this.name = options.name ?? "enum";
    for (const value of values) {
      this.decodeMap.set(`${value}`, value);
    }
  }

  encode(value: T): string {
    if (!this.decodeMap.has(`${value}`)) {
      throw new TypeError(`unknown enum value: ${value}`);
    }
    return `${value}`;
  }

  decode(serialized: string): T {
    const value = this.decodeMap.get(serialized);
    if (value === undefined) {
      throw new TypeError(`invalid enum encoding: ${serialized}`);
    }
    return value;
  }

  appendRepresentation(value: T): string {
    return this.options.localization?.[`${value}`] ?? `${value}`;
  }
}
