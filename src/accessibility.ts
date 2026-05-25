export type AccessibilityRole = "scene" | "camera" | "actor" | "prop" | "light" | "ui";
export type ShortcutCategory = "navigation" | "editing" | "runtime" | "help";

export interface AccessibleSceneElement {
  id: string;
  label: string;
  role?: AccessibilityRole;
  description?: string;
  tabIndex?: number;
  selected?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  screenReaderHint?: string;
  shortcutIds?: string[];
}

export interface ScreenReaderAnnotation {
  id: string;
  label: string;
  role: AccessibilityRole;
  tabIndex: number;
  ariaLabel: string;
  ariaDescription: string;
  announcement: string;
  shortcuts: KeyboardShortcut[];
}

export interface KeyboardShortcut {
  id: string;
  category: ShortcutCategory;
  action: string;
  keys: string[];
  description: string;
  keywords: string[];
}

export interface HighContrastTheme {
  enabled: boolean;
  background: string;
  foreground: string;
  accent: string;
  focusRing: string;
  border: string;
  subdued: string;
}

export interface HighContrastStyle {
  background: string;
  color: string;
  borderColor: string;
  focusRing: string;
}

const DEFAULT_ROLE: AccessibilityRole = "ui";

export const DEFAULT_HIGH_CONTRAST_THEME: Readonly<HighContrastTheme> = Object.freeze({
  enabled: true,
  background: "#000000",
  foreground: "#ffffff",
  accent: "#ffd400",
  focusRing: "#00ffff",
  border: "#ffffff",
  subdued: "#d9d9d9",
});

const KEYBOARD_SHORTCUTS: ReadonlyArray<KeyboardShortcut> = Object.freeze([
  {
    id: "focus-next",
    category: "navigation",
    action: "Move to the next focusable control",
    keys: ["Tab"],
    description: "Advances keyboard focus using the configured tab order.",
    keywords: ["focus", "tab", "next", "navigation"],
  },
  {
    id: "focus-previous",
    category: "navigation",
    action: "Move to the previous focusable control",
    keys: ["Shift+Tab"],
    description: "Moves keyboard focus backward through the tab order.",
    keywords: ["focus", "shift", "tab", "previous"],
  },
  {
    id: "activate-selection",
    category: "editing",
    action: "Activate the focused scene element",
    keys: ["Enter", "Space"],
    description: "Triggers the primary action for the current focus target.",
    keywords: ["activate", "select", "enter", "space"],
  },
  {
    id: "run-world",
    category: "runtime",
    action: "Run the current world",
    keys: ["Ctrl+R"],
    description: "Starts a preview run without leaving keyboard navigation.",
    keywords: ["run", "world", "preview", "runtime"],
  },
  {
    id: "open-shortcuts",
    category: "help",
    action: "Open keyboard shortcut help",
    keys: ["Ctrl+/"],
    description: "Shows shortcut documentation and accessibility guidance.",
    keywords: ["help", "shortcuts", "documentation", "keyboard"],
  },
]);

function cloneShortcut(shortcut: KeyboardShortcut): KeyboardShortcut {
  return {
    ...shortcut,
    keys: [...shortcut.keys],
    keywords: [...shortcut.keywords],
  };
}

function normalizeTabIndex(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : Number.MAX_SAFE_INTEGER;
}

interface TabRecord {
  element: AccessibleSceneElement;
  sequence: number;
}

export class TabOrderManager {
  private readonly records = new Map<string, TabRecord>();
  private sequence = 0;

  constructor(elements: Iterable<AccessibleSceneElement> = []) {
    for (const element of elements) {
      this.register(element);
    }
  }

  register(element: AccessibleSceneElement): void {
    const existing = this.records.get(element.id);
    this.records.set(element.id, {
      element: { ...element },
      sequence: existing?.sequence ?? this.sequence++,
    });
  }

  unregister(id: string): boolean {
    return this.records.delete(id);
  }

  getOrderedElements(): AccessibleSceneElement[] {
    return [...this.records.values()]
      .filter(({ element }) => !element.hidden && !element.disabled)
      .sort((left, right) => {
        const leftIndex = normalizeTabIndex(left.element.tabIndex);
        const rightIndex = normalizeTabIndex(right.element.tabIndex);
        return leftIndex - rightIndex || left.sequence - right.sequence;
      })
      .map(({ element }, index) => ({
        ...element,
        role: element.role ?? DEFAULT_ROLE,
        tabIndex: Number.isFinite(element.tabIndex) ? element.tabIndex : index,
      }));
  }

  next(currentId?: string): AccessibleSceneElement | null {
    const ordered = this.getOrderedElements();
    if (ordered.length === 0) {
      return null;
    }
    if (!currentId) {
      return ordered[0] ?? null;
    }
    const index = ordered.findIndex((element) => element.id === currentId);
    if (index === -1) {
      return ordered[0] ?? null;
    }
    return ordered[(index + 1) % ordered.length] ?? null;
  }

  previous(currentId?: string): AccessibleSceneElement | null {
    const ordered = this.getOrderedElements();
    if (ordered.length === 0) {
      return null;
    }
    if (!currentId) {
      return ordered[ordered.length - 1] ?? null;
    }
    const index = ordered.findIndex((element) => element.id === currentId);
    if (index === -1) {
      return ordered[ordered.length - 1] ?? null;
    }
    return ordered[(index - 1 + ordered.length) % ordered.length] ?? null;
  }
}

export function listKeyboardShortcuts(category?: ShortcutCategory): KeyboardShortcut[] {
  return KEYBOARD_SHORTCUTS
    .filter((shortcut) => !category || shortcut.category === category)
    .map(cloneShortcut);
}

export function findKeyboardShortcuts(query: string): KeyboardShortcut[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  return KEYBOARD_SHORTCUTS.filter((shortcut) => {
    const haystack = [shortcut.action, shortcut.description, ...shortcut.keys, ...shortcut.keywords].join(" ").toLowerCase();
    return haystack.includes(normalized);
  }).map(cloneShortcut);
}

export function formatKeyboardShortcutCheatsheet(shortcutIds?: string[]): string {
  const shortcuts = shortcutIds?.length
    ? shortcutIds
        .map((id) => KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.id === id))
        .filter((shortcut): shortcut is KeyboardShortcut => Boolean(shortcut))
    : KEYBOARD_SHORTCUTS;
  return shortcuts
    .map((shortcut) => `${shortcut.keys.join(" / ")}: ${shortcut.action}`)
    .join("\n");
}

function shortcutsFor(element: AccessibleSceneElement): KeyboardShortcut[] {
  if (!element.shortcutIds?.length) {
    return [];
  }
  return element.shortcutIds
    .map((id) => KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.id === id))
    .filter((shortcut): shortcut is KeyboardShortcut => Boolean(shortcut))
    .map(cloneShortcut);
}

export function annotateSceneElement(
  element: AccessibleSceneElement,
  tabIndex = element.tabIndex ?? 0,
): ScreenReaderAnnotation {
  const role = element.role ?? DEFAULT_ROLE;
  const shortcuts = shortcutsFor(element);
  const states = [element.selected ? "selected" : null, element.disabled ? "disabled" : null]
    .filter((value): value is string => Boolean(value));
  const ariaLabel = [element.label, ...states].join(", ");
  const ariaDescription = [
    `${role} element`,
    element.description,
    element.screenReaderHint,
    shortcuts.length ? `Shortcuts: ${shortcuts.map((shortcut) => shortcut.keys.join(" / ")).join(", ")}` : null,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(". ");
  return {
    id: element.id,
    label: element.label,
    role,
    tabIndex,
    ariaLabel,
    ariaDescription,
    announcement: `${ariaLabel}. ${ariaDescription}`.trim(),
    shortcuts,
  };
}

export function annotateSceneElements(elements: Iterable<AccessibleSceneElement>): ScreenReaderAnnotation[] {
  const ordered = new TabOrderManager(elements).getOrderedElements();
  return ordered.map((element, index) => annotateSceneElement(element, element.tabIndex ?? index));
}

export function resolveHighContrastTheme(overrides: Partial<HighContrastTheme> = {}): HighContrastTheme {
  return {
    ...DEFAULT_HIGH_CONTRAST_THEME,
    ...overrides,
  };
}

export function createHighContrastStyle(
  selected = false,
  theme: Partial<HighContrastTheme> = {},
): HighContrastStyle {
  const resolved = resolveHighContrastTheme(theme);
  return {
    background: resolved.background,
    color: resolved.foreground,
    borderColor: selected ? resolved.accent : resolved.border,
    focusRing: resolved.focusRing,
  };
}
