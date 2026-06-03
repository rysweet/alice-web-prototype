/**
 * Accessibility bridge extending Alice's accessibility layer with
 * ARIA-compliant attributes, live regions, focus trapping, reduced-motion
 * detection, and keyboard navigation for lists/trees/grids.
 *
 * Maps Alice-specific semantic roles (actor, prop, camera, etc.) to
 * valid WAI-ARIA roles for correct screen reader behavior.
 */
import type { AccessibilityRole, AccessibleSceneElement } from "./accessibility";

// ---------------------------------------------------------------------------
// ARIA Role Mapping
// ---------------------------------------------------------------------------

/** Valid WAI-ARIA roles used in the Alice IDE. */
export type AriaRole =
  | "treeitem"
  | "listitem"
  | "button"
  | "region"
  | "img"
  | "gridcell"
  | "group"
  | "toolbar"
  | "dialog"
  | "alert"
  | "status"
  | "tab"
  | "tabpanel"
  | "menuitem"
  | "none";

/** Maps Alice semantic roles to valid WAI-ARIA roles. */
const DEFAULT_ROLE_MAP: ReadonlyMap<AccessibilityRole, AriaRole> = new Map<AccessibilityRole, AriaRole>([
  ["scene", "region"],
  ["camera", "img"],
  ["actor", "treeitem"],
  ["prop", "treeitem"],
  ["light", "listitem"],
  ["ui", "group"],
]);

export class RoleMappingRegistry {
  private readonly mappings = new Map<string, AriaRole>(DEFAULT_ROLE_MAP);

  /** Get the ARIA role for an Alice semantic role. */
  resolve(aliceRole: string): AriaRole {
    return this.mappings.get(aliceRole) ?? "group";
  }

  /** Register or override a role mapping. */
  register(aliceRole: string, ariaRole: AriaRole): void {
    this.mappings.set(aliceRole, ariaRole);
  }

  /** List all registered mappings. */
  entries(): Array<[string, AriaRole]> {
    return [...this.mappings.entries()];
  }
}

// ---------------------------------------------------------------------------
// ARIA Attribute Builder
// ---------------------------------------------------------------------------

export interface AriaAttributes {
  role: AriaRole;
  "aria-label": string;
  "aria-description"?: string;
  "aria-selected"?: string;
  "aria-disabled"?: string;
  "aria-hidden"?: string;
  "aria-expanded"?: string;
  tabindex: string;
}

export class AriaAttributeBuilder {
  private readonly registry: RoleMappingRegistry;

  constructor(registry?: RoleMappingRegistry) {
    this.registry = registry ?? new RoleMappingRegistry();
  }

  /** Build ARIA attributes for an Alice scene element. */
  build(element: AccessibleSceneElement, tabIndex = 0): AriaAttributes {
    const role = this.registry.resolve(element.role ?? "ui");
    const attrs: AriaAttributes = {
      role,
      "aria-label": element.label,
      tabindex: String(element.tabIndex ?? tabIndex),
    };
    if (element.description) {
      attrs["aria-description"] = element.description;
    }
    if (element.selected !== undefined) {
      attrs["aria-selected"] = String(element.selected);
    }
    if (element.disabled !== undefined) {
      attrs["aria-disabled"] = String(element.disabled);
    }
    if (element.hidden !== undefined) {
      attrs["aria-hidden"] = String(element.hidden);
    }
    return attrs;
  }

  /** Build attributes for multiple elements. */
  buildAll(elements: Iterable<AccessibleSceneElement>): AriaAttributes[] {
    let index = 0;
    const result: AriaAttributes[] = [];
    for (const element of elements) {
      result.push(this.build(element, index));
      index++;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Live Region Manager
// ---------------------------------------------------------------------------

export type AriaLive = "off" | "polite" | "assertive";

export interface LiveRegionMessage {
  readonly text: string;
  readonly priority: AriaLive;
  readonly timestamp: number;
}

/**
 * Manages ARIA live region announcements for screen readers.
 * Queues messages with priority (polite/assertive) and exposes
 * the pending message for the DOM live region to consume.
 */
export class AriaLiveRegion {
  private readonly messages: LiveRegionMessage[] = [];
  private current: LiveRegionMessage | null = null;

  /** Announce a message at the given priority. */
  announce(text: string, priority: AriaLive = "polite"): LiveRegionMessage {
    const message: LiveRegionMessage = { text, priority, timestamp: Date.now() };
    this.messages.push(message);
    if (priority === "assertive" || !this.current) {
      this.current = message;
    }
    return message;
  }

  /** Get the current announcement for the live region. */
  get currentMessage(): LiveRegionMessage | null {
    return this.current;
  }

  /** Get the current text for the live region element. */
  get text(): string {
    return this.current?.text ?? "";
  }

  /** Clear the current announcement. */
  clear(): void {
    this.current = null;
  }

  /** Get all announcements (for audit/testing). */
  get history(): readonly LiveRegionMessage[] {
    return [...this.messages];
  }
}

// ---------------------------------------------------------------------------
// Accessibility Announcer (Queued)
// ---------------------------------------------------------------------------

/**
 * Queued screen reader announcer that batches rapid announcements
 * and prevents announcement flooding.
 */
export class AccessibilityAnnouncer {
  private readonly queue: string[] = [];
  private readonly region: AriaLiveRegion;
  private readonly minIntervalMs: number;
  private lastAnnounceTime = 0;

  constructor(region?: AriaLiveRegion, minIntervalMs = 150) {
    this.region = region ?? new AriaLiveRegion();
    this.minIntervalMs = minIntervalMs;
  }

  /** Enqueue an announcement. */
  announce(text: string, priority: AriaLive = "polite"): void {
    const now = Date.now();
    if (now - this.lastAnnounceTime >= this.minIntervalMs) {
      this.region.announce(text, priority);
      this.lastAnnounceTime = now;
    } else {
      this.queue.push(text);
    }
  }

  /** Flush the queue, announcing the most recent pending message. */
  flush(): string | null {
    if (this.queue.length === 0) return null;
    const text = this.queue[this.queue.length - 1];
    this.queue.length = 0;
    this.region.announce(text, "polite");
    this.lastAnnounceTime = Date.now();
    return text;
  }

  /** Get the underlying live region for DOM binding. */
  get liveRegion(): AriaLiveRegion {
    return this.region;
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

// ---------------------------------------------------------------------------
// Focus Trap Manager
// ---------------------------------------------------------------------------

/**
 * Manages focus trapping within modal dialogs or panels.
 * Tracks a focus group (ordered list of element IDs) and cycles
 * focus within the group on Tab/Shift+Tab.
 */
export class FocusTrapManager {
  private readonly groups = new Map<string, string[]>();
  private activeGroupId: string | null = null;
  private focusIndex = 0;

  /** Create a focus group for trapping. */
  createGroup(groupId: string, elementIds: readonly string[]): void {
    this.groups.set(groupId, [...elementIds]);
  }

  /** Remove a focus group. */
  removeGroup(groupId: string): boolean {
    if (this.activeGroupId === groupId) {
      this.activeGroupId = null;
    }
    return this.groups.delete(groupId);
  }

  /** Activate a focus group (begin trapping). */
  activate(groupId: string): boolean {
    if (!this.groups.has(groupId)) return false;
    this.activeGroupId = groupId;
    this.focusIndex = 0;
    return true;
  }

  /** Deactivate the current focus trap. */
  deactivate(): void {
    this.activeGroupId = null;
    this.focusIndex = 0;
  }

  /** Whether a focus trap is currently active. */
  get isActive(): boolean {
    return this.activeGroupId !== null;
  }

  /** Get the current focus group's element IDs. */
  get currentGroup(): readonly string[] {
    if (!this.activeGroupId) return [];
    return this.groups.get(this.activeGroupId) ?? [];
  }

  /** Get the currently focused element ID. */
  get currentElementId(): string | null {
    const group = this.currentGroup;
    if (group.length === 0) return null;
    return group[this.focusIndex % group.length];
  }

  /** Move focus forward (Tab). Returns the new focused element ID. */
  focusNext(): string | null {
    const group = this.currentGroup;
    if (group.length === 0) return null;
    this.focusIndex = (this.focusIndex + 1) % group.length;
    return group[this.focusIndex];
  }

  /** Move focus backward (Shift+Tab). Returns the new focused element ID. */
  focusPrevious(): string | null {
    const group = this.currentGroup;
    if (group.length === 0) return null;
    this.focusIndex = (this.focusIndex - 1 + group.length) % group.length;
    return group[this.focusIndex];
  }
}

// ---------------------------------------------------------------------------
// Reduced Motion Query
// ---------------------------------------------------------------------------

/**
 * Utility to respect user's prefers-reduced-motion preference.
 * In non-browser environments, defaults to false (motion allowed).
 */
export function queryReducedMotion(mediaQuery?: { matches: boolean }): boolean {
  if (mediaQuery) return mediaQuery.matches;
  if (typeof globalThis !== "undefined" && "matchMedia" in globalThis) {
    try {
      return (globalThis as any).matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Returns the appropriate animation duration based on motion preference.
 * Reduced motion returns 0; otherwise returns the full duration.
 */
export function resolveAnimationDuration(durationMs: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : durationMs;
}

// ---------------------------------------------------------------------------
// Keyboard Navigation Manager
// ---------------------------------------------------------------------------

export type NavigationOrientation = "vertical" | "horizontal" | "grid";

export interface NavigationOptions {
  orientation: NavigationOrientation;
  wrap?: boolean;
  columns?: number;
}

/**
 * Manages arrow-key navigation within lists, trees, and grids.
 * Tracks a flat list of navigable item IDs and responds to
 * directional movement commands.
 */
export class KeyboardNavigationManager {
  private readonly items: string[] = [];
  private currentIndex = -1;
  private readonly options: Required<NavigationOptions>;

  constructor(options: NavigationOptions) {
    this.options = {
      orientation: options.orientation,
      wrap: options.wrap ?? true,
      columns: options.columns ?? 1,
    };
  }

  /** Set the list of navigable items. Resets focus. */
  setItems(ids: readonly string[]): void {
    this.items.length = 0;
    this.items.push(...ids);
    this.currentIndex = ids.length > 0 ? 0 : -1;
  }

  /** Get the currently focused item ID. */
  get currentItemId(): string | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.items.length) return null;
    return this.items[this.currentIndex];
  }

  /** Get all navigable item IDs. */
  get itemIds(): readonly string[] {
    return [...this.items];
  }

  /** Move focus to a specific item by ID. Returns success. */
  focusItem(id: string): boolean {
    const index = this.items.indexOf(id);
    if (index < 0) return false;
    this.currentIndex = index;
    return true;
  }

  /** Navigate forward (Down in vertical, Right in horizontal). */
  moveNext(): string | null {
    return this.move(1);
  }

  /** Navigate backward (Up in vertical, Left in horizontal). */
  movePrevious(): string | null {
    return this.move(-1);
  }

  /** Navigate by row in grid mode. */
  moveNextRow(): string | null {
    if (this.options.orientation !== "grid") return null;
    return this.move(this.options.columns);
  }

  /** Navigate by row backward in grid mode. */
  movePreviousRow(): string | null {
    if (this.options.orientation !== "grid") return null;
    return this.move(-this.options.columns);
  }

  /** Move to the first item. */
  moveFirst(): string | null {
    if (this.items.length === 0) return null;
    this.currentIndex = 0;
    return this.items[0];
  }

  /** Move to the last item. */
  moveLast(): string | null {
    if (this.items.length === 0) return null;
    this.currentIndex = this.items.length - 1;
    return this.items[this.currentIndex];
  }

  private move(delta: number): string | null {
    if (this.items.length === 0) return null;
    let next = this.currentIndex + delta;
    if (this.options.wrap) {
      next = ((next % this.items.length) + this.items.length) % this.items.length;
    } else {
      next = Math.max(0, Math.min(next, this.items.length - 1));
    }
    this.currentIndex = next;
    return this.items[this.currentIndex];
  }
}
