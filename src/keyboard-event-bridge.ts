/**
 * Bridges browser KeyboardEvent to the ShortcutManager combo format.
 *
 * Converts native keyboard events into normalized combo strings compatible
 * with the existing keyboard-shortcuts.ts system, and provides a default
 * set of IDE shortcuts mapping Java Alice key bindings to browser events.
 */
import type { ShortcutDefinition } from "./keyboard-shortcuts";

// ---------------------------------------------------------------------------
// Keyboard Event Abstraction
// ---------------------------------------------------------------------------

/** Minimal KeyboardEvent-like interface for testability without DOM. */
export interface KeyboardEventLike {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly repeat?: boolean;
}

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

export type Platform = "mac" | "windows" | "linux";

/** Detect platform from navigator-like user agent. */
export function detectPlatform(userAgent = ""): Platform {
  const ua = userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "windows";
}

/**
 * Returns the platform-specific primary modifier name.
 * On Mac, the primary modifier is "meta" (Cmd). Elsewhere it is "ctrl".
 */
export function primaryModifier(platform: Platform = "windows"): "meta" | "ctrl" {
  return platform === "mac" ? "meta" : "ctrl";
}

// ---------------------------------------------------------------------------
// Combo Normalization
// ---------------------------------------------------------------------------

const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"] as const;
const KEY_ALIASES: Record<string, string> = {
  " ": "space",
  "arrowup": "up",
  "arrowdown": "down",
  "arrowleft": "left",
  "arrowright": "right",
  "escape": "esc",
  "delete": "del",
};

function normalizeKeyName(key: string): string {
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/**
 * Converts a KeyboardEvent-like object into a normalized combo string
 * compatible with ShortcutMap (e.g. "ctrl+shift+s").
 *
 * Modifier keys alone (Shift, Ctrl, Alt, Meta) produce an empty string
 * since they don't represent complete shortcuts.
 */
export function comboFromKeyboardEvent(event: KeyboardEventLike): string {
  const keyName = normalizeKeyName(event.key);

  // Ignore bare modifier presses
  if (["control", "shift", "alt", "meta"].includes(keyName)) {
    return "";
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.metaKey) parts.push("meta");
  parts.push(keyName);

  return parts.join("+");
}

/**
 * Resolves a platform-agnostic "mod+key" combo to the platform-specific form.
 * "mod" becomes "ctrl" on Windows/Linux, "meta" on Mac.
 */
export function resolveModCombo(combo: string, platform: Platform = "windows"): string {
  const mod = primaryModifier(platform);
  return combo
    .split("+")
    .map((part) => (part.trim().toLowerCase() === "mod" ? mod : part.trim().toLowerCase()))
    .join("+");
}

// ---------------------------------------------------------------------------
// Keyboard Event Bridge
// ---------------------------------------------------------------------------

/** Minimal event-target interface for attaching keyboard listeners. */
export interface EventTargetLike {
  addEventListener(type: string, listener: (event: KeyboardEventLike) => void): void;
  removeEventListener(type: string, listener: (event: KeyboardEventLike) => void): void;
}

/** Dispatch target interface matching ShortcutManager's trigger signature. */
export interface ShortcutDispatcher {
  trigger(combo: string, contexts?: string[]): { id: string }[];
}

export interface KeyboardBridgeOptions {
  /** Active contexts for shortcut resolution. */
  contexts?: () => string[];
  /** Platform for mod resolution. Defaults to auto-detect. */
  platform?: Platform;
  /** Whether to suppress repeated keydown events. Defaults to true. */
  ignoreRepeat?: boolean;
  /** Predicate to skip events (e.g., from text inputs). */
  shouldIgnore?: (event: KeyboardEventLike) => boolean;
}

/**
 * Attaches to a DOM-like event target and dispatches keyboard events
 * to a ShortcutManager (or any ShortcutDispatcher).
 *
 * Returns whether each event was handled (matched a shortcut) so callers
 * can decide whether to call preventDefault.
 */
export class KeyboardEventBridge {
  private readonly dispatcher: ShortcutDispatcher;
  private readonly options: Required<KeyboardBridgeOptions>;
  private handler: ((event: KeyboardEventLike) => void) | null = null;
  private target: EventTargetLike | null = null;

  /** Events that were dispatched and matched at least one shortcut. */
  readonly handledCombos: string[] = [];

  constructor(dispatcher: ShortcutDispatcher, options: KeyboardBridgeOptions = {}) {
    this.dispatcher = dispatcher;
    this.options = {
      contexts: options.contexts ?? (() => []),
      platform: options.platform ?? "windows",
      ignoreRepeat: options.ignoreRepeat ?? true,
      shouldIgnore: options.shouldIgnore ?? (() => false),
    };
  }

  /** Start listening on the given target. */
  attach(target: EventTargetLike): void {
    this.detach();
    this.handler = (event) => this.onKeyDown(event);
    target.addEventListener("keydown", this.handler);
    this.target = target;
  }

  /** Stop listening. */
  detach(): void {
    if (this.handler && this.target) {
      this.target.removeEventListener("keydown", this.handler);
    }
    this.handler = null;
    this.target = null;
  }

  /** Process a single keyboard event. Returns true if a shortcut matched. */
  handleEvent(event: KeyboardEventLike): boolean {
    return this.onKeyDown(event);
  }

  private onKeyDown(event: KeyboardEventLike): boolean {
    if (this.options.ignoreRepeat && event.repeat) return false;
    if (this.options.shouldIgnore(event)) return false;

    const combo = comboFromKeyboardEvent(event);
    if (!combo) return false;

    const contexts = this.options.contexts();
    const matched = this.dispatcher.trigger(combo, contexts);
    if (matched.length > 0) {
      this.handledCombos.push(combo);
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Default IDE Shortcuts
// ---------------------------------------------------------------------------

/**
 * Default Alice IDE keyboard shortcuts, mapping Java Alice's key bindings
 * to browser-compatible shortcut definitions.
 *
 * Uses "mod" as a platform-agnostic modifier (Ctrl on Win/Linux, Cmd on Mac).
 * Consumers should resolve "mod" using resolveModCombo() before registering.
 */
export const DEFAULT_IDE_SHORTCUTS: readonly ShortcutDefinition[] = Object.freeze([
  // File operations
  { id: "new-project", combo: "mod+n", description: "New project", group: "File", contexts: ["global"] },
  { id: "open-project", combo: "mod+o", description: "Open project", group: "File", contexts: ["global"] },
  { id: "save-project", combo: "mod+s", description: "Save project", group: "File", contexts: ["global"] },
  { id: "save-as", combo: "mod+shift+s", description: "Save project as", group: "File", contexts: ["global"] },
  { id: "export-video", combo: "mod+shift+e", description: "Export video", group: "File", contexts: ["global"] },

  // Edit operations
  { id: "undo", combo: "mod+z", description: "Undo", group: "Edit", contexts: ["global"] },
  { id: "redo", combo: "mod+y", description: "Redo", group: "Edit", contexts: ["global"] },
  { id: "redo-alt", combo: "mod+shift+z", description: "Redo (alternate)", group: "Edit", contexts: ["global"] },
  { id: "cut", combo: "mod+x", description: "Cut", group: "Edit", contexts: ["editor", "scene"] },
  { id: "copy", combo: "mod+c", description: "Copy", group: "Edit", contexts: ["editor", "scene"] },
  { id: "paste", combo: "mod+v", description: "Paste", group: "Edit", contexts: ["editor", "scene"] },
  { id: "delete", combo: "del", description: "Delete selected", group: "Edit", contexts: ["editor", "scene"] },
  { id: "delete-alt", combo: "backspace", description: "Delete selected (alt)", group: "Edit", contexts: ["editor", "scene"] },
  { id: "select-all", combo: "mod+a", description: "Select all", group: "Edit", contexts: ["editor", "scene"] },
  { id: "duplicate", combo: "mod+d", description: "Duplicate selected", group: "Edit", contexts: ["scene"] },

  // View / Navigation
  { id: "zoom-in", combo: "mod+=", description: "Zoom in", group: "View", contexts: ["scene"] },
  { id: "zoom-out", combo: "mod+-", description: "Zoom out", group: "View", contexts: ["scene"] },
  { id: "reset-view", combo: "mod+0", description: "Reset camera view", group: "View", contexts: ["scene"] },

  // Runtime
  { id: "run", combo: "mod+r", description: "Run world", group: "Runtime", contexts: ["global"] },
  { id: "run-alt", combo: "f5", description: "Run world (F5)", group: "Runtime", contexts: ["global"] },
  { id: "stop", combo: "mod+shift+r", description: "Stop run", group: "Runtime", contexts: ["runtime"] },
  { id: "restart", combo: "mod+shift+f5", description: "Restart run", group: "Runtime", contexts: ["runtime"] },

  // Code editing
  { id: "rename", combo: "f2", description: "Rename", group: "Code", contexts: ["editor"] },
  { id: "find", combo: "mod+f", description: "Find", group: "Code", contexts: ["editor"] },
  { id: "toggle-comment", combo: "mod+/", description: "Toggle comment", group: "Code", contexts: ["editor"] },

  // Scene editing
  { id: "toggle-grid", combo: "mod+g", description: "Toggle grid", group: "Scene", contexts: ["scene"] },
  { id: "toggle-axes", combo: "mod+shift+a", description: "Toggle axes", group: "Scene", contexts: ["scene"] },

  // Help
  { id: "help", combo: "f1", description: "Open help", group: "Help", contexts: ["global"] },
  { id: "shortcuts-help", combo: "mod+shift+/", description: "Keyboard shortcuts", group: "Help", contexts: ["global"] },
]);

/**
 * Returns DEFAULT_IDE_SHORTCUTS with "mod" resolved for the given platform.
 */
export function resolveDefaultShortcuts(platform: Platform = "windows"): ShortcutDefinition[] {
  return DEFAULT_IDE_SHORTCUTS.map((shortcut) => ({
    ...shortcut,
    combo: resolveModCombo(shortcut.combo, platform),
  }));
}
