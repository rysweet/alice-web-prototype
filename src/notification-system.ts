export type NotificationLevel = "error" | "warning" | "info";
export type NotificationKind = "toast" | "banner";

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  level: NotificationLevel;
  priority: number;
  kind: NotificationKind;
  createdAt: number;
  undoLabel?: string;
  undo?: (() => void) | undefined;
}

export interface NotificationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const HISTORY_STORAGE_KEY = "alice-web.notifications.history";

function cloneNotification(notification: NotificationRecord): NotificationRecord {
  return { ...notification };
}

function getDefaultStorage(): NotificationStorage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }
  return globalThis.localStorage as NotificationStorage;
}

export class NotificationQueue {
  private readonly notifications: NotificationRecord[] = [];

  enqueue(notification: NotificationRecord): NotificationRecord {
    this.notifications.push(cloneNotification(notification));
    this.notifications.sort((left, right) => right.priority - left.priority || left.createdAt - right.createdAt);
    return cloneNotification(notification);
  }

  dismiss(id: string): boolean {
    const index = this.notifications.findIndex((notification) => notification.id === id);
    if (index === -1) {
      return false;
    }
    this.notifications.splice(index, 1);
    return true;
  }

  list(limit?: number): NotificationRecord[] {
    const items = this.notifications.map(cloneNotification);
    return typeof limit === "number" ? items.slice(0, limit) : items;
  }
}

export class NotificationHistory {
  private readonly storage: NotificationStorage | null;
  private readonly storageKey: string;
  private records: NotificationRecord[];

  constructor(storage: NotificationStorage | null = getDefaultStorage(), storageKey = HISTORY_STORAGE_KEY) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.records = this.load();
  }

  append(notification: NotificationRecord): void {
    this.records.unshift(cloneNotification(notification));
    this.persist();
  }

  list(): NotificationRecord[] {
    return this.records.map(cloneNotification);
  }

  clear(): void {
    this.records = [];
    this.storage?.removeItem(this.storageKey);
  }

  private load(): NotificationRecord[] {
    const raw = this.storage?.getItem(this.storageKey);
    if (!raw) {
      return [];
    }
    try {
      return (JSON.parse(raw) as NotificationRecord[]).map(cloneNotification);
    } catch {
      return [];
    }
  }

  private persist(): void {
    this.storage?.setItem(this.storageKey, JSON.stringify(this.records));
  }
}

export class NotificationManager {
  private readonly queue: NotificationQueue;
  private readonly history: NotificationHistory;
  private readonly listeners = new Set<(notifications: NotificationRecord[]) => void>();

  constructor(queue = new NotificationQueue(), history = new NotificationHistory()) {
    this.queue = queue;
    this.history = history;
  }

  notify(notification: NotificationRecord): NotificationRecord {
    const stored = this.queue.enqueue(notification);
    this.history.append(stored);
    this.emit();
    return stored;
  }

  dismiss(id: string): boolean {
    const removed = this.queue.dismiss(id);
    if (removed) {
      this.emit();
    }
    return removed;
  }

  visible(limit?: number): NotificationRecord[] {
    return this.queue.list(limit);
  }

  historyLog(): NotificationRecord[] {
    return this.history.list();
  }

  subscribe(listener: (notifications: NotificationRecord[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.visible();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function createNotification(
  level: NotificationLevel,
  title: string,
  message: string,
  priority: number,
  kind: NotificationKind = "toast",
): NotificationRecord {
  return {
    id: `${level}-${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    message,
    level,
    priority,
    kind,
    createdAt: Date.now(),
  };
}

export function ErrorNotification(title: string, message: string, kind: NotificationKind = "banner"): NotificationRecord {
  return createNotification("error", title, message, 300, kind);
}

export function WarningNotification(title: string, message: string, kind: NotificationKind = "toast"): NotificationRecord {
  return createNotification("warning", title, message, 200, kind);
}

export function InfoNotification(title: string, message: string, kind: NotificationKind = "toast"): NotificationRecord {
  return createNotification("info", title, message, 100, kind);
}

export function UndoNotification(
  notification: NotificationRecord,
  undo: () => void,
  undoLabel = "Undo",
): NotificationRecord {
  return {
    ...cloneNotification(notification),
    undo,
    undoLabel,
  };
}
