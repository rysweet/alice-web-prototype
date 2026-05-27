import { Operation } from "./croquet-action-operations";
import { ViewLifecycleEvent } from "./croquet-codec-core";
import { CompositeView, Panel, ScrollPane, ViewController } from "./croquet-lifecycle-views";
import { State } from "./croquet-state-core";

export interface CompositeOptions<TView> {
  readonly createView?: (composite: Composite<TView>) => TView;
}

export class Composite<TView = unknown> {
  private readonly states = new Map<string, State<unknown>>();
  private readonly operations = new Map<string, Operation>();
  private readonly activationListeners = new Set<(active: boolean) => void>();
  private readonly viewListeners = new Set<(event: ViewLifecycleEvent<TView>) => void>();
  private readonly subComposites = new Set<Composite<any>>();
  private active = false;
  private createdView = false;
  private viewInstance?: TView;

  constructor(
    public readonly name: string,
    private readonly options: CompositeOptions<TView> = {},
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  get hasView(): boolean {
    return this.createdView;
  }

  registerState<T>(name: string, state: State<T>): State<T> {
    this.states.set(name, state as State<unknown>);
    return state;
  }

  registerOperation(name: string, operation: Operation): Operation {
    this.operations.set(name, operation);
    return operation;
  }

  getState<T>(name: string): State<T> | undefined {
    return this.states.get(name) as State<T> | undefined;
  }

  getOperation(name: string): Operation | undefined {
    return this.operations.get(name);
  }

  contains(candidate: State<unknown> | Operation): boolean {
    return [...this.states.values(), ...this.operations.values()].includes(candidate);
  }

  addActivationListener(listener: (active: boolean) => void): void {
    this.activationListeners.add(listener);
  }

  removeActivationListener(listener: (active: boolean) => void): void {
    this.activationListeners.delete(listener);
  }

  addViewListener(listener: (event: ViewLifecycleEvent<TView>) => void): void {
    this.viewListeners.add(listener);
  }

  removeViewListener(listener: (event: ViewLifecycleEvent<TView>) => void): void {
    this.viewListeners.delete(listener);
  }

  protected createView(): TView {
    if (!this.options.createView) {
      throw new Error(`No view factory provided for ${this.name}`);
    }
    return this.options.createView(this);
  }

  protected registerSubComposite<C extends Composite<any>>(subComposite: C): C {
    if (subComposite === (this as unknown as Composite<any>)) {
      throw new Error("A composite cannot manage itself as a sub composite");
    }
    this.subComposites.add(subComposite);
    if (this.active && this.getManagedSubComposites().includes(subComposite)) {
      subComposite.activate();
    }
    return subComposite;
  }

  protected unregisterSubComposite(subComposite: Composite<any>): void {
    if (!this.subComposites.delete(subComposite)) {
      return;
    }
    if (subComposite.isActive) {
      subComposite.deactivate();
    }
  }

  protected getManagedSubComposites(): readonly Composite<any>[] {
    return [...this.subComposites];
  }

  getView(): TView {
    if (!this.createdView) {
      this.viewInstance = this.createView();
      this.createdView = true;
      const event: ViewLifecycleEvent<TView> = {
        composite: this,
        view: this.viewInstance,
      };
      for (const listener of this.viewListeners) {
        listener(event);
      }
      this.handleViewCreated(this.viewInstance);
    }
    return this.viewInstance as TView;
  }

  getScrollPaneIfExists(): ScrollPane<Composite<TView>> | null {
    const view = this.getView();
    return view instanceof ScrollPane ? view as ScrollPane<Composite<TView>> : null;
  }

  getRootComponent(): TView | ScrollPane<Composite<TView>> {
    return this.getScrollPaneIfExists() ?? this.getView();
  }

  releaseView(): void {
    if (!this.createdView) {
      return;
    }
    if (this.viewInstance instanceof Panel) {
      this.viewInstance.forgetAndRemoveAllChildren();
    }
    if (this.viewInstance instanceof ViewController) {
      this.viewInstance.detach();
    }
    this.createdView = false;
    this.viewInstance = undefined;
  }

  activate(): void {
    const view = this.getView();
    if (this.active) {
      return;
    }
    this.active = true;
    if (view instanceof CompositeView) {
      view.handleCompositePreActivation();
    }
    this.handlePreActivation();
    for (const composite of this.getManagedSubComposites()) {
      composite.activate();
    }
    this.handleActivated();
    this.notifyActivationListeners(true);
  }

  deactivate(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    const managedComposites = [...this.getManagedSubComposites()].reverse();
    for (const composite of managedComposites) {
      composite.deactivate();
    }
    this.handlePostDeactivation();
    if (this.viewInstance instanceof CompositeView) {
      this.viewInstance.handleCompositePostDeactivation();
    }
    this.handleDeactivated();
    this.notifyActivationListeners(false);
  }

  protected handleViewCreated(_view: TView): void {}

  protected handlePreActivation(): void {}

  protected handleActivated(): void {}

  protected handlePostDeactivation(): void {}

  protected handleDeactivated(): void {}

  private notifyActivationListeners(active: boolean): void {
    for (const listener of this.activationListeners) {
      listener(active);
    }
  }
}

export class SimpleComposite<TView = unknown> extends Composite<TView> {}
