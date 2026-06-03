import { describe, expect, it } from "vitest";
import {
  AccessibilityAnnouncer,
  AriaAttributeBuilder,
  AriaLiveRegion,
  FocusTrapManager,
  KeyboardNavigationManager,
  RoleMappingRegistry,
  queryReducedMotion,
  resolveAnimationDuration,
} from "../src/accessibility-bridge";

describe("accessibility-bridge", () => {
  // ---------- RoleMappingRegistry ----------

  it("maps Alice roles to valid WAI-ARIA roles", () => {
    const registry = new RoleMappingRegistry();
    expect(registry.resolve("actor")).toBe("treeitem");
    expect(registry.resolve("prop")).toBe("treeitem");
    expect(registry.resolve("camera")).toBe("img");
    expect(registry.resolve("scene")).toBe("region");
    expect(registry.resolve("light")).toBe("listitem");
    expect(registry.resolve("ui")).toBe("group");
  });

  it("returns group as default for unknown roles", () => {
    const registry = new RoleMappingRegistry();
    expect(registry.resolve("unknown-role")).toBe("group");
  });

  it("allows custom role overrides", () => {
    const registry = new RoleMappingRegistry();
    registry.register("actor", "button");
    expect(registry.resolve("actor")).toBe("button");
  });

  it("lists all registered mappings", () => {
    const registry = new RoleMappingRegistry();
    const entries = registry.entries();
    expect(entries.length).toBeGreaterThanOrEqual(6);
    expect(entries.find(([k]) => k === "scene")?.[1]).toBe("region");
  });

  // ---------- AriaAttributeBuilder ----------

  it("builds ARIA attributes for scene elements", () => {
    const builder = new AriaAttributeBuilder();
    const attrs = builder.build({
      id: "rabbit",
      label: "Rabbit",
      role: "actor",
      description: "Main character",
      selected: true,
      tabIndex: 3,
    });

    expect(attrs.role).toBe("treeitem");
    expect(attrs["aria-label"]).toBe("Rabbit");
    expect(attrs["aria-description"]).toBe("Main character");
    expect(attrs["aria-selected"]).toBe("true");
    expect(attrs.tabindex).toBe("3");
  });

  it("builds attributes for elements without explicit role", () => {
    const builder = new AriaAttributeBuilder();
    const attrs = builder.build({ id: "btn", label: "Button" });
    expect(attrs.role).toBe("group");
  });

  it("builds attributes for multiple elements", () => {
    const builder = new AriaAttributeBuilder();
    const attrs = builder.buildAll([
      { id: "a", label: "A", role: "actor" },
      { id: "b", label: "B", role: "camera" },
    ]);
    expect(attrs.length).toBe(2);
    expect(attrs[0].role).toBe("treeitem");
    expect(attrs[1].role).toBe("img");
  });

  it("includes disabled and hidden attributes", () => {
    const builder = new AriaAttributeBuilder();
    const attrs = builder.build({
      id: "hidden-item",
      label: "Hidden",
      disabled: true,
      hidden: true,
    });
    expect(attrs["aria-disabled"]).toBe("true");
    expect(attrs["aria-hidden"]).toBe("true");
  });

  // ---------- AriaLiveRegion ----------

  it("announces polite messages", () => {
    const region = new AriaLiveRegion();
    region.announce("Entity added", "polite");

    expect(region.text).toBe("Entity added");
    expect(region.currentMessage?.priority).toBe("polite");
  });

  it("assertive messages take priority", () => {
    const region = new AriaLiveRegion();
    region.announce("low priority", "polite");
    region.announce("URGENT", "assertive");

    expect(region.text).toBe("URGENT");
  });

  it("clears the current announcement", () => {
    const region = new AriaLiveRegion();
    region.announce("test");
    region.clear();
    expect(region.text).toBe("");
    expect(region.currentMessage).toBeNull();
  });

  it("tracks announcement history", () => {
    const region = new AriaLiveRegion();
    region.announce("first");
    region.announce("second");
    expect(region.history.length).toBe(2);
    expect(region.history[0].text).toBe("first");
  });

  // ---------- AccessibilityAnnouncer ----------

  it("announces immediately when not throttled", () => {
    const region = new AriaLiveRegion();
    const announcer = new AccessibilityAnnouncer(region, 0);
    announcer.announce("test");
    expect(region.text).toBe("test");
  });

  it("queues rapid announcements", () => {
    const region = new AriaLiveRegion();
    const announcer = new AccessibilityAnnouncer(region, 100_000);
    announcer.announce("first");
    announcer.announce("second");
    announcer.announce("third");

    expect(announcer.pendingCount).toBe(2);
  });

  it("flushes the queue with the most recent message", () => {
    const region = new AriaLiveRegion();
    const announcer = new AccessibilityAnnouncer(region, 100_000);
    announcer.announce("first");
    announcer.announce("second");
    announcer.announce("third");

    const flushed = announcer.flush();
    expect(flushed).toBe("third");
    expect(announcer.pendingCount).toBe(0);
  });

  it("returns null when flushing empty queue", () => {
    const announcer = new AccessibilityAnnouncer();
    expect(announcer.flush()).toBeNull();
  });

  // ---------- FocusTrapManager ----------

  it("creates and activates a focus group", () => {
    const trap = new FocusTrapManager();
    trap.createGroup("dialog", ["ok-btn", "cancel-btn", "input-field"]);
    expect(trap.activate("dialog")).toBe(true);
    expect(trap.isActive).toBe(true);
    expect(trap.currentElementId).toBe("ok-btn");
  });

  it("cycles focus forward and backward with wrapping", () => {
    const trap = new FocusTrapManager();
    trap.createGroup("dialog", ["a", "b", "c"]);
    trap.activate("dialog");

    expect(trap.focusNext()).toBe("b");
    expect(trap.focusNext()).toBe("c");
    expect(trap.focusNext()).toBe("a"); // wraps
    expect(trap.focusPrevious()).toBe("c"); // wraps back
  });

  it("deactivates the focus trap", () => {
    const trap = new FocusTrapManager();
    trap.createGroup("dialog", ["a", "b"]);
    trap.activate("dialog");
    trap.deactivate();

    expect(trap.isActive).toBe(false);
    expect(trap.currentElementId).toBeNull();
    expect(trap.focusNext()).toBeNull();
  });

  it("returns false when activating a nonexistent group", () => {
    const trap = new FocusTrapManager();
    expect(trap.activate("nope")).toBe(false);
  });

  it("removes a focus group", () => {
    const trap = new FocusTrapManager();
    trap.createGroup("g1", ["a", "b"]);
    trap.activate("g1");
    trap.removeGroup("g1");
    expect(trap.isActive).toBe(false);
  });

  // ---------- Reduced Motion ----------

  it("detects reduced motion from media query", () => {
    expect(queryReducedMotion({ matches: true })).toBe(true);
    expect(queryReducedMotion({ matches: false })).toBe(false);
  });

  it("defaults to false without media query", () => {
    expect(queryReducedMotion()).toBe(false);
  });

  it("resolves animation duration based on motion preference", () => {
    expect(resolveAnimationDuration(300, true)).toBe(0);
    expect(resolveAnimationDuration(300, false)).toBe(300);
  });

  // ---------- KeyboardNavigationManager ----------

  it("navigates a vertical list with wrapping", () => {
    const nav = new KeyboardNavigationManager({ orientation: "vertical", wrap: true });
    nav.setItems(["a", "b", "c"]);

    expect(nav.currentItemId).toBe("a");
    expect(nav.moveNext()).toBe("b");
    expect(nav.moveNext()).toBe("c");
    expect(nav.moveNext()).toBe("a"); // wraps
    expect(nav.movePrevious()).toBe("c"); // wraps back
  });

  it("clamps without wrapping", () => {
    const nav = new KeyboardNavigationManager({ orientation: "vertical", wrap: false });
    nav.setItems(["a", "b", "c"]);

    expect(nav.movePrevious()).toBe("a"); // clamped at start
    nav.moveLast();
    expect(nav.moveNext()).toBe("c"); // clamped at end
  });

  it("navigates grid by row", () => {
    const nav = new KeyboardNavigationManager({ orientation: "grid", columns: 3, wrap: true });
    nav.setItems(["a", "b", "c", "d", "e", "f"]);

    expect(nav.currentItemId).toBe("a");
    expect(nav.moveNextRow()).toBe("d"); // skip 3 columns
    expect(nav.movePreviousRow()).toBe("a"); // back up
  });

  it("ignores row navigation in non-grid mode", () => {
    const nav = new KeyboardNavigationManager({ orientation: "vertical" });
    nav.setItems(["a", "b", "c"]);
    expect(nav.moveNextRow()).toBeNull();
    expect(nav.movePreviousRow()).toBeNull();
  });

  it("focuses a specific item by ID", () => {
    const nav = new KeyboardNavigationManager({ orientation: "vertical" });
    nav.setItems(["a", "b", "c"]);
    expect(nav.focusItem("b")).toBe(true);
    expect(nav.currentItemId).toBe("b");
    expect(nav.focusItem("unknown")).toBe(false);
  });

  it("moves to first and last items", () => {
    const nav = new KeyboardNavigationManager({ orientation: "vertical" });
    nav.setItems(["a", "b", "c"]);

    expect(nav.moveLast()).toBe("c");
    expect(nav.moveFirst()).toBe("a");
  });

  it("handles empty item list", () => {
    const nav = new KeyboardNavigationManager({ orientation: "vertical" });
    nav.setItems([]);

    expect(nav.currentItemId).toBeNull();
    expect(nav.moveNext()).toBeNull();
    expect(nav.moveFirst()).toBeNull();
    expect(nav.moveLast()).toBeNull();
  });

  it("returns item IDs", () => {
    const nav = new KeyboardNavigationManager({ orientation: "horizontal" });
    nav.setItems(["x", "y"]);
    expect(nav.itemIds).toEqual(["x", "y"]);
  });
});
