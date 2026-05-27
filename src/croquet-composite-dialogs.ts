import { ActionOperation } from "./croquet-action-operations";
import { ActionTrigger, lookupCodecFactory } from "./croquet-codec-core";
import { Composite, CompositeOptions, SimpleComposite } from "./croquet-composite-panel";
import { BooleanState, IntegerState } from "./croquet-state-core";
import { MutableListData } from "./croquet-state-list";
import { ItemSelectionState } from "./croquet-state-selection";

export interface TabTitleAppearance {
  closeable: boolean;
  potentiallyCloseable: boolean;
  classes: string[];
  tooltip?: string;
}

export interface TabCompositeOptions<TView> extends CompositeOptions<TView> {
  readonly closeable?: boolean;
  readonly potentiallyCloseable?: boolean;
  readonly tabs?: readonly TabComposite<any>[];
  readonly selectedTabIndex?: number;
}

export class TabComposite<TView = unknown> extends SimpleComposite<TView> {
  readonly titleAppearance: TabTitleAppearance;
  readonly tabsData: MutableListData<TabComposite<any>>;
  readonly selectedTabState: ItemSelectionState<TabComposite<any>>;

  constructor(
    name: string,
    options: TabCompositeOptions<TView> = {},
  ) {
    super(name, options);
    this.titleAppearance = {
      closeable: options.closeable ?? false,
      potentiallyCloseable: options.potentiallyCloseable ?? options.closeable ?? false,
      classes: [],
    };
    const tabCodec = lookupCodecFactory<TabComposite<any>>(
      `${name}.tab`,
      () => this.tabsData?.toArray() ?? [],
      (tab) => tab.name,
    );
    this.tabsData = new MutableListData<TabComposite<any>>(tabCodec, [], `${name}.tabs`);
    this.selectedTabState = new ItemSelectionState<TabComposite<any>>(null, {
      name: `${name}.selectedTab`,
      itemCodec: tabCodec,
      items: this.tabsData,
    });
    this.tabsData.addListener(() => {
      this.selectedTabState.setItems(this.tabsData);
      if (this.selectedTab === null && this.tabsData.getItemCount() > 0) {
        this.selectedTabState.selectIndex(0);
      }
    });
    this.selectedTabState.addListener(({ previousValue, value }) => {
      if (!this.isActive) {
        return;
      }
      previousValue?.deactivate();
      value?.activate();
    });
    for (const tab of options.tabs ?? []) {
      this.addTab(tab);
    }
    if (
      options.selectedTabIndex !== undefined
      && options.selectedTabIndex >= 0
      && options.selectedTabIndex < this.tabsData.getItemCount()
    ) {
      this.selectedTabState.selectIndex(options.selectedTabIndex);
    } else if (this.tabsData.getItemCount() > 0 && this.selectedTab === null) {
      this.selectedTabState.selectIndex(0);
    }
  }

  protected override getManagedSubComposites(): readonly Composite<any>[] {
    return this.selectedTab ? [this.selectedTab] : [];
  }

  get isCloseable(): boolean {
    return this.titleAppearance.closeable;
  }

  get isPotentiallyCloseable(): boolean {
    return this.titleAppearance.potentiallyCloseable;
  }

  get tabs(): readonly TabComposite<any>[] {
    return this.tabsData.toArray();
  }

  get selectedTab(): TabComposite<any> | null {
    return this.selectedTabState.selectedItem;
  }

  get selectedTabIndex(): number {
    return this.selectedTabState.selectedIndex;
  }

  addTab(tab: TabComposite<any>, index = this.tabsData.getItemCount()): void {
    this.registerSubComposite(tab);
    this.tabsData.addAt(index, tab);
  }

  removeTab(tab: TabComposite<any>): boolean {
    const index = this.tabsData.indexOf(tab);
    if (index === -1) {
      return false;
    }
    const wasSelected = this.selectedTab === tab;
    const replacementIndex = wasSelected
      ? Math.min(index, this.tabsData.getItemCount() - 2)
      : this.selectedTabIndex;
    this.tabsData.removeAt(index);
    this.unregisterSubComposite(tab);
    if (wasSelected) {
      if (replacementIndex >= 0) {
        this.selectedTabState.selectIndex(replacementIndex);
      } else {
        this.selectedTabState.clearSelection();
      }
    }
    return true;
  }

  moveTab(fromIndex: number, toIndex: number): void {
    this.tabsData.move(fromIndex, toIndex);
  }

  sortTabs(compare: (left: TabComposite<any>, right: TabComposite<any>) => number): void {
    this.tabsData.sort(compare);
  }

  filterTabs(
    predicate: (tab: TabComposite<any>, index: number, tabs: readonly TabComposite<any>[]) => boolean,
  ): TabComposite<any>[] {
    return this.tabsData.filter(predicate);
  }

  selectTab(tab: TabComposite<any>, trigger?: ActionTrigger): void {
    this.selectedTabState.select(tab, trigger);
  }

  selectTabAt(index: number, trigger?: ActionTrigger): void {
    this.selectedTabState.selectIndex(index, trigger);
  }

  ensureSelectedTabInitialized(): unknown | null {
    return this.selectedTab?.getView() ?? null;
  }

  customizeTitleComponentAppearance(
    customizer: (appearance: TabTitleAppearance) => void,
  ): void {
    customizer(this.titleAppearance);
  }
}

export class DialogComposite<TView = unknown, TResult = unknown> extends SimpleComposite<TView> {
  readonly isOpenState = new BooleanState(false, { name: `${this.name}.open` });
  lastResult: TResult | null = null;
  wasAccepted = false;
  readonly acceptOperation: ActionOperation;
  readonly cancelOperation: ActionOperation;

  constructor(name: string, options: CompositeOptions<TView> = {}) {
    super(name, options);
    this.acceptOperation = this.registerOperation(
      "accept",
      new ActionOperation(() => {
        this.accept();
        return undefined;
      }, { name: `${name}.accept` }),
    ) as ActionOperation;
    this.cancelOperation = this.registerOperation(
      "cancel",
      new ActionOperation(() => {
        this.cancel();
        return undefined;
      }, { name: `${name}.cancel` }),
    ) as ActionOperation;
  }

  get isOpen(): boolean {
    return this.isOpenState.value;
  }

  open(): TView {
    this.isOpenState.value = true;
    this.activate();
    return this.getView();
  }

  close(result: TResult | null = this.lastResult): TResult | null {
    this.lastResult = result;
    this.isOpenState.value = false;
    this.deactivate();
    return this.lastResult;
  }

  accept(result: TResult | null = this.lastResult): TResult | null {
    this.wasAccepted = true;
    return this.close(result);
  }

  cancel(): void {
    this.wasAccepted = false;
    this.close(null);
  }
}

export class WizardDialogComposite<TView = unknown, TStep = string> extends DialogComposite<TView, TStep> {
  private readonly steps: TStep[];
  readonly currentStepIndexState: IntegerState;
  readonly nextOperation: ActionOperation;
  readonly backOperation: ActionOperation;
  readonly finishOperation: ActionOperation;
  readonly visitedSteps = new Set<number>();

  constructor(
    name: string,
    steps: readonly TStep[] = [],
    options: CompositeOptions<TView> = {},
  ) {
    super(name, options);
    this.steps = [...steps];
    this.currentStepIndexState = this.registerState(
      "currentStepIndex",
      new IntegerState(0, { name: `${name}.currentStepIndex` }),
    ) as IntegerState;
    this.nextOperation = this.registerOperation(
      "next",
      new ActionOperation(() => {
        this.goNext();
        return undefined;
      }, { name: `${name}.next` }),
    ) as ActionOperation;
    this.backOperation = this.registerOperation(
      "back",
      new ActionOperation(() => {
        this.goBack();
        return undefined;
      }, { name: `${name}.back` }),
    ) as ActionOperation;
    this.finishOperation = this.registerOperation(
      "finish",
      new ActionOperation(() => {
        this.accept(this.currentStep ?? null);
        return undefined;
      }, { name: `${name}.finish` }),
    ) as ActionOperation;
    this.currentStepIndexState.addListener(() => this.updateOperationState());
    this.reset();
  }

  get stepCount(): number {
    return this.steps.length;
  }

  get currentStep(): TStep | null {
    return this.steps[this.currentStepIndexState.value] ?? null;
  }

  addStep(step: TStep): void {
    this.steps.push(step);
    this.updateOperationState();
  }

  reset(): void {
    this.visitedSteps.clear();
    if (this.steps.length > 0) {
      this.currentStepIndexState.applyValue(0);
      this.visitedSteps.add(0);
    }
    this.updateOperationState();
  }

  override open(): TView {
    this.reset();
    return super.open();
  }

  canGoBack(): boolean {
    return this.currentStepIndexState.value > 0;
  }

  canGoNext(): boolean {
    return this.currentStepIndexState.value < this.steps.length - 1;
  }

  goNext(): void {
    if (!this.canGoNext()) {
      return;
    }
    const nextIndex = this.currentStepIndexState.value + 1;
    this.currentStepIndexState.value = nextIndex;
    this.visitedSteps.add(nextIndex);
    this.updateOperationState();
  }

  goBack(): void {
    if (!this.canGoBack()) {
      return;
    }
    this.currentStepIndexState.value -= 1;
    this.updateOperationState();
  }

  private updateOperationState(): void {
    this.backOperation.isEnabled = this.canGoBack();
    this.nextOperation.isEnabled = this.canGoNext();
    this.finishOperation.isEnabled = this.steps.length > 0 && !this.canGoNext();
  }
}
