import {
  CompositeCommand,
  type Command,
  type UndoRedoManager,
} from "./undo-redo";
import { ActionTrigger, OperationFireEvent, OperationHandler, OperationListener, OperationOptions, OperationResult, SimulatedActionTrigger } from "./croquet-codec-core";
import { Composite } from "./croquet-composite-panel";
import { BooleanState } from "./croquet-state-core";

export class Operation {
  readonly enabledState: BooleanState;
  private readonly listeners = new Set<OperationListener>();
  private readonly chainedOperations: Array<{
    readonly operation: Operation;
    readonly createTrigger?: (event: OperationFireEvent) => ActionTrigger;
  }> = [];

  constructor(
    private readonly action: OperationHandler = () => undefined,
    private readonly options: OperationOptions = {},
  ) {
    this.enabledState = new BooleanState(options.enabled ?? true, {
      name: `${this.name}.enabled`,
    });
  }

  get name(): string {
    return this.options.name ?? "operation";
  }

  get isEnabled(): boolean {
    return this.enabledState.value;
  }

  set isEnabled(value: boolean) {
    this.enabledState.value = value;
  }

  addListener(listener: OperationListener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: OperationListener): void {
    this.listeners.delete(listener);
  }

  thenTrigger(
    operation: Operation,
    createTrigger?: (event: OperationFireEvent) => ActionTrigger,
  ): this {
    this.chainedOperations.push({ operation, createTrigger });
    return this;
  }

  protected perform(trigger: ActionTrigger): OperationResult {
    return this.action(trigger);
  }

  fire(trigger: ActionTrigger = SimulatedActionTrigger.create(this)): OperationResult {
    if (!this.isEnabled) {
      return undefined;
    }
    const result = this.perform(trigger);
    this.handleResult(result);
    const event: OperationFireEvent = { operation: this, trigger, result };
    for (const listener of this.listeners) {
      listener(event);
    }
    for (const chainedOperation of this.chainedOperations) {
      chainedOperation.operation.fire(chainedOperation.createTrigger?.(event) ?? trigger);
    }
    return result;
  }

  execute(trigger?: ActionTrigger): OperationResult {
    return this.fire(trigger);
  }

  protected handleResult(result: OperationResult): void {
    if (!result) {
      return;
    }
    if (Array.isArray(result)) {
      if (result.length === 0) {
        return;
      }
      const command = result.length === 1 ? result[0] : new CompositeCommand(result);
      this.executeCommand(command);
      return;
    }
    this.executeCommand(result);
  }

  protected executeCommand(command: Command): void {
    if (this.options.undoRedo) {
      this.options.undoRedo.execute(command);
      return;
    }
    command.execute();
  }
}

export class ActionOperation extends Operation {
  constructor(action: OperationHandler, options: OperationOptions = {}) {
    super(action, options);
  }
}

export class InternalActionOperation extends ActionOperation {
  readonly owner?: Composite<unknown>;

  constructor(
    public readonly key: string,
    action: OperationHandler,
    options: OperationOptions & { readonly owner?: Composite<unknown> } = {},
  ) {
    super(action, {
      ...options,
      name: options.name ?? key,
    });
    this.owner = options.owner;
  }
}

export class BooleanStateOperation extends Operation {
  constructor(
    private readonly state: BooleanState,
    private readonly targetValue?: boolean,
    options: OperationOptions = {},
  ) {
    super(() => undefined, {
      ...options,
      name: options.name ?? `${state.name}.toggle`,
    });
  }

  protected override perform(trigger: ActionTrigger): OperationResult {
    this.state.setValue(this.targetValue ?? !this.state.value, trigger);
    return undefined;
  }
}

export class LazyOperation extends Operation {
  private resolvedOperation: Operation | null = null;

  constructor(
    private readonly factory: () => Operation,
    options: OperationOptions = {},
  ) {
    super(() => undefined, options);
  }

  resolve(): Operation {
    if (!this.resolvedOperation) {
      this.resolvedOperation = this.factory();
      this.enabledState.applyValue(this.resolvedOperation.isEnabled);
      this.resolvedOperation.enabledState.addListener(({ value }) => {
        this.enabledState.applyValue(value);
      });
    }
    return this.resolvedOperation;
  }

  override get isEnabled(): boolean {
    return this.resolvedOperation ? this.resolvedOperation.isEnabled : super.isEnabled;
  }

  override set isEnabled(value: boolean) {
    super.isEnabled = value;
    if (this.resolvedOperation) {
      this.resolvedOperation.isEnabled = value;
    }
  }

  override fire(trigger: ActionTrigger = SimulatedActionTrigger.create(this)): OperationResult {
    if (!super.isEnabled) {
      return undefined;
    }
    return this.resolve().fire(trigger);
  }
}
