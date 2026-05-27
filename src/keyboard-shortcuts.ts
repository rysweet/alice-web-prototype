export interface ShortcutDefinition {
  id: string;
  combo: string;
  description: string;
  contexts?: string[];
  group?: string;
  action?: () => void;
}

export interface ShortcutConflict {
  combo: string;
  shortcutIds: string[];
}

function normalizeCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("+");
}

function cloneShortcut(shortcut: ShortcutDefinition): ShortcutDefinition {
  return {
    ...shortcut,
    contexts: shortcut.contexts ? [...shortcut.contexts] : undefined,
  };
}

export class ShortcutMap {
  private readonly combos = new Map<string, ShortcutDefinition[]>();

  register(shortcut: ShortcutDefinition): void {
    const key = normalizeCombo(shortcut.combo);
    const list = this.combos.get(key) ?? [];
    list.push(cloneShortcut(shortcut));
    this.combos.set(key, list);
  }

  unregister(shortcutId: string): boolean {
    let removed = false;
    for (const [combo, shortcuts] of this.combos.entries()) {
      const filtered = shortcuts.filter((shortcut) => shortcut.id !== shortcutId);
      if (filtered.length !== shortcuts.length) {
        removed = true;
        if (filtered.length === 0) {
          this.combos.delete(combo);
        } else {
          this.combos.set(combo, filtered);
        }
      }
    }
    return removed;
  }

  lookup(combo: string): ShortcutDefinition[] {
    return (this.combos.get(normalizeCombo(combo)) ?? []).map(cloneShortcut);
  }

  list(): ShortcutDefinition[] {
    return [...this.combos.values()].flat().map(cloneShortcut);
  }
}

export class ShortcutConflictDetector {
  detect(shortcuts: Iterable<ShortcutDefinition>): ShortcutConflict[] {
    const groups = new Map<string, string[]>();
    for (const shortcut of shortcuts) {
      const key = normalizeCombo(shortcut.combo);
      const ids = groups.get(key) ?? [];
      ids.push(shortcut.id);
      groups.set(key, ids);
    }
    return [...groups.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([combo, shortcutIds]) => ({ combo, shortcutIds: [...shortcutIds] }));
  }
}

export class ContextualShortcuts {
  constructor(private readonly activeContexts = new Set<string>()) {}

  activate(context: string): void {
    this.activeContexts.add(context);
  }

  deactivate(context: string): void {
    this.activeContexts.delete(context);
  }

  filter(shortcuts: Iterable<ShortcutDefinition>): ShortcutDefinition[] {
    return [...shortcuts]
      .filter((shortcut) => !shortcut.contexts?.length || shortcut.contexts.some((context) => this.activeContexts.has(context)))
      .map(cloneShortcut);
  }
}

export class ShortcutManager {
  private readonly shortcutMap = new ShortcutMap();
  private readonly shortcutsById = new Map<string, ShortcutDefinition>();

  register(shortcut: ShortcutDefinition): void {
    if (this.shortcutsById.has(shortcut.id)) {
      this.unregister(shortcut.id);
    }
    const stored = cloneShortcut(shortcut);
    this.shortcutsById.set(shortcut.id, stored);
    this.shortcutMap.register(stored);
  }

  unregister(shortcutId: string): boolean {
    const deleted = this.shortcutsById.delete(shortcutId);
    this.shortcutMap.unregister(shortcutId);
    return deleted;
  }

  list(contexts: string[] = []): ShortcutDefinition[] {
    const contextual = new ContextualShortcuts(new Set(contexts));
    return contextual.filter(this.shortcutsById.values());
  }

  trigger(combo: string, contexts: string[] = []): ShortcutDefinition[] {
    const contextual = new ContextualShortcuts(new Set(contexts));
    const matches = contextual.filter(this.shortcutMap.lookup(combo));
    for (const shortcut of matches) {
      shortcut.action?.();
    }
    return matches;
  }

  conflicts(): ShortcutConflict[] {
    return new ShortcutConflictDetector().detect(this.shortcutsById.values());
  }
}

export class ShortcutHelpOverlay {
  build(shortcuts: Iterable<ShortcutDefinition>): Map<string, ShortcutDefinition[]> {
    const grouped = new Map<string, ShortcutDefinition[]>();
    for (const shortcut of shortcuts) {
      const group = shortcut.group ?? "General";
      const entries = grouped.get(group) ?? [];
      entries.push(cloneShortcut(shortcut));
      grouped.set(group, entries);
    }
    for (const entries of grouped.values()) {
      entries.sort((left, right) => left.description.localeCompare(right.description));
    }
    return grouped;
  }

  render(shortcuts: Iterable<ShortcutDefinition>): string {
    const sections = this.build(shortcuts);
    return [...sections.entries()]
      .map(([group, entries]) => [group, ...entries.map((entry) => `- ${entry.combo}: ${entry.description}`)].join("\n"))
      .join("\n\n");
  }
}
