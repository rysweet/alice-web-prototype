/**
 * Advanced accessibility patterns for the Alice IDE.
 *
 * Extends the base accessibility layer with:
 * - High-contrast mode detection
 * - Screen reader description builders for IDE elements
 * - Accessible drag-and-drop via live-region announcements
 * - ARIA tree view pattern for scene hierarchy
 * - ARIA code editor region pattern
 *
 * Follows modern ARIA practices: uses live-region announcements instead
 * of deprecated aria-grabbed/aria-dropeffect.
 */
import type { AriaLive } from "./accessibility-bridge";
import { AriaLiveRegion } from "./accessibility-bridge";

// ---------------------------------------------------------------------------
// High Contrast Detection
// ---------------------------------------------------------------------------

export interface MediaQueryLike {
  readonly matches: boolean;
}

export class HighContrastDetector {
  private forced = false;
  private forcedValue = false;

  /** Detect high-contrast mode. */
  detect(mediaQuery?: MediaQueryLike): boolean {
    if (this.forced) return this.forcedValue;
    if (mediaQuery) return mediaQuery.matches;
    if (typeof globalThis !== "undefined" && "matchMedia" in globalThis) {
      try {
        return (globalThis as any).matchMedia("(forced-colors: active)").matches;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Force a specific value for testing. */
  forceValue(value: boolean): void {
    this.forced = true;
    this.forcedValue = value;
  }

  /** Clear forced value. */
  clearForce(): void {
    this.forced = false;
  }
}

// ---------------------------------------------------------------------------
// Screen Reader Description Builder
// ---------------------------------------------------------------------------

export interface DescribableElement {
  readonly type: string;
  readonly label: string;
  readonly state?: string;
  readonly value?: string;
  readonly hint?: string;
  readonly shortcut?: string;
  readonly position?: { index: number; total: number };
}

export class ScreenReaderDescriptionBuilder {
  /** Build a full screen reader description for an IDE element. */
  describe(element: DescribableElement): string {
    const parts: string[] = [];
    parts.push(element.label);

    if (element.type) {
      parts.push(element.type);
    }

    if (element.state) {
      parts.push(element.state);
    }

    if (element.value !== undefined) {
      parts.push(`value: ${element.value}`);
    }

    if (element.position) {
      parts.push(`${element.position.index} of ${element.position.total}`);
    }

    if (element.shortcut) {
      parts.push(`shortcut: ${element.shortcut}`);
    }

    if (element.hint) {
      parts.push(element.hint);
    }

    return parts.join(", ");
  }

  /** Build a concise label (for aria-label). */
  label(element: DescribableElement): string {
    const parts = [element.label];
    if (element.state) parts.push(element.state);
    return parts.join(", ");
  }
}

// ---------------------------------------------------------------------------
// Accessible Drag-and-Drop (live-region announcements)
// ---------------------------------------------------------------------------

export class AccessibleDragDrop {
  private readonly region: AriaLiveRegion;
  private dragActive = false;
  private draggedItemLabel: string | null = null;

  constructor(region?: AriaLiveRegion) {
    this.region = region ?? new AriaLiveRegion();
  }

  /** Announce that a drag operation has started. */
  announcePickUp(itemLabel: string): void {
    this.dragActive = true;
    this.draggedItemLabel = itemLabel;
    this.region.announce(
      `Picked up ${itemLabel}. Use arrow keys to move, Enter to drop, Escape to cancel.`,
      "assertive",
    );
  }

  /** Announce the current drop target while dragging. */
  announceTarget(targetLabel: string, canDrop: boolean): void {
    if (!this.dragActive) return;
    if (canDrop) {
      this.region.announce(
        `Over ${targetLabel}. Press Enter to drop ${this.draggedItemLabel ?? "item"} here.`,
        "polite",
      );
    } else {
      this.region.announce(
        `${targetLabel}: drop not allowed.`,
        "polite",
      );
    }
  }

  /** Announce a successful drop. */
  announceDrop(targetLabel: string): void {
    this.region.announce(
      `Dropped ${this.draggedItemLabel ?? "item"} on ${targetLabel}.`,
      "assertive",
    );
    this.reset();
  }

  /** Announce a cancelled drag. */
  announceCancel(): void {
    this.region.announce(
      `Drag cancelled. ${this.draggedItemLabel ?? "Item"} returned to original position.`,
      "assertive",
    );
    this.reset();
  }

  private reset(): void {
    this.dragActive = false;
    this.draggedItemLabel = null;
  }

  get isDragActive(): boolean {
    return this.dragActive;
  }

  get liveRegion(): AriaLiveRegion {
    return this.region;
  }
}

// ---------------------------------------------------------------------------
// Accessible Tree View (scene hierarchy)
// ---------------------------------------------------------------------------

export interface TreeNode {
  readonly id: string;
  readonly label: string;
  readonly role?: string;
  readonly children?: readonly TreeNode[];
  readonly expanded?: boolean;
  readonly selected?: boolean;
  readonly level?: number;
}

export interface TreeNodeAttributes {
  role: "treeitem";
  "aria-label": string;
  "aria-level": number;
  "aria-setsize": number;
  "aria-posinset": number;
  "aria-expanded"?: string;
  "aria-selected"?: string;
  tabindex: string;
}

export class AccessibleTreeView {
  private readonly announcer: AriaLiveRegion;
  private activeItemId: string | null = null;

  constructor(announcer?: AriaLiveRegion) {
    this.announcer = announcer ?? new AriaLiveRegion();
  }

  /** Build ARIA attributes for a tree node. */
  buildNodeAttributes(
    node: TreeNode,
    level: number,
    posInSet: number,
    setSize: number,
    isActive: boolean,
  ): TreeNodeAttributes {
    const attrs: TreeNodeAttributes = {
      role: "treeitem",
      "aria-label": node.label,
      "aria-level": level,
      "aria-setsize": setSize,
      "aria-posinset": posInSet,
      tabindex: isActive ? "0" : "-1",
    };

    if (node.children && node.children.length > 0) {
      attrs["aria-expanded"] = String(node.expanded ?? false);
    }
    if (node.selected !== undefined) {
      attrs["aria-selected"] = String(node.selected);
    }

    return attrs;
  }

  /** Build attributes for all nodes in a flat list (for roving tabindex). */
  buildAll(nodes: readonly TreeNode[], level = 1): TreeNodeAttributes[] {
    const result: TreeNodeAttributes[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const isActive = this.activeItemId === nodes[i].id;
      result.push(this.buildNodeAttributes(nodes[i], level, i + 1, nodes.length, isActive));
      if (nodes[i].expanded && nodes[i].children) {
        result.push(...this.buildAll(nodes[i].children!, level + 1));
      }
    }
    return result;
  }

  /** Set the active item (for roving tabindex). */
  setActiveItem(id: string): void {
    this.activeItemId = id;
  }

  /** Announce an expand/collapse action. */
  announceToggle(node: TreeNode, expanded: boolean): void {
    const action = expanded ? "expanded" : "collapsed";
    const childCount = node.children?.length ?? 0;
    this.announcer.announce(
      `${node.label} ${action}${expanded && childCount > 0 ? `, ${childCount} items` : ""}`,
      "polite",
    );
  }

  /** Announce navigation to a tree item. */
  announceFocus(node: TreeNode, level: number): void {
    const parts = [node.label];
    if (node.role) parts.push(node.role);
    parts.push(`level ${level}`);
    if (node.children && node.children.length > 0) {
      parts.push(node.expanded ? "expanded" : "collapsed");
    }
    this.announcer.announce(parts.join(", "), "polite");
  }

  get liveRegion(): AriaLiveRegion {
    return this.announcer;
  }
}

// ---------------------------------------------------------------------------
// Accessible Code Editor Region
// ---------------------------------------------------------------------------

export interface CodeEditorState {
  readonly lineCount: number;
  readonly cursorLine: number;
  readonly cursorColumn: number;
  readonly selectionActive: boolean;
  readonly selectionLines?: number;
  readonly language?: string;
  readonly readOnly?: boolean;
}

export interface CodeEditorAttributes {
  role: "textbox";
  "aria-label": string;
  "aria-multiline": "true";
  "aria-readonly"?: string;
  "aria-description": string;
  tabindex: "0";
}

export class AccessibleCodeEditor {
  private readonly announcer: AriaLiveRegion;

  constructor(announcer?: AriaLiveRegion) {
    this.announcer = announcer ?? new AriaLiveRegion();
  }

  /** Build ARIA attributes for the code editor region. */
  buildAttributes(label: string, state: CodeEditorState): CodeEditorAttributes {
    const description = [
      state.language ? `${state.language} code editor` : "Code editor",
      `${state.lineCount} lines`,
      `Cursor at line ${state.cursorLine}, column ${state.cursorColumn}`,
    ].join(". ");

    const attrs: CodeEditorAttributes = {
      role: "textbox",
      "aria-label": label,
      "aria-multiline": "true",
      "aria-description": description,
      tabindex: "0",
    };

    if (state.readOnly) {
      attrs["aria-readonly"] = "true";
    }

    return attrs;
  }

  /** Announce cursor position change. */
  announceCursorMove(line: number, column: number): void {
    this.announcer.announce(`Line ${line}, column ${column}`, "polite");
  }

  /** Announce selection change. */
  announceSelection(lines: number): void {
    if (lines === 0) {
      this.announcer.announce("Selection cleared", "polite");
    } else {
      this.announcer.announce(`${lines} line${lines > 1 ? "s" : ""} selected`, "polite");
    }
  }

  /** Announce an error at a specific line. */
  announceError(line: number, message: string): void {
    this.announcer.announce(`Error on line ${line}: ${message}`, "assertive");
  }

  /** Announce code action (indent, comment, etc.). */
  announceAction(action: string): void {
    this.announcer.announce(action, "polite");
  }

  get liveRegion(): AriaLiveRegion {
    return this.announcer;
  }
}
