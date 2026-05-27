// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ErrorNotification,
  InfoNotification,
  NotificationHistory,
  NotificationManager,
  NotificationQueue,
  UndoNotification,
  WarningNotification,
} from "../src/notification-system";

const STORAGE_KEY = "alice-web.notifications.test";

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("notification-system", () => {
  it("orders queued notifications by priority", () => {
    const queue = new NotificationQueue();
    queue.enqueue(InfoNotification("Info", "Heads up"));
    queue.enqueue(ErrorNotification("Failure", "Save failed"));
    queue.enqueue(WarningNotification("Warning", "Low memory"));

    expect(queue.list().map((notification) => notification.level)).toEqual(["error", "warning", "info"]);
  });

  it("stores persistent history and can clear it", () => {
    const history = new NotificationHistory(localStorage, STORAGE_KEY);
    history.append(InfoNotification("Saved", "Project saved"));

    const reloaded = new NotificationHistory(localStorage, STORAGE_KEY);
    expect(reloaded.list()[0]?.title).toBe("Saved");

    reloaded.clear();
    expect(new NotificationHistory(localStorage, STORAGE_KEY).list()).toEqual([]);
  });

  it("notifies subscribers when visible notifications change", () => {
    const manager = new NotificationManager(new NotificationQueue(), new NotificationHistory(localStorage, STORAGE_KEY));
    const snapshots: number[] = [];
    const unsubscribe = manager.subscribe((notifications) => snapshots.push(notifications.length));

    const created = manager.notify(WarningNotification("Warning", "Check your scene"));
    manager.dismiss(created.id);
    unsubscribe();

    expect(snapshots).toEqual([1, 0]);
    expect(manager.historyLog()[0]?.title).toBe("Warning");
  });

  it("creates undo-capable notifications with typed helpers", () => {
    const undo = vi.fn();
    const base = ErrorNotification("Delete failed", "Try again later");
    const undoable = UndoNotification(base, undo, "Restore");

    expect(base.kind).toBe("banner");
    expect(undoable.undoLabel).toBe("Restore");
    undoable.undo?.();
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
