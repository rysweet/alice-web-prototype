import type { Command, UndoRedoManager } from "./undo-redo";

export interface StateContext<TData = unknown> {
  readonly machine: StateMachine<TData>;
  readonly state: State<TData>;
  readonly previousState: State<TData> | null;
  readonly nextState: State<TData> | null;
  readonly data: TData | undefined;
  readonly deltaMs: number;
}

export interface TransitionContext<TData = unknown> {
  readonly machine: StateMachine<TData>;
  readonly from: State<TData>;
  readonly to: State<TData>;
  readonly data: TData | undefined;
  readonly deltaMs: number;
}

export interface StateCallbacks<TData = unknown> {
  readonly enter?: (context: StateContext<TData>) => void;
  readonly exit?: (context: StateContext<TData>) => void;
  readonly update?: (context: StateContext<TData>) => void;
}

export interface TransitionOptions<TData = unknown> {
  readonly from?: State<TData> | string | readonly (State<TData> | string)[] | "*";
  readonly action?: (context: TransitionContext<TData>) => void;
}

export interface StateMachineOptions<TData = unknown> {
  readonly data?: TData;
  readonly states?: readonly State<TData>[];
  readonly transitions?: readonly Transition<TData>[];
  readonly initialState?: State<TData> | string;
}

export interface SerializedStateMachine {
  readonly currentState: string | null;
  readonly compoundStates: Record<string, SerializedStateMachine>;
}

export type CompletionStatus = "idle" | "running" | "completed" | "failed";

function normalizeStateName<TData>(state: State<TData> | string): string {
  return typeof state === "string" ? state : state.name;
}

function assertStateName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new TypeError("state name must be a non-empty string");
  }
  return normalized;
}

export class State<TData = unknown> {
  readonly name: string;
  readonly #callbacks: StateCallbacks<TData>;

  constructor(name: string, callbacks: StateCallbacks<TData> = {}) {
    this.name = assertStateName(name);
    this.#callbacks = callbacks;
  }

  enter(context: StateContext<TData>): void {
    this.#callbacks.enter?.(context);
  }

  exit(context: StateContext<TData>): void {
    this.#callbacks.exit?.(context);
  }

  update(context: StateContext<TData>): void {
    this.#callbacks.update?.(context);
  }
}

export class Transition<TData = unknown> {
  readonly #from: readonly string[] | "*";
  readonly #to: string;
  readonly #condition: (context: TransitionContext<TData>) => boolean;
  readonly #action?: (context: TransitionContext<TData>) => void;

  constructor(
    from: TransitionOptions<TData>["from"],
    to: State<TData> | string,
    condition: (context: TransitionContext<TData>) => boolean,
    options: Omit<TransitionOptions<TData>, "from"> = {},
  ) {
    this.#from = from === "*"
      ? "*"
      : (Array.isArray(from) ? from : [from ?? "*"])
        .map((value) => value === "*" ? "*" : normalizeStateName(value));
    this.#to = normalizeStateName(to);
    this.#condition = condition;
    this.#action = options.action;
  }

  get to(): string {
    return this.#to;
  }

  matches(state: State<TData>): boolean {
    if (this.#from === "*") {
      return true;
    }
    return this.#from.includes("*") || this.#from.includes(state.name);
  }

  canTransition(context: TransitionContext<TData>): boolean {
    return this.#condition(context);
  }

  runAction(context: TransitionContext<TData>): void {
    this.#action?.(context);
  }
}

export class StateMachine<TData = unknown> {
  readonly #states = new Map<string, State<TData>>();
  readonly #transitions: Transition<TData>[] = [];
  readonly #initialStateName: string | null;
  currentState: State<TData> | null = null;
  data: TData | undefined;

  constructor(options: StateMachineOptions<TData> = {}) {
    this.data = options.data;
    for (const state of options.states ?? []) {
      this.addState(state);
    }
    for (const transition of options.transitions ?? []) {
      this.addTransition(transition);
    }
    this.#initialStateName = options.initialState ? normalizeStateName(options.initialState) : null;
  }

  addState(state: State<TData>): this {
    this.#states.set(state.name, state);
    return this;
  }

  addTransition(transition: Transition<TData>): this {
    this.#transitions.push(transition);
    return this;
  }

  getState(name: string): State<TData> | undefined {
    return this.#states.get(name);
  }

  listStates(): readonly State<TData>[] {
    return Array.from(this.#states.values());
  }

  start(data: TData | undefined = this.data): State<TData> | null {
    this.data = data;
    if (this.currentState) {
      return this.currentState;
    }
    const target = this.#resolveState(this.#initialStateName);
    if (!target) {
      return null;
    }
    return this.transitionTo(target, { data, deltaMs: 0, runExit: false });
  }

  stop(data: TData | undefined = this.data): void {
    if (!this.currentState) {
      return;
    }
    const current = this.currentState;
    this.currentState = null;
    current.exit({
      machine: this,
      state: current,
      previousState: current,
      nextState: null,
      data,
      deltaMs: 0,
    });
  }

  update(deltaMs = 0, data: TData | undefined = this.data): State<TData> | null {
    this.data = data;
    const state = this.currentState ?? this.start(data);
    if (!state) {
      return null;
    }
    state.update({
      machine: this,
      state,
      previousState: state,
      nextState: null,
      data,
      deltaMs,
    });
    for (const transition of this.#transitions) {
      if (!transition.matches(state)) {
        continue;
      }
      const target = this.#resolveState(transition.to);
      if (!target) {
        continue;
      }
      const context: TransitionContext<TData> = {
        machine: this,
        from: state,
        to: target,
        data,
        deltaMs,
      };
      if (transition.canTransition(context)) {
        transition.runAction(context);
        return this.transitionTo(target, { data, deltaMs, previousState: state });
      }
    }
    return state;
  }

  transitionTo(
    target: State<TData> | string,
    options: {
      readonly data?: TData;
      readonly deltaMs?: number;
      readonly previousState?: State<TData> | null;
      readonly runExit?: boolean;
    } = {},
  ): State<TData> {
    const resolved = this.#resolveState(normalizeStateName(target));
    if (!resolved) {
      throw new TypeError(`state \"${normalizeStateName(target)}\" is not registered`);
    }
    const previousState = options.previousState ?? this.currentState;
    const data = options.data ?? this.data;
    const deltaMs = options.deltaMs ?? 0;
    if (previousState && options.runExit !== false && previousState !== resolved) {
      previousState.exit({
        machine: this,
        state: previousState,
        previousState,
        nextState: resolved,
        data,
        deltaMs,
      });
    }
    this.currentState = resolved;
    resolved.enter({
      machine: this,
      state: resolved,
      previousState: previousState === resolved ? null : previousState,
      nextState: resolved,
      data,
      deltaMs,
    });
    return resolved;
  }

  restoreCurrentState(name: string | null): State<TData> | null {
    this.currentState = name === null ? null : this.#resolveState(name) ?? null;
    return this.currentState;
  }

  #resolveState(name: string | null): State<TData> | null {
    return name ? this.#states.get(name) ?? null : null;
  }
}

export class CompoundState<TData = unknown> extends State<TData> {
  constructor(
    name: string,
    public readonly stateMachine: StateMachine<TData>,
    callbacks: StateCallbacks<TData> = {},
  ) {
    super(name, callbacks);
  }

  override enter(context: StateContext<TData>): void {
    super.enter(context);
    this.stateMachine.start(context.data);
  }

  override exit(context: StateContext<TData>): void {
    this.stateMachine.stop(context.data);
    super.exit(context);
  }

  override update(context: StateContext<TData>): void {
    super.update(context);
    this.stateMachine.update(context.deltaMs, context.data);
  }
}

export class StateMachineSerializer {
  serialize<TData>(machine: StateMachine<TData>): SerializedStateMachine {
    const compoundStates: Record<string, SerializedStateMachine> = {};
    for (const state of machine.listStates()) {
      if (state instanceof CompoundState) {
        compoundStates[state.name] = this.serialize(state.stateMachine);
      }
    }
    return {
      currentState: machine.currentState?.name ?? null,
      compoundStates,
    };
  }

  restore<TData>(machine: StateMachine<TData>, serialized: SerializedStateMachine): State<TData> | null {
    const restored = machine.restoreCurrentState(serialized.currentState);
    for (const state of machine.listStates()) {
      if (!(state instanceof CompoundState)) {
        continue;
      }
      const nested = serialized.compoundStates[state.name];
      if (nested) {
        this.restore(state.stateMachine, nested);
      }
    }
    return restored;
  }
}

export class CompletionModel {
  status: CompletionStatus = "idle";
  message: string | null = null;
  error: unknown = null;
  completedSteps = 0;
  totalSteps = 0;

  constructor(public readonly name: string) {}

  get progress(): number {
    if (this.totalSteps <= 0) {
      return this.status === "completed" ? 1 : 0;
    }
    return Math.min(1, this.completedSteps / this.totalSteps);
  }

  begin(totalSteps = 1, message: string | null = null): this {
    this.status = "running";
    this.totalSteps = Math.max(0, totalSteps);
    this.completedSteps = 0;
    this.message = message;
    this.error = null;
    return this;
  }

  advance(steps = 1): this {
    this.completedSteps = Math.min(this.totalSteps || steps, this.completedSteps + steps);
    return this;
  }

  complete(message: string | null = null): this {
    this.status = "completed";
    this.completedSteps = this.totalSteps || 1;
    this.totalSteps = this.totalSteps || 1;
    this.message = message;
    this.error = null;
    return this;
  }

  fail(error: unknown): this {
    this.status = "failed";
    this.error = error;
    this.message = error instanceof Error ? error.message : String(error);
    return this;
  }

  reset(): this {
    this.status = "idle";
    this.message = null;
    this.error = null;
    this.completedSteps = 0;
    this.totalSteps = 0;
    return this;
  }
}

export interface ActionOperationOptions {
  readonly description?: string;
  readonly undoRedo?: UndoRedoManager;
  readonly completionModel?: CompletionModel;
}

export class ActionOperation {
  readonly description: string;
  readonly completionModel: CompletionModel;
  readonly #undoRedo?: UndoRedoManager;
  readonly #action: () => void;
  readonly #undoAction?: () => void;

  constructor(
    public readonly name: string,
    action: () => void,
    undoAction?: () => void,
    options: ActionOperationOptions = {},
  ) {
    this.description = options.description ?? name;
    this.completionModel = options.completionModel ?? new CompletionModel(name);
    this.#undoRedo = options.undoRedo;
    this.#action = action;
    this.#undoAction = undoAction;
  }

  perform(): void {
    const command = this.toCommand();
    if (this.#undoRedo) {
      this.#undoRedo.execute(command);
      return;
    }
    command.execute();
  }

  toCommand(): Command {
    return {
      description: this.description,
      execute: () => {
        this.completionModel.begin();
        try {
          this.#action();
          this.completionModel.complete();
        } catch (error) {
          this.completionModel.fail(error);
          throw error;
        }
      },
      undo: () => {
        this.#undoAction?.();
        this.completionModel.reset();
      },
    };
  }
}
