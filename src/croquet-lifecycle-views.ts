import { normalizeIndex } from "./croquet-codec-core";
import { Composite } from "./croquet-composite-panel";

export interface ViewGroup {
  readonly childViews: readonly ViewController<any>[];
  removeChild(view: ViewController<any>): boolean;
}

export class ViewController<TModel = unknown> {
  private parent?: ViewGroup;

  constructor(public readonly model: TModel) {}

  get parentView(): ViewGroup | undefined {
    return this.parent;
  }

  get isAttached(): boolean {
    return this.parent !== undefined;
  }

  attachTo(parent: ViewGroup): void {
    if (this.parent === parent) {
      return;
    }
    this.detach();
    this.parent = parent;
    this.handleAddedTo(parent);
  }

  detach(): void {
    if (!this.parent) {
      return;
    }
    const parent = this.parent;
    this.parent = undefined;
    this.handleRemovedFrom(parent);
  }

  // Extension hooks: base controllers have no attach/detach side effects.
  protected handleAddedTo(_parent: ViewGroup): void {}

  protected handleRemovedFrom(_parent: ViewGroup): void {}
}

export class CompositeView<
  TComposite extends Composite<any> | null = Composite<any> | null,
> extends ViewController<TComposite> {
  constructor(composite: TComposite) {
    super(composite);
  }

  get composite(): TComposite {
    return this.model;
  }

  // Extension hooks for views that mirror composite activation lifecycle.
  handleCompositePreActivation(): void {}

  handleCompositePostDeactivation(): void {}
}

export interface PanelOptions {
  readonly refreshOnAttach?: boolean;
}

export class Panel<
  TComposite extends Composite<any> | null = Composite<any> | null,
> extends CompositeView<TComposite> implements ViewGroup {
  private readonly children: ViewController<any>[] = [];
  private refreshNeeded = true;
  private refreshing = false;

  constructor(
    composite: TComposite = null as TComposite,
    private readonly options: PanelOptions = {},
  ) {
    super(composite);
  }

  get childViews(): readonly ViewController<any>[] {
    return [...this.children];
  }

  appendChild(view: ViewController<any>, index = this.children.length): void {
    if (view.parentView) {
      view.parentView.removeChild(view);
    }
    const insertionIndex = normalizeIndex(index, this.children.length);
    this.children.splice(insertionIndex, 0, view);
    view.attachTo(this);
    this.refreshLater();
  }

  removeChild(view: ViewController<any>): boolean {
    const index = this.children.indexOf(view);
    if (index === -1) {
      return false;
    }
    this.children.splice(index, 1);
    view.detach();
    this.refreshLater();
    return true;
  }

  removeAllChildren(): void {
    for (const child of [...this.children]) {
      this.removeChild(child);
    }
  }

  forgetAndRemoveAllChildren(): void {
    this.removeAllChildren();
  }

  refreshLater(): void {
    this.refreshNeeded = true;
  }

  refreshIfNecessary(): void {
    if (!this.refreshNeeded || this.refreshing) {
      return;
    }
    this.refreshing = true;
    try {
      this.internalRefresh();
      this.refreshNeeded = false;
    } finally {
      this.refreshing = false;
    }
  }

  // Extension hook: simple panels can rely on refresh bookkeeping only.
  protected internalRefresh(): void {}

  protected override handleAddedTo(parent: ViewGroup): void {
    if (this.options.refreshOnAttach) {
      this.refreshIfNecessary();
    }
    super.handleAddedTo(parent);
  }
}

export type Axis = "page" | "line";

export class AxisPanel<
  TComposite extends Composite<any> | null = Composite<any> | null,
> extends Panel<TComposite> {
  constructor(
    public readonly axis: Axis,
    composite: TComposite = null as TComposite,
    children: readonly ViewController<any>[] = [],
  ) {
    super(composite);
    for (const child of children) {
      this.appendChild(child);
    }
  }
}

export class PageAxisPanel<
  TComposite extends Composite<any> | null = Composite<any> | null,
> extends AxisPanel<TComposite> {
  constructor(
    composite: TComposite = null as TComposite,
    children: readonly ViewController<any>[] = [],
  ) {
    super("page", composite, children);
  }
}

export class LineAxisPanel<
  TComposite extends Composite<any> | null = Composite<any> | null,
> extends AxisPanel<TComposite> {
  constructor(
    composite: TComposite = null as TComposite,
    children: readonly ViewController<any>[] = [],
  ) {
    super("line", composite, children);
  }
}

export type BorderRegion = "pageStart" | "pageEnd" | "lineStart" | "lineEnd" | "center";

export class BorderPanel<
  TComposite extends Composite<any> | null = Composite<any> | null,
> extends Panel<TComposite> {
  private readonly regions = new Map<BorderRegion, ViewController<any>>();

  setRegion(region: BorderRegion, view: ViewController<any> | null): void {
    const previous = this.regions.get(region);
    if (previous) {
      super.removeChild(previous);
      this.regions.delete(region);
    }
    if (view) {
      this.regions.set(region, view);
      this.appendChild(view);
    }
  }

  getRegion(region: BorderRegion): ViewController<any> | undefined {
    return this.regions.get(region);
  }

  clearRegion(region: BorderRegion): void {
    this.setRegion(region, null);
  }
}

export class ScrollPane<
  TComposite extends Composite<any> | null = Composite<any> | null,
> extends Panel<TComposite> {
  constructor(
    composite: TComposite = null as TComposite,
    content: ViewController<any> | null = null,
  ) {
    super(composite);
    if (content) {
      this.setContent(content);
    }
  }

  get contentView(): ViewController<any> | null {
    return this.childViews[0] ?? null;
  }

  setContent(view: ViewController<any> | null): void {
    this.removeAllChildren();
    if (view) {
      this.appendChild(view);
    }
  }
}
