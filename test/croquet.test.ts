import { describe, expect, it, vi } from "vitest";
import {
  ActionOperation,
  BooleanState,
  BooleanStateOperation,
  BorderPanel,
  Composite,
  CompositeView,
  DialogComposite,
  DoubleState,
  EnumCodec,
  IntegerCodec,
  IntegerState,
  InternalActionOperation,
  ItemSelectionState,
  KeyPressedTrigger,
  LazyOperation,
  LineAxisPanel,
  ListData,
  ListSelectionState,
  MutableListData,
  MutableDataSingleSelectListState,
  PageAxisPanel,
  Panel,
  ScrollPane,
  SimulatedActionTrigger,
  SimpleComposite,
  StringCodec,
  StringState,
  TabComposite,
  TreeData,
  ViewController,
  WizardDialogComposite,
} from "../src/croquet";
import { AddEntityCommand, UndoRedoManager } from "../src/undo-redo";
import { Scene } from "../src/story-api/scene";
import { SProp } from "../src/story-api/entities";

describe("croquet state framework", () => {
  it("tracks typed state changes and undo redo", () => {
    const manager = new UndoRedoManager();
    const state = new StringState("draft", {
      name: "title",
      undoRedo: manager,
    });
    const changes: string[] = [];
    const phases: string[] = [];

    state.addChangingListener((change) => {
      phases.push(`changing:${change.previousValue}->${change.value}`);
    });
    state.addListener((change) => {
      changes.push(`${change.previousValue}->${change.value}`);
    });

    state.value = "published";
    manager.undo();
    manager.redo();

    expect(state.value).toBe("published");
    expect(changes).toEqual([
      "draft->published",
      "published->draft",
      "draft->published",
    ]);
    expect(phases[0]).toBe("changing:draft->published");
  });

  it("round trips primitive and enum codecs", () => {
    enum PublishMode {
      Draft = "draft",
      Review = "review",
    }

    const stringCodec = new StringCodec();
    const integerCodec = new IntegerCodec();
    const enumCodec = new EnumCodec(Object.values(PublishMode), {
      localization: { draft: "Draft", review: "Review" },
    });

    expect(stringCodec.decode(stringCodec.encode("Alice"))).toBe("Alice");
    expect(integerCodec.decode(integerCodec.encode(42))).toBe(42);
    expect(enumCodec.decode(enumCodec.encode(PublishMode.Review))).toBe(PublishMode.Review);
    expect(enumCodec.appendRepresentation(PublishMode.Draft)).toBe("Draft");
  });

  it("enforces boolean integer and double contracts", () => {
    expect(() => new IntegerState(1.5)).toThrow(TypeError);
    expect(() => new DoubleState(Number.NaN)).toThrow(TypeError);
    expect(() => new BooleanState(true).setValue(true)).not.toThrow();
  });

  it("supports single and multi selection state helpers", () => {
    const codec = new StringCodec();
    const itemState = new ItemSelectionState<string>("beta", {
      name: "item",
      itemCodec: codec,
      items: ["alpha", "beta", "gamma"],
    });
    const betaSelected = itemState.getItemSelectedState("beta");
    const alphaOperation = itemState.getItemSelectionOperation("alpha");
    const trigger = new KeyPressedTrigger("a", { ctrlKey: true });

    alphaOperation.fire(trigger);
    expect(itemState.value).toBe("alpha");
    expect(betaSelected.value).toBe(false);
    expect(trigger.chord).toBe("Ctrl+a");

    const listData = new ListData(codec, ["alpha", "beta", "gamma"]);
    const multiState = new ListSelectionState<string>(["alpha"], {
      name: "multi",
      itemCodec: codec,
      data: listData,
    });
    multiState.selectItem("gamma");
    expect(multiState.selectedIndexes).toEqual([0, 2]);
    listData.internalRemoveItem("alpha");
    expect(multiState.selectedItems).toEqual(["gamma"]);
  });

  it("reconciles mutable single select state with backing list data", () => {
    const state = new MutableDataSingleSelectListState<string>(
      new StringCodec(),
      ["one", "two", "three"],
      "two",
      { name: "numbers" },
    );
    const events: string[] = [];

    state.data.addListener((event) => {
      events.push(`${event.type}:${event.items.join(",")}`);
    });

    state.moveItem(2, 0);
    state.removeItem("two");

    expect(state.data.toArray()).toEqual(["three", "one"]);
    expect(state.value).toBeNull();
    expect(events).toEqual(["move:three", "remove:two"]);
  });

  it("routes operation commands through undo redo", () => {
    const scene = new Scene();
    const manager = new UndoRedoManager();
    const operation = new ActionOperation(
      () => new AddEntityCommand(scene, "tree", new SProp()),
      { name: "addTree", undoRedo: manager },
    );

    operation.execute();
    expect(scene.getEntity("tree")).toBeInstanceOf(SProp);
    manager.undo();
    expect(scene.getEntity("tree")).toBeUndefined();
  });

  it("supports internal boolean and lazy operations with triggers", () => {
    const enabled = new BooleanState(false, { name: "flag" });
    const sourceTrigger = SimulatedActionTrigger.create({ test: true });
    const lazyFactory = vi.fn(() =>
      new InternalActionOperation(
        "lazy.fire",
        () => {
          enabled.setValue(true, sourceTrigger);
          return undefined;
        },
        { name: "lazyFire" },
      ),
    );
    const lazyOperation = new LazyOperation(lazyFactory, { name: "lazy" });
    const toggleOperation = new BooleanStateOperation(enabled, undefined, { name: "toggleFlag" });

    lazyOperation.fire();
    toggleOperation.fire(new KeyPressedTrigger("Space"));

    expect(lazyFactory).toHaveBeenCalledTimes(1);
    expect(enabled.value).toBe(false);
  });

  it("fires indexed list events and supports sorting and filtering", () => {
    const list = new MutableListData<string>();
    const events: Array<{ type: string; index?: number; fromIndex?: number; toIndex?: number }> = [];
    list.addListener((event) => {
      events.push({
        type: event.type,
        index: event.index,
        fromIndex: event.fromIndex,
        toIndex: event.toIndex,
      });
    });

    list.add("first");
    list.addAt(0, "zeroth");
    list.add("second");
    list.sort((left, right) => left.localeCompare(right));

    expect(events[0]).toEqual({ type: "add", index: 0, fromIndex: undefined, toIndex: undefined });
    expect(events[1]).toEqual({ type: "add", index: 0, fromIndex: undefined, toIndex: undefined });
    expect(events.some((event) => event.type === "move")).toBe(true);
    expect(list.filter((item) => item.startsWith("s"))).toEqual(["second"]);
    expect(list.toArray()).toEqual(["first", "second", "zeroth"]);
  });

  it("manages list and tree data events", () => {
    const listData = new ListData(new StringCodec(), ["root"]);
    const listEvents: string[] = [];
    listData.addListener((event) => {
      listEvents.push(`${event.type}:${event.items.join(",")}`);
    });
    listData.add("child");
    listData.move(1, 0);
    listData.clear();

    const tree = new TreeData<string>();
    const treeEvents: string[] = [];
    tree.addListener((event) => {
      treeEvents.push(event.type);
    });
    const root = tree.addRoot("scene");
    const camera = tree.addChild(root, "camera");
    tree.updateNode(camera, "activeCamera");
    tree.reorderNode(camera, 0);
    tree.removeNode(camera);

    expect(listEvents).toEqual(["add:child", "move:child", "clear:"]);
    expect(tree.flatten().map((node) => node.value)).toEqual(["scene"]);
    expect(treeEvents).toEqual(["add", "add", "update", "move", "remove"]);
  });

  it("sorts and filters tree nodes with indexed move events", () => {
    const tree = new TreeData<string>();
    const moves: Array<{ value: string; previousIndex?: number; index?: number }> = [];
    const root = tree.addRoot("scene");
    tree.addChild(root, "charlie");
    tree.addChild(root, "alpha");
    tree.addChild(root, "bravo");
    tree.addListener((event) => {
      if (event.type === "move" && event.node) {
        moves.push({
          value: event.node.value,
          previousIndex: event.previousIndex,
          index: event.index,
        });
      }
    });

    tree.sortChildren(root, (left, right) => left.value.localeCompare(right.value));

    expect(root.children.map((node) => node.value)).toEqual(["alpha", "bravo", "charlie"]);
    expect(tree.filter((node) => node.value.startsWith("b")).map((node) => node.value)).toEqual([
      "bravo",
    ]);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves[0]).toEqual(expect.objectContaining({ previousIndex: 1, index: 0 }));
  });

  it("tracks item selection changes and persists through codecs", () => {
    const codec = new StringCodec();
    const state = new ItemSelectionState<string>("beta", {
      name: "selection",
      itemCodec: codec,
      items: ["alpha", "beta", "gamma"],
    });
    const changes: Array<{ previousValue: string | null; value: string | null }> = [];
    state.addListener(({ previousValue, value }) => {
      changes.push({ previousValue, value });
    });

    state.selectIndex(2);
    const serialized = state.serializeSelection();
    const restored = new ItemSelectionState<string>(null, {
      name: "selection.restored",
      itemCodec: codec,
      items: ["alpha", "beta", "gamma"],
    });
    restored.restoreSelection(serialized);

    expect(changes).toEqual([{ previousValue: "beta", value: "gamma" }]);
    expect(state.selectedIndex).toBe(2);
    expect(restored.value).toBe("gamma");
  });

  it("orders composite lifecycle with nested composites", () => {
    const lifecycle: string[] = [];

    class LoggingComposite extends SimpleComposite<{ kind: string }> {
      addChild(child: Composite<{ kind: string }>): void {
        this.registerSubComposite(child);
      }

      protected override handlePreActivation(): void {
        lifecycle.push(`${this.name}:pre`);
      }

      protected override handleActivated(): void {
        lifecycle.push(`${this.name}:activated`);
      }

      protected override handlePostDeactivation(): void {
        lifecycle.push(`${this.name}:post`);
      }

      protected override handleDeactivated(): void {
        lifecycle.push(`${this.name}:deactivated`);
      }
    }

    const parent = new LoggingComposite("parent", {
      createView: () => ({ kind: "parent-view" }),
    });
    const child = new LoggingComposite("child", {
      createView: () => ({ kind: "child-view" }),
    });
    parent.addChild(child);

    parent.activate();
    parent.deactivate();

    expect(lifecycle).toEqual([
      "parent:pre",
      "child:pre",
      "child:activated",
      "parent:activated",
      "child:post",
      "child:deactivated",
      "parent:post",
      "parent:deactivated",
    ]);
  });

  it("creates composite views, tab state, operation chains, and dialog wizard lifecycle", () => {
    const activation: string[] = [];
    const base = new Composite("scene-editor", {
      createView: () => ({ kind: "base-view" }),
    });
    base.addActivationListener((active) => activation.push(`base:${active}`));
    expect(base.getView()).toEqual({ kind: "base-view" });

    class LoggingSimpleComposite extends SimpleComposite<{ kind: string }> {
      protected override handleActivated(): void {
        activation.push("simple:activated");
      }

      protected override handleDeactivated(): void {
        activation.push("simple:deactivated");
      }
    }

    const simple = new LoggingSimpleComposite("simple", {
      createView: () => ({ kind: "simple-view" }),
    });
    simple.activate();
    simple.deactivate();

    const tabViewCreation = vi.fn((name: string) => ({ kind: `${name}-view` }));
    const alphaTab = new TabComposite("alpha", {
      createView: () => tabViewCreation("alpha"),
    });
    const betaTab = new TabComposite("beta", {
      createView: () => tabViewCreation("beta"),
    });
    const tab = new TabComposite("tab", {
      createView: () => ({ kind: "tab-view" }),
      closeable: true,
      tabs: [alphaTab, betaTab],
      selectedTabIndex: 1,
    });
    tab.customizeTitleComponentAppearance((appearance) => {
      appearance.tooltip = "Editor";
      appearance.classes.push("active");
    });
    expect(tab.tabs.map((childTab) => childTab.name)).toEqual(["alpha", "beta"]);
    expect(tab.selectedTab?.name).toBe("beta");
    expect(tabViewCreation).not.toHaveBeenCalled();
    tab.activate();
    expect(tabViewCreation).toHaveBeenCalledTimes(1);
    expect(tabViewCreation).toHaveBeenLastCalledWith("beta");
    tab.moveTab(1, 0);
    expect(tab.tabs.map((childTab) => childTab.name)).toEqual(["beta", "alpha"]);
    tab.selectTab(alphaTab);
    expect(tab.selectedTabState.selectedIndex).toBe(1);
    expect(tabViewCreation).toHaveBeenCalledTimes(2);
    expect(tab.ensureSelectedTabInitialized()).toEqual({ kind: "alpha-view" });

    const chainLog: string[] = [];
    const firstOperation = new ActionOperation(() => {
      chainLog.push("first");
      return undefined;
    }, { name: "first" });
    const secondOperation = new ActionOperation(() => {
      chainLog.push("second");
      return undefined;
    }, { name: "second" });
    firstOperation.thenTrigger(secondOperation);
    firstOperation.fire();

    const dialog = new DialogComposite<{ kind: string }, string>("dialog", {
      createView: () => ({ kind: "dialog-view" }),
    });
    dialog.open();
    dialog.accept("saved");

    const wizard = new WizardDialogComposite<{ kind: string }, string>(
      "wizard",
      ["intro", "details", "finish"],
      { createView: () => ({ kind: "wizard-view" }) },
    );
    wizard.open();
    wizard.nextOperation.fire();
    wizard.nextOperation.fire();
    wizard.finishOperation.fire();

    expect(tab.isCloseable).toBe(true);
    expect(tab.titleAppearance.tooltip).toBe("Editor");
    expect(dialog.lastResult).toBe("saved");
    expect(dialog.wasAccepted).toBe(true);
    expect(chainLog).toEqual(["first", "second"]);
    expect(wizard.lastResult).toBe("finish");
    expect(wizard.visitedSteps).toEqual(new Set([0, 1, 2]));
    expect(activation).toContain("simple:activated");
    expect(activation).toContain("simple:deactivated");
  });

  it("ports composite-backed view controllers and panels", () => {
    const lifecycle: string[] = [];

    class TokenView extends ViewController<string> {}

    class AttachmentView extends ViewController<string> {
      readonly events: string[] = [];

      protected override handleAddedTo(): void {
        this.events.push("added");
      }

      protected override handleRemovedFrom(): void {
        this.events.push("removed");
      }
    }

    class LoggingCompositeView extends CompositeView<Composite<LoggingCompositeView>> {
      override handleCompositePreActivation(): void {
        lifecycle.push("view:pre");
      }

      override handleCompositePostDeactivation(): void {
        lifecycle.push("view:post");
      }
    }

    class RefreshingPanel extends Panel {
      refreshCount = 0;

      protected override internalRefresh(): void {
        this.refreshCount += 1;
      }
    }

    const composite = new Composite<LoggingCompositeView>("view-backed", {
      createView: (owner) => new LoggingCompositeView(owner),
    });
    const view = composite.getView();
    composite.activate();
    composite.deactivate();

    expect(view.composite).toBe(composite);
    expect(composite.getRootComponent()).toBe(view);
    expect(lifecycle).toEqual(["view:pre", "view:post"]);

    const first = new TokenView("first");
    const second = new TokenView("second");
    const page = new PageAxisPanel(null, [first]);
    page.appendChild(second);
    expect(page.axis).toBe("page");
    expect(page.childViews).toEqual([first, second]);
    expect(first.parentView).toBe(page);

    const line = new LineAxisPanel();
    line.appendChild(first);
    expect(page.childViews).toEqual([second]);
    expect(line.childViews).toEqual([first]);
    expect(first.parentView).toBe(line);

    const attachmentView = new AttachmentView("attachment");
    const attachmentHost = new PageAxisPanel();
    attachmentHost.appendChild(attachmentView);
    attachmentHost.removeChild(attachmentView);
    expect(attachmentView.events).toEqual(["added", "removed"]);

    const border = new BorderPanel();
    border.setRegion("center", second);
    expect(border.getRegion("center")).toBe(second);
    border.clearRegion("center");
    expect(border.getRegion("center")).toBeUndefined();

    const refreshing = new RefreshingPanel(null, { refreshOnAttach: true });
    const host = new PageAxisPanel();
    host.appendChild(refreshing);
    refreshing.refreshLater();
    refreshing.refreshIfNecessary();
    expect(refreshing.refreshCount).toBe(2);

    const scrolling = new Composite<ScrollPane<Composite<any>>>("scrolling", {
      createView: (owner) => new ScrollPane(owner, new TokenView("content")),
    });
    const firstScrollView = scrolling.getView();
    expect(scrolling.getScrollPaneIfExists()).toBe(firstScrollView);
    expect(scrolling.getRootComponent()).toBe(firstScrollView);
    expect(firstScrollView.contentView?.parentView).toBe(firstScrollView);
    scrolling.releaseView();
    expect(firstScrollView.contentView?.parentView).toBeUndefined();
    expect(scrolling.getView()).not.toBe(firstScrollView);
  });
});
