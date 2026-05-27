import { InternalActionOperation, Operation } from "./croquet-action-operations";
import { ActionTrigger, ArrayCodec, Codec, NullableCodec, StateOptions, arrayClone, arrayEquals, codecEquals } from "./croquet-codec-core";
import { BooleanState, State } from "./croquet-state-core";
import { ListData } from "./croquet-state-list";

export interface ItemSelectionStateOptions<T>
  extends Omit<StateOptions<T | null>, "codec" | "equals"> {
  readonly itemCodec: Codec<T>;
  readonly items?: Iterable<T>;
}

export class ItemSelectionState<T> extends State<T | null> {
  private readonly itemSelectedStates = new Map<string, BooleanState>();
  private readonly selectionOperations = new Map<string, Operation>();
  protected availableItems: T[];
  readonly itemCodec: Codec<T>;

  constructor(
    initialValue: T | null,
    options: ItemSelectionStateOptions<T>,
  ) {
    const nullableCodec = new NullableCodec(options.itemCodec);
    super(initialValue, {
      ...options,
      codec: nullableCodec,
      equals: (left, right) => nullableCodec.encode(left) === nullableCodec.encode(right),
    });
    this.itemCodec = options.itemCodec;
    this.availableItems = [...(options.items ?? [])];
    this.addListener(({ value }) => {
      this.syncItemSelectedStates(value);
    });
  }

  get items(): readonly T[] {
    return [...this.availableItems];
  }

  get selectedIndex(): number {
    if (this.currentValue === null) {
      return -1;
    }
    const encoded = this.itemCodec.encode(this.currentValue);
    return this.availableItems.findIndex((candidate) => this.itemCodec.encode(candidate) === encoded);
  }

  get selectedItem(): T | null {
    return this.value;
  }

  setItems(items: Iterable<T>): void {
    this.availableItems = [...items];
    if (this.currentValue === null) {
      return;
    }
    const matchingItem = this.findMatchingItem(this.currentValue);
    if (matchingItem === null) {
      this.clearSelection();
      return;
    }
    this.currentValue = matchingItem;
    this.syncItemSelectedStates(matchingItem);
  }

  containsItem(item: T): boolean {
    return this.findMatchingItem(item) !== null;
  }

  select(item: T, trigger?: ActionTrigger): void {
    const matchingItem = this.findMatchingItem(item);
    if (matchingItem === null && this.availableItems.length > 0) {
      throw new Error(`item ${this.itemCodec.appendRepresentation(item)} is not in the selection model`);
    }
    this.setValue(matchingItem ?? item, trigger);
  }

  selectIndex(index: number, trigger?: ActionTrigger): void {
    if (index === -1) {
      this.clearSelection(trigger);
      return;
    }
    const item = this.availableItems[index];
    if (item === undefined) {
      throw new RangeError(`index ${index} out of bounds`);
    }
    this.select(item, trigger);
  }

  clearSelection(trigger?: ActionTrigger): void {
    this.setValue(null, trigger);
  }

  serializeSelection(): string {
    return this.serializeValue();
  }

  restoreSelection(serialized: string, trigger?: ActionTrigger): void {
    this.restoreValue(serialized, trigger);
    if (this.currentValue === null) {
      return;
    }
    const matchingItem = this.findMatchingItem(this.currentValue);
    if (matchingItem !== null) {
      this.currentValue = matchingItem;
      this.syncItemSelectedStates(matchingItem);
    }
  }

  isSelected(item: T): boolean {
    return this.currentValue !== null && this.itemCodec.encode(this.currentValue) === this.itemCodec.encode(item);
  }

  getItemSelectedState(item: T): BooleanState {
    const key = this.itemCodec.encode(item);
    const existing = this.itemSelectedStates.get(key);
    if (existing) {
      return existing;
    }
    const state = new BooleanState(this.isSelected(item), {
      name: `${this.name}.${key}.selected`,
    });
    state.addListener(({ value, trigger }) => {
      if (value) {
        this.select(item, trigger);
      } else if (this.isSelected(item)) {
        this.clearSelection(trigger);
      }
    });
    this.itemSelectedStates.set(key, state);
    return state;
  }

  getItemSelectionOperation(item: T): Operation {
    const key = this.itemCodec.encode(item);
    const existing = this.selectionOperations.get(key);
    if (existing) {
      return existing;
    }
    const operation = new InternalActionOperation(
      key,
      (trigger) => {
        this.select(item, trigger);
        return undefined;
      },
      { name: `${this.name}.select.${key}` },
    );
    this.selectionOperations.set(key, operation);
    return operation;
  }

  private findMatchingItem(item: T): T | null {
    const encoded = this.itemCodec.encode(item);
    return (
      this.availableItems.find((candidate) => this.itemCodec.encode(candidate) === encoded) ?? null
    );
  }

  private syncItemSelectedStates(value: T | null): void {
    const selectedKey = value === null ? null : this.itemCodec.encode(value);
    for (const [key, state] of this.itemSelectedStates) {
      state.applyValue(selectedKey !== null && selectedKey === key);
    }
  }
}

export interface ListSelectionStateOptions<T>
  extends Omit<StateOptions<readonly T[]>, "codec" | "clone" | "equals"> {
  readonly itemCodec: Codec<T>;
  readonly data?: ListData<T>;
}

export class ListSelectionState<T> extends State<readonly T[]> {
  readonly itemCodec: Codec<T>;
  readonly data?: ListData<T>;

  constructor(
    initialValues: readonly T[],
    options: ListSelectionStateOptions<T>,
  ) {
    const codec = new ArrayCodec(options.itemCodec);
    super(initialValues, {
      ...options,
      codec,
      clone: arrayClone,
      equals: (left, right) => arrayEquals(left, right, codecEquals(options.itemCodec)),
    });
    this.itemCodec = options.itemCodec;
    this.data = options.data;
    this.data?.addListener(() => this.reconcileSelection());
  }

  get selectedItems(): readonly T[] {
    return this.value;
  }

  get selectedIndexes(): readonly number[] {
    if (!this.data) {
      return [];
    }
    return this.value
      .map((item) => this.data!.indexOf(item))
      .filter((index) => index >= 0);
  }

  isSelected(item: T): boolean {
    const encoded = this.itemCodec.encode(item);
    return this.value.some((candidate) => this.itemCodec.encode(candidate) === encoded);
  }

  setSelectedIndexes(indexes: readonly number[], trigger?: ActionTrigger): void {
    if (!this.data) {
      throw new Error("ListSelectionState requires data to select by index");
    }
    const nextValues = indexes
      .map((index) => this.data!.getItemAt(index))
      .filter((value, index, values) => values.indexOf(value) === index);
    this.setValue(nextValues, trigger);
  }

  selectItem(item: T, trigger?: ActionTrigger): void {
    if (this.isSelected(item)) {
      return;
    }
    this.setValue([...this.value, item], trigger);
  }

  toggleItem(item: T, trigger?: ActionTrigger): void {
    if (this.isSelected(item)) {
      this.setValue(
        this.value.filter((candidate) => this.itemCodec.encode(candidate) !== this.itemCodec.encode(item)),
        trigger,
      );
      return;
    }
    this.selectItem(item, trigger);
  }

  clearSelection(trigger?: ActionTrigger): void {
    this.setValue([], trigger);
  }

  private reconcileSelection(): void {
    if (!this.data) {
      return;
    }
    const nextValues = this.value.filter((item) => this.data!.contains(item));
    if (!arrayEquals(nextValues, this.value, codecEquals(this.itemCodec))) {
      this.applyValue(nextValues);
    }
  }
}

export class MutableDataSingleSelectListState<T> extends ItemSelectionState<T> {
  readonly data: ListData<T>;

  constructor(
    itemCodec: Codec<T>,
    initialItems: readonly T[] = [],
    initialValue: T | null = null,
    options: Omit<ItemSelectionStateOptions<T>, "itemCodec" | "items"> = {},
  ) {
    const data = new ListData(itemCodec, initialItems, options.name ?? itemCodec.name);
    super(initialValue, {
      ...options,
      itemCodec,
      items: data,
    });
    this.data = data;
    this.data.addListener(() => {
      this.setItems(this.data);
      this.reconcileSelection();
    });
  }

  get selectedIndex(): number {
    return this.value === null ? -1 : this.data.indexOf(this.value);
  }

  setSelectedIndex(index: number, trigger?: ActionTrigger): void {
    if (index === -1) {
      this.clearSelection(trigger);
      return;
    }
    this.select(this.data.getItemAt(index), trigger);
  }

  addItem(item: T, index = this.data.getItemCount()): void {
    this.data.internalAddItem(index, item);
  }

  removeItem(item: T): void {
    this.data.internalRemoveItem(item);
  }

  moveItem(fromIndex: number, toIndex: number): void {
    this.data.move(fromIndex, toIndex);
  }

  setAllItems(items: readonly T[]): void {
    this.data.internalSetAllItems(items);
  }

  private reconcileSelection(): void {
    if (this.value === null) {
      return;
    }
    if (this.data.contains(this.value)) {
      return;
    }
    const fallbackIndex = Math.min(this.selectedIndex, this.data.getItemCount() - 1);
    if (fallbackIndex >= 0) {
      this.applyValue(this.data.getItemAt(fallbackIndex));
    } else {
      this.applyValue(null);
    }
  }
}
