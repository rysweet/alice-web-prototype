export type MaybePromise<T> = T | Promise<T>;

export type StatementHandler<Statement, State> = (statement: Statement, state: State) => MaybePromise<void>;
export type IterationHandler<State> = (iteration: number, state: State) => MaybePromise<void>;
export type ArrayIterationHandler<Item, State> = (item: Item, index: number, state: State) => MaybePromise<void>;

export class DoInOrderExecutor<Statement, State> {
  constructor(private readonly executeStatement: StatementHandler<Statement, State>) {}

  async execute(statements: readonly Statement[], state: State): Promise<void> {
    for (const statement of statements) {
      await this.executeStatement(statement, state);
    }
  }
}

export class DoTogetherExecutor<Statement, State> {
  constructor(private readonly executeStatement: StatementHandler<Statement, State>) {}

  async execute(statements: readonly Statement[], state: State): Promise<void> {
    await Promise.all(statements.map((statement) => this.executeStatement(statement, state)));
  }
}

export class CountLoopExecutor<State> {
  constructor(private readonly executeIteration: IterationHandler<State>) {}

  async execute(count: number, state: State): Promise<number> {
    const total = Math.max(0, Math.floor(count));
    for (let index = 0; index < total; index += 1) {
      await this.executeIteration(index, state);
    }
    return total;
  }
}

export class WhileLoopExecutor<State> {
  constructor(
    private readonly evaluateCondition: (state: State) => MaybePromise<boolean>,
    private readonly executeIteration: IterationHandler<State>,
    private readonly maxIterations = 10_000,
  ) {}

  async execute(state: State): Promise<number> {
    let iterations = 0;
    while (await this.evaluateCondition(state)) {
      if (iterations >= this.maxIterations) {
        throw new Error(`while loop exceeded ${this.maxIterations} iterations`);
      }
      await this.executeIteration(iterations, state);
      iterations += 1;
    }
    return iterations;
  }
}

export class ForEachInArrayExecutor<Item, State> {
  constructor(private readonly executeIteration: ArrayIterationHandler<Item, State>) {}

  async execute(items: readonly Item[], state: State): Promise<number> {
    for (const [index, item] of items.entries()) {
      await this.executeIteration(item, index, state);
    }
    return items.length;
  }
}

export class ForEachTogetherExecutor<Item, State> {
  constructor(private readonly executeIteration: ArrayIterationHandler<Item, State>) {}

  async execute(items: readonly Item[], state: State): Promise<number> {
    await Promise.all(items.map((item, index) => this.executeIteration(item, index, state)));
    return items.length;
  }
}

export class IfElseExecutor<State> {
  constructor(
    private readonly executeIfTrue: (state: State) => MaybePromise<void>,
    private readonly executeIfFalse: (state: State) => MaybePromise<void> = async () => undefined,
  ) {}

  async execute(condition: boolean | Promise<boolean>, state: State): Promise<boolean> {
    if (await Promise.resolve(condition)) {
      await this.executeIfTrue(state);
      return true;
    }
    await this.executeIfFalse(state);
    return false;
  }
}

export class ReturnSignal<T = unknown> extends Error {
  constructor(public readonly value: T) {
    super("return");
    this.name = "ReturnSignal";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ReturnExecutor<T = unknown> {
  return(value: T): never {
    throw new ReturnSignal(value);
  }

  capture<TResult>(body: () => TResult): TResult | T {
    try {
      return body();
    } catch (error) {
      if (error instanceof ReturnSignal) {
        return error.value as T;
      }
      throw error;
    }
  }

  static isReturnSignal<T = unknown>(value: unknown): value is ReturnSignal<T> {
    return value instanceof ReturnSignal;
  }
}

export class LocalVariableScope {
  readonly #locals = new Map<string, unknown>();

  constructor(
    private readonly parent: LocalVariableScope | null = null,
    initialValues: Record<string, unknown> = {},
  ) {
    for (const [name, value] of Object.entries(initialValues)) {
      this.#locals.set(name, value);
    }
  }

  create<T>(name: string, value: T): T {
    if (this.#locals.has(name)) {
      throw new Error(`local variable '${name}' is already defined in this scope`);
    }
    this.#locals.set(name, value);
    return value;
  }

  read<T>(name: string): T {
    if (this.#locals.has(name)) {
      return this.#locals.get(name) as T;
    }
    if (this.parent) {
      return this.parent.read<T>(name);
    }
    throw new ReferenceError(`unknown local variable '${name}'`);
  }

  write<T>(name: string, value: T): T {
    if (this.#locals.has(name)) {
      this.#locals.set(name, value);
      return value;
    }
    if (this.parent) {
      return this.parent.write(name, value);
    }
    throw new ReferenceError(`unknown local variable '${name}'`);
  }

  has(name: string): boolean {
    return this.#locals.has(name) || this.parent?.has(name) === true;
  }

  hasLocal(name: string): boolean {
    return this.#locals.has(name);
  }

  child(initialValues: Record<string, unknown> = {}): LocalVariableScope {
    return new LocalVariableScope(this, initialValues);
  }

  snapshot(): Record<string, unknown> {
    return {
      ...(this.parent ? this.parent.snapshot() : {}),
      ...Object.fromEntries(this.#locals.entries()),
    };
  }
}
