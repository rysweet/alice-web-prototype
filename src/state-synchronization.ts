export type StatePrimitive = string | number | boolean | null;
export type StateValue = StatePrimitive | StateValue[] | { [key: string]: StateValue };
export type StateObject = { [key: string]: StateValue };
export type StateUpdater<T extends StateObject> = ((draft: T) => T | void) | Partial<T>;
export type StateRule<T extends StateObject> = (state: T) => boolean | string;
export type StateListener<T extends StateObject> = (change: StateChange<T>) => void;

export interface StatePatchOperation {
  readonly op: "set" | "remove";
  readonly path: string;
  readonly value?: StateValue;
  readonly previousValue?: StateValue;
}

export interface StateChange<T extends StateObject> {
  readonly previousState: T;
  readonly nextState: T;
  readonly patch: readonly StatePatchOperation[];
  readonly changedPaths: readonly string[];
  readonly version: number;
  readonly label: string | null;
}

export interface StateHistoryOptions<T extends StateObject> {
  readonly maxSnapshots?: number;
  readonly initialState: T;
}

export interface StateStoreOptions<T extends StateObject> {
  readonly validator?: StateValidator<T>;
  readonly history?: StateHistory<T>;
}

export interface StatePersistenceOptions {
  readonly storageKey: string;
  readonly localStorage?: StringStorageLike | null;
  readonly indexedDbStore?: AsyncStateStorageLike | null;
}

export interface StringStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AsyncStateStorageLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class StatePatch {
  static diff(previousState: StateValue, nextState: StateValue): StatePatchOperation[] {
    return diffValues(previousState, nextState, "$");
  }

  static apply<T extends StateValue>(state: T, patch: readonly StatePatchOperation[]): T {
    const draft = cloneState(state);
    for (const operation of patch) {
      applyOperation(draft, operation);
    }
    return draft;
  }
}

export class StateSubscription {
  private active = true;

  constructor(private readonly cancel: () => void) {}

  get isActive(): boolean {
    return this.active;
  }

  unsubscribe(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.cancel();
  }
}

export class StateValidator<T extends StateObject> {
  private readonly rules = new Map<string, StateRule<T>>();

  addRule(name: string, rule: StateRule<T>): this {
    this.rules.set(name, rule);
    return this;
  }

  validate(state: T): string[] {
    const issues: string[] = [];
    for (const [name, rule] of this.rules.entries()) {
      const result = rule(state);
      if (result === true) {
        continue;
      }
      if (typeof result === "string") {
        issues.push(result);
        continue;
      }
      issues.push(`${name} failed`);
    }
    return issues;
  }

  assert(state: T): void {
    const issues = this.validate(state);
    if (issues.length > 0) {
      throw new Error(`State validation failed: ${issues.join("; ")}`);
    }
  }
}

export class StateHistory<T extends StateObject> {
  private readonly maxSnapshots: number;
  private readonly past: T[] = [];
  private readonly future: T[] = [];
  private current: T;

  constructor(options: StateHistoryOptions<T>) {
    this.maxSnapshots = Math.max(1, options.maxSnapshots ?? 50);
    this.current = cloneState(options.initialState);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  snapshot(): T {
    return cloneState(this.current);
  }

  record(nextState: T): void {
    if (deepEqual(this.current, nextState)) {
      return;
    }
    this.past.push(cloneState(this.current));
    if (this.past.length > this.maxSnapshots) {
      this.past.splice(0, this.past.length - this.maxSnapshots);
    }
    this.current = cloneState(nextState);
    this.future.length = 0;
  }

  undo(): T | null {
    const previous = this.past.pop();
    if (!previous) {
      return null;
    }
    this.future.push(cloneState(this.current));
    this.current = cloneState(previous);
    return this.snapshot();
  }

  redo(): T | null {
    const next = this.future.pop();
    if (!next) {
      return null;
    }
    this.past.push(cloneState(this.current));
    this.current = cloneState(next);
    return this.snapshot();
  }
}

export class StateStore<T extends StateObject> {
  private state: T;
  private readonly listeners = new Set<StateListener<T>>();
  private readonly validator?: StateValidator<T>;
  private readonly history?: StateHistory<T>;
  private currentVersion = 0;

  constructor(initialState: T, options: StateStoreOptions<T> = {}) {
    this.state = cloneState(initialState);
    this.validator = options.validator;
    this.history = options.history;
    this.validator?.assert(this.state);
  }

  get version(): number {
    return this.currentVersion;
  }

  getState(): T {
    return cloneState(this.state);
  }

  subscribe(listener: StateListener<T>): StateSubscription {
    this.listeners.add(listener);
    return new StateSubscription(() => {
      this.listeners.delete(listener);
    });
  }

  update(updater: StateUpdater<T>, label: string | null = null): StateChange<T> {
    const draft = cloneState(this.state);
    const nextState = typeof updater === "function"
      ? cloneState((updater(draft) ?? draft) as T)
      : ({ ...draft, ...updater } as T);
    return this.commit(nextState, label);
  }

  replace(nextState: T, label: string | null = null): StateChange<T> {
    return this.commit(cloneState(nextState), label);
  }

  applyPatch(patch: readonly StatePatchOperation[], label: string | null = null): StateChange<T> {
    const nextState = StatePatch.apply(this.state, patch) as T;
    return this.commit(nextState, label);
  }

  private commit(nextState: T, label: string | null): StateChange<T> {
    this.validator?.assert(nextState);
    const previousState = cloneState(this.state);
    const patch = StatePatch.diff(previousState, nextState);
    const changedPaths = patch.map((operation) => operation.path);

    if (patch.length > 0) {
      this.state = cloneState(nextState);
      this.currentVersion += 1;
      this.history?.record(this.state);
    }

    const change: StateChange<T> = {
      previousState,
      nextState: this.getState(),
      patch,
      changedPaths,
      version: this.currentVersion,
      label,
    };

    for (const listener of this.listeners) {
      listener(change);
    }

    return change;
  }
}

export class StatePersistence<T extends StateObject> {
  constructor(private readonly options: StatePersistenceOptions) {}

  async save(state: T): Promise<void> {
    const serialized = JSON.stringify(state);
    this.options.localStorage?.setItem(this.options.storageKey, serialized);
    await this.options.indexedDbStore?.set(this.options.storageKey, serialized);
  }

  async load(): Promise<T | null> {
    const indexedDbValue = await this.options.indexedDbStore?.get(this.options.storageKey);
    if (indexedDbValue != null) {
      return JSON.parse(indexedDbValue) as T;
    }

    const storedValue = this.options.localStorage?.getItem(this.options.storageKey);
    return storedValue == null ? null : (JSON.parse(storedValue) as T);
  }

  async restore(): Promise<T | null> {
    return this.load();
  }

  async clear(): Promise<void> {
    this.options.localStorage?.removeItem(this.options.storageKey);
    await this.options.indexedDbStore?.delete(this.options.storageKey);
  }
}

function diffValues(previousValue: StateValue, nextValue: StateValue, path: string): StatePatchOperation[] {
  if (deepEqual(previousValue, nextValue)) {
    return [];
  }

  if (Array.isArray(previousValue) && Array.isArray(nextValue)) {
    const operations: StatePatchOperation[] = [];
    const maxLength = Math.max(previousValue.length, nextValue.length);
    for (let index = 0; index < maxLength; index += 1) {
      const nextPath = `${path}[${index}]`;
      if (index >= nextValue.length) {
        operations.push({
          op: "remove",
          path: nextPath,
          previousValue: cloneState(previousValue[index]),
        });
      } else if (index >= previousValue.length) {
        operations.push({
          op: "set",
          path: nextPath,
          value: cloneState(nextValue[index]),
        });
      } else {
        operations.push(...diffValues(previousValue[index], nextValue[index], nextPath));
      }
    }
    return operations;
  }

  if (isRecord(previousValue) && isRecord(nextValue)) {
    if (hasUnsafePathSegmentKey(previousValue) || hasUnsafePathSegmentKey(nextValue)) {
      return [{
        op: "set",
        path,
        value: cloneState(nextValue),
        previousValue: cloneState(previousValue),
      }];
    }

    const operations: StatePatchOperation[] = [];
    const previousKeys = Object.keys(previousValue);
    const nextKeys = Object.keys(nextValue);
    const seenKeys = new Set<string>();

    for (const key of previousKeys) {
      seenKeys.add(key);
      if (!(key in nextValue)) {
        operations.push({
          op: "remove",
          path: appendPath(path, key),
          previousValue: cloneState(previousValue[key]),
        });
      } else {
        operations.push(...diffValues(previousValue[key], nextValue[key], appendPath(path, key)));
      }
    }

    for (const key of nextKeys) {
      if (seenKeys.has(key)) {
        continue;
      }
      operations.push({
        op: "set",
        path: appendPath(path, key),
        value: cloneState(nextValue[key]),
      });
    }

    return operations;
  }

  return [{
    op: "set",
    path,
    value: cloneState(nextValue),
    previousValue: cloneState(previousValue),
  }];
}

function applyOperation(target: StateValue, operation: StatePatchOperation): void {
  const tokens = parsePath(operation.path);
  assertSafePathSegments(tokens);
  if (tokens.length === 0) {
    if (operation.op !== "set") {
      throw new Error("Cannot remove the root state.");
    }
    replaceRoot(target, cloneState(operation.value ?? null));
    return;
  }

  const parentTokens = tokens.slice(0, -1);
  const finalToken = tokens[tokens.length - 1];
  const parent = navigate(target, parentTokens, operation.op === "set");

  if (parent == null) {
    return;
  }

  if (Array.isArray(parent) && typeof finalToken === "number") {
    if (operation.op === "remove") {
      parent.splice(finalToken, 1);
    } else {
      parent[finalToken] = cloneState(operation.value ?? null);
    }
    return;
  }

  if (isRecord(parent) && typeof finalToken === "string") {
    if (operation.op === "remove") {
      delete parent[finalToken];
    } else {
      parent[finalToken] = cloneState(operation.value ?? null);
    }
  }
}

function replaceRoot(target: StateValue, nextValue: StateValue): void {
  if (Array.isArray(target) && Array.isArray(nextValue)) {
    target.splice(0, target.length, ...cloneState(nextValue));
    return;
  }

  if (isRecord(target) && isRecord(nextValue)) {
    for (const key of Object.keys(target)) {
      delete target[key];
    }
    for (const [key, value] of Object.entries(nextValue)) {
      defineStateDataProperty(target, key, cloneState(value));
    }
    return;
  }

  throw new Error("Root replacement requires matching container types.");
}

function defineStateDataProperty(target: { [key: string]: StateValue }, key: string, value: StateValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function navigate(target: StateValue, tokens: Array<string | number>, createMissing: boolean): StateValue | null {
  let current: StateValue = target;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];

    if (Array.isArray(current) && typeof token === "number") {
      if (current[token] === undefined && createMissing) {
        current[token] = typeof nextToken === "number" ? [] : {};
      }
      current = current[token] as StateValue;
      continue;
    }

    if (isRecord(current) && typeof token === "string") {
      if (current[token] === undefined && createMissing) {
        current[token] = (typeof nextToken === "number" ? [] : {}) as StateValue;
      }
      current = current[token] as StateValue;
      continue;
    }

    return null;
  }

  return current;
}

function appendPath(basePath: string, key: string): string {
  return basePath === "$" ? `$.${key}` : `${basePath}.${key}`;
}

function parsePath(path: string): Array<string | number> {
  if (path === "$") {
    return [];
  }

  const tokens: Array<string | number> = [];
  let cursor = 1;
  while (cursor < path.length) {
    const currentCharacter = path[cursor];
    if (currentCharacter === ".") {
      cursor += 1;
      let end = cursor;
      while (end < path.length && path[end] !== "." && path[end] !== "[") {
        end += 1;
      }
      tokens.push(path.slice(cursor, end));
      cursor = end;
      continue;
    }
    if (currentCharacter === "[") {
      const closingBracket = path.indexOf("]", cursor);
      const rawIndex = path.slice(cursor + 1, closingBracket);
      assertSafePathSegment(rawIndex);
      tokens.push(Number(rawIndex));
      cursor = closingBracket + 1;
      continue;
    }
    cursor += 1;
  }
  return tokens;
}

function assertSafePathSegments(tokens: Array<string | number>): void {
  for (const token of tokens) {
    if (typeof token !== "string") {
      continue;
    }
    assertSafePathSegment(token);
  }
}

function assertSafePathSegment(segment: string): void {
  if (segment === "__proto__" || segment === "constructor" || segment === "prototype") {
    throw new Error(`Unsafe state patch path segment: ${segment}`);
  }
}

function hasUnsafePathSegmentKey(value: { [key: string]: StateValue }): boolean {
  return Object.keys(value).some((key) => key === "__proto__" || key === "constructor" || key === "prototype");
}

function cloneState<T extends StateValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepEqual(left: StateValue, right: StateValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: StateValue): value is { [key: string]: StateValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
