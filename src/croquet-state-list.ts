import { Codec, ListDataEvent, ListDataListener, TreeDataEvent, TreeDataListener, defaultCodecFactory, normalizeIndex } from "./croquet-codec-core";

export class ListData<T> implements Iterable<T> {
  private readonly items: T[];
  private readonly listeners = new Set<ListDataListener<T>>();

  constructor(
    readonly itemCodec: Codec<T> = defaultCodecFactory<T>(),
    initialItems: readonly T[] = [],
    readonly preferenceKey = itemCodec.name,
  ) {
    this.items = [...initialItems];
  }

  addListener(listener: ListDataListener<T>): void {
    this.listeners.add(listener);
  }

  removeListener(listener: ListDataListener<T>): void {
    this.listeners.delete(listener);
  }

  contains(item: T): boolean {
    return this.indexOf(item) !== -1;
  }

  filter(predicate: (item: T, index: number, items: readonly T[]) => boolean): T[] {
    const snapshot = this.toArray();
    return snapshot.filter((item, index) => predicate(item, index, snapshot));
  }

  getItemAt(index: number): T {
    const item = this.items[index];
    if (item === undefined) {
      throw new RangeError(`index ${index} out of bounds`);
    }
    return item;
  }

  getItemCount(): number {
    return this.items.length;
  }

  indexOf(item: T): number {
    const encoded = this.itemCodec.encode(item);
    return this.items.findIndex((candidate) => this.itemCodec.encode(candidate) === encoded);
  }

  internalAddItem(index: number, item: T): void {
    const normalizedIndex = normalizeIndex(index, this.items.length, true);
    this.items.splice(normalizedIndex, 0, item);
    this.emit({
      source: this,
      type: "add",
      items: [item],
      index: normalizedIndex,
    });
  }

  add(item: T): void {
    this.internalAddItem(this.items.length, item);
  }

  addAt(index: number, item: T): void {
    this.internalAddItem(index, item);
  }

  internalRemoveItem(item: T): void {
    const index = this.indexOf(item);
    if (index === -1) {
      return;
    }
    this.removeAt(index);
  }

  remove(item: T): boolean {
    const index = this.indexOf(item);
    if (index === -1) {
      return false;
    }
    this.removeAt(index);
    return true;
  }

  removeAt(index: number): T | undefined {
    if (index < 0 || index >= this.items.length) {
      return undefined;
    }
    const [removed] = this.items.splice(index, 1);
    this.emit({
      source: this,
      type: "remove",
      items: removed === undefined ? [] : [removed],
      index,
    });
    return removed;
  }

  setAt(index: number, item: T): void {
    if (index < 0 || index >= this.items.length) {
      throw new RangeError(`index ${index} out of bounds`);
    }
    const previousItem = this.items[index];
    if (previousItem !== undefined && this.itemCodec.encode(previousItem) === this.itemCodec.encode(item)) {
      this.items[index] = item;
      return;
    }
    this.items[index] = item;
    this.emit({
      source: this,
      type: "set",
      items: [item],
      index,
      previousItems: previousItem === undefined ? [] : [previousItem],
    });
  }

  move(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.items.length) {
      throw new RangeError(`fromIndex ${fromIndex} out of bounds`);
    }
    const [item] = this.items.splice(fromIndex, 1);
    if (item === undefined) {
      return;
    }
    const normalizedToIndex = normalizeIndex(toIndex, this.items.length, true);
    this.items.splice(normalizedToIndex, 0, item);
    this.emit({
      source: this,
      type: "move",
      items: [item],
      fromIndex,
      toIndex: normalizedToIndex,
    });
  }

  sort(compare: (left: T, right: T) => number): void {
    const desiredOrder = this.toArray().sort(compare);
    desiredOrder.forEach((item, targetIndex) => {
      const currentIndex = this.indexOf(item);
      if (currentIndex !== targetIndex) {
        this.move(currentIndex, targetIndex);
      }
    });
  }

  internalSetAllItems(items: readonly T[]): void {
    const previousItems = this.toArray();
    this.items.splice(0, this.items.length, ...items);
    this.emit({
      source: this,
      type: "reset",
      items: this.toArray(),
      previousItems,
    });
  }

  clear(): void {
    if (this.items.length === 0) {
      return;
    }
    const previousItems = this.toArray();
    this.items.length = 0;
    this.emit({
      source: this,
      type: "clear",
      items: [],
      previousItems,
    });
  }

  toArray(): T[] {
    return [...this.items];
  }

  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }

  private emit(event: ListDataEvent<T>): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export class MutableListData<T> extends ListData<T> {
  constructor(
    itemCodec: Codec<T> = defaultCodecFactory<T>(),
    initialItems: readonly T[] = [],
    preferenceKey = itemCodec.name,
  ) {
    super(itemCodec, initialItems, preferenceKey);
  }
}

let nextTreeNodeId = 0;

export class TreeNode<T> {
  readonly id = `tree-node-${nextTreeNodeId++}`;
  parent: TreeNode<T> | null = null;
  readonly children: TreeNode<T>[] = [];

  constructor(public value: T) {}

  get index(): number {
    if (!this.parent) {
      return -1;
    }
    return this.parent.children.indexOf(this);
  }
}

export class TreeData<T> {
  readonly roots: TreeNode<T>[] = [];
  private readonly listeners = new Set<TreeDataListener<T>>();

  addListener(listener: TreeDataListener<T>): void {
    this.listeners.add(listener);
  }

  removeListener(listener: TreeDataListener<T>): void {
    this.listeners.delete(listener);
  }

  createNode(value: T): TreeNode<T> {
    return new TreeNode(value);
  }

  getChildren(parent: TreeNode<T> | null = null): readonly TreeNode<T>[] {
    return [...(parent ? parent.children : this.roots)];
  }

  filter(
    predicate: (node: TreeNode<T>, index: number, parent: TreeNode<T> | null) => boolean,
  ): TreeNode<T>[] {
    const matches: TreeNode<T>[] = [];
    const visit = (nodes: readonly TreeNode<T>[], parent: TreeNode<T> | null): void => {
      nodes.forEach((node, index) => {
        if (predicate(node, index, parent)) {
          matches.push(node);
        }
        visit(node.children, node);
      });
    };
    visit(this.roots, null);
    return matches;
  }

  addRoot(value: T | TreeNode<T>, index = this.roots.length): TreeNode<T> {
    const node = value instanceof TreeNode ? value : this.createNode(value);
    if (node.parent) {
      this.removeNode(node);
    }
    const normalizedIndex = normalizeIndex(index, this.roots.length, true);
    this.roots.splice(normalizedIndex, 0, node);
    node.parent = null;
    this.emit({ source: this, type: "add", node, parent: null, index: normalizedIndex });
    return node;
  }

  addRootAt(index: number, value: T | TreeNode<T>): TreeNode<T> {
    return this.addRoot(value, index);
  }

  addChild(parent: TreeNode<T>, value: T | TreeNode<T>, index = parent.children.length): TreeNode<T> {
    const node = value instanceof TreeNode ? value : this.createNode(value);
    if (this.isAncestorOf(node, parent)) {
      throw new Error("Cannot create a tree cycle");
    }
    if (node.parent || this.roots.includes(node)) {
      this.removeNode(node);
    }
    const normalizedIndex = normalizeIndex(index, parent.children.length, true);
    parent.children.splice(normalizedIndex, 0, node);
    node.parent = parent;
    this.emit({ source: this, type: "add", node, parent, index: normalizedIndex });
    return node;
  }

  addChildAt(parent: TreeNode<T>, index: number, value: T | TreeNode<T>): TreeNode<T> {
    return this.addChild(parent, value, index);
  }

  updateNode(node: TreeNode<T>, value: T): void {
    const previousValue = node.value;
    node.value = value;
    this.emit({ source: this, type: "update", node, previousValue });
  }

  removeNode(node: TreeNode<T>): void {
    const parent = node.parent;
    const siblings = parent ? parent.children : this.roots;
    const previousIndex = siblings.indexOf(node);
    if (previousIndex === -1) {
      return;
    }
    siblings.splice(previousIndex, 1);
    node.parent = null;
    this.emit({
      source: this,
      type: "remove",
      node,
      previousParent: parent,
      previousIndex,
    });
  }

  moveNode(node: TreeNode<T>, parent: TreeNode<T> | null, index?: number): void {
    if (parent && this.isAncestorOf(node, parent)) {
      throw new Error("Cannot create a tree cycle");
    }
    const previousParent = node.parent;
    const previousSiblings = previousParent ? previousParent.children : this.roots;
    const previousIndex = previousSiblings.indexOf(node);
    if (previousIndex === -1) {
      throw new Error("Node is not attached to this tree");
    }
    previousSiblings.splice(previousIndex, 1);
    const nextSiblings = parent ? parent.children : this.roots;
    const normalizedIndex = normalizeIndex(index ?? nextSiblings.length, nextSiblings.length, true);
    nextSiblings.splice(normalizedIndex, 0, node);
    node.parent = parent;
    this.emit({
      source: this,
      type: "move",
      node,
      parent,
      previousParent,
      index: normalizedIndex,
      previousIndex,
    });
  }

  reorderNode(node: TreeNode<T>, index: number): void {
    this.moveNode(node, node.parent, index);
  }

  sortChildren(
    parent: TreeNode<T> | null,
    compare: (left: TreeNode<T>, right: TreeNode<T>) => number,
  ): void {
    const siblings = parent ? parent.children : this.roots;
    const desiredOrder = [...siblings].sort(compare);
    desiredOrder.forEach((node, targetIndex) => {
      if (siblings[targetIndex] !== node) {
        this.moveNode(node, parent, targetIndex);
      }
    });
  }

  sort(compare: (left: TreeNode<T>, right: TreeNode<T>) => number): void {
    this.sortChildren(null, compare);
  }

  clear(): void {
    this.roots.length = 0;
    this.emit({ source: this, type: "reset", node: null });
  }

  traverse(visitor: (node: TreeNode<T>) => void): void {
    const visit = (node: TreeNode<T>): void => {
      visitor(node);
      for (const child of node.children) {
        visit(child);
      }
    };
    for (const root of this.roots) {
      visit(root);
    }
  }

  flatten(): TreeNode<T>[] {
    const nodes: TreeNode<T>[] = [];
    this.traverse((node) => nodes.push(node));
    return nodes;
  }

  getPath(node: TreeNode<T>): TreeNode<T>[] {
    const path: TreeNode<T>[] = [];
    let current: TreeNode<T> | null = node;
    while (current) {
      path.unshift(current);
      current = current.parent;
    }
    return path;
  }

  private isAncestorOf(candidateAncestor: TreeNode<T>, node: TreeNode<T> | null): boolean {
    let current = node;
    while (current) {
      if (current === candidateAncestor) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  private emit(event: TreeDataEvent<T>): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
