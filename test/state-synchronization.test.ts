import { describe, expect, it } from "vitest";
import {
  StateHistory,
  StatePatch,
  StatePersistence,
  StateStore,
  StateValidator,
  type AsyncStateStorageLike,
  type StateObject,
  type StringStorageLike,
} from "../src/state-synchronization.js";

interface DemoState extends StateObject {
  counter: number;
  flags: {
    dirty: boolean;
    selected: string[];
  };
}

class MemoryStorage implements StringStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class MemoryIndexedDbStore implements AsyncStateStorageLike {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe("state-synchronization", () => {
  it.each([
    ["__proto__", (pollutionKey: string) => `$.__proto__.${pollutionKey}`],
    ["constructor", (pollutionKey: string) => `$.constructor.prototype.${pollutionKey}`],
    ["prototype", (pollutionKey: string) => `$.prototype.${pollutionKey}`],
  ])("rejects %s in state patch paths without polluting prototypes", (segment, makePath) => {
    const pollutionKey = "aliceStatePatchPolluted";
    const readPollutedValue = (): unknown => ({} as Record<string, unknown>)[pollutionKey];
    delete (Object.prototype as Record<string, unknown>)[pollutionKey];

    try {
      expect(readPollutedValue()).toBeUndefined();
      expect(() => StatePatch.apply({ safe: true }, [
        { op: "set", path: makePath(pollutionKey), value: true },
      ])).toThrow(`Unsafe state patch path segment: ${segment}`);
      expect(readPollutedValue()).toBeUndefined();
    } finally {
      delete (Object.prototype as Record<string, unknown>)[pollutionKey];
    }
  });

  it.each(["__proto__", "constructor", "prototype"])("rejects %s in final, nested, array, bracket, and remove paths", (segment) => {
    const unsafePaths = [
      `$.${segment}`,
      `$.safe.${segment}`,
      `$.items[0].${segment}`,
      `$[${segment}]`,
    ];

    for (const path of unsafePaths) {
      expect(() => StatePatch.apply({ safe: {}, items: [{}] }, [
        { op: "set", path, value: true },
      ])).toThrow(`Unsafe state patch path segment: ${segment}`);
    }
    expect(() => StatePatch.apply({ safe: true }, [
      { op: "remove", path: `$.${segment}` },
    ])).toThrow(`Unsafe state patch path segment: ${segment}`);
  });

  it("keeps root replacement __proto__ values as own data properties", () => {
    const pollutionKey = "aliceRootReplacementPolluted";
    const readPollutedValue = (): unknown => ({} as Record<string, unknown>)[pollutionKey];
    const nextValue = JSON.parse(
      '{"safe":false,"__proto__":{"aliceRootReplacementPolluted":true}}',
    ) as StateObject;
    delete (Object.prototype as Record<string, unknown>)[pollutionKey];

    try {
      const replaced = StatePatch.apply({ safe: true } as StateObject, [
        { op: "set", path: "$", value: nextValue },
      ]) as Record<string, unknown>;
      const protoDescriptor = Object.getOwnPropertyDescriptor(replaced, "__proto__");

      expect(readPollutedValue()).toBeUndefined();
      expect(Object.getPrototypeOf(replaced)).toBe(Object.prototype);
      expect(protoDescriptor).toMatchObject({
        value: { aliceRootReplacementPolluted: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });
      expect(replaced).toEqual({
        safe: false,
        ["__proto__"]: { aliceRootReplacementPolluted: true },
      });
    } finally {
      delete (Object.prototype as Record<string, unknown>)[pollutionKey];
    }
  });

  it("keeps diff and apply round trips working for dangerous own keys", () => {
    const previousState = {
      safe: JSON.parse('{"__proto__":{"polluted":false},"label":"old"}') as StateObject,
    };
    const nextState = {
      safe: JSON.parse('{"__proto__":{"polluted":true},"label":"new"}') as StateObject,
    };

    const patch = StatePatch.diff(previousState, nextState);
    const reapplied = StatePatch.apply(previousState, patch) as StateObject;
    const safeObject = reapplied.safe as Record<string, unknown>;
    const protoDescriptor = Object.getOwnPropertyDescriptor(safeObject, "__proto__");

    expect(patch.map((operation) => operation.path)).toEqual(["$.safe"]);
    expect(reapplied).toEqual(nextState);
    expect(Object.getPrototypeOf(safeObject)).toBe(Object.prototype);
    expect(protoDescriptor?.value).toEqual({ polluted: true });
  });

  it("computes minimal state patches and reapplies them", () => {
    const previousState: DemoState = {
      counter: 1,
      flags: {
        dirty: false,
        selected: ["rabbit", "camera"],
      },
    };
    const nextState: DemoState = {
      counter: 2,
      flags: {
        dirty: true,
        selected: ["rabbit"],
      },
    };

    const patch = StatePatch.diff(previousState, nextState);
    const reapplied = StatePatch.apply(previousState, patch) as DemoState;

    expect(patch).toEqual([
      {
        op: "set",
        path: "$.counter",
        value: 2,
        previousValue: 1,
      },
      {
        op: "set",
        path: "$.flags.dirty",
        value: true,
        previousValue: false,
      },
      {
        op: "remove",
        path: "$.flags.selected[1]",
        previousValue: "camera",
      },
    ]);
    expect(reapplied).toEqual(nextState);
  });

  it("tracks store versions and notifies subscriptions when state changes", () => {
    const history = new StateHistory<DemoState>({
      initialState: {
        counter: 0,
        flags: { dirty: false, selected: [] },
      },
      maxSnapshots: 5,
    });
    const store = new StateStore<DemoState>(history.snapshot(), { history });
    const notifications: Array<{ version: number; changedPaths: readonly string[] }> = [];
    const subscription = store.subscribe((change) => {
      notifications.push({ version: change.version, changedPaths: change.changedPaths });
    });

    const firstChange = store.update((draft) => {
      draft.counter = 1;
      draft.flags.selected.push("hero");
    }, "increment");
    const secondChange = store.applyPatch([
      { op: "set", path: "$.flags.dirty", value: true, previousValue: false },
    ], "mark-dirty");
    subscription.unsubscribe();
    store.update({ counter: 2 }, "ignored-after-unsubscribe");

    expect(firstChange.version).toBe(1);
    expect(secondChange.version).toBe(2);
    expect(store.version).toBe(3);
    expect(store.getState()).toEqual({
      counter: 2,
      flags: { dirty: true, selected: ["hero"] },
    });
    expect(history.undo()).toEqual({
      counter: 1,
      flags: { dirty: true, selected: ["hero"] },
    });
    expect(history.redo()).toEqual({
      counter: 2,
      flags: { dirty: true, selected: ["hero"] },
    });
    expect(notifications).toEqual([
      { version: 1, changedPaths: ["$.counter", "$.flags.selected[0]"] },
      { version: 2, changedPaths: ["$.flags.dirty"] },
    ]);
    expect(subscription.isActive).toBe(false);
  });

  it("validates invariants after mutations and rejects invalid state", () => {
    const validator = new StateValidator<DemoState>()
      .addRule("counter-nonnegative", (state) => state.counter >= 0 || "counter must be non-negative")
      .addRule("selection-cap", (state) => state.flags.selected.length <= 2 || "at most two selected items");
    const store = new StateStore<DemoState>({
      counter: 0,
      flags: { dirty: false, selected: [] },
    }, { validator });

    store.update((draft) => {
      draft.flags.selected = ["hero", "camera"];
    });

    expect(() => store.update({ counter: -1 })).toThrow("counter must be non-negative");
    expect(() => store.update((draft) => {
      draft.flags.selected = ["hero", "camera", "ground"];
    })).toThrow("at most two selected items");
    expect(store.getState()).toEqual({
      counter: 0,
      flags: { dirty: false, selected: ["hero", "camera"] },
    });
  });

  it("persists and restores state through localStorage and IndexedDB backends", async () => {
    const localStorage = new MemoryStorage();
    const indexedDbStore = new MemoryIndexedDbStore();
    const persistence = new StatePersistence<DemoState>({
      storageKey: "alice-state",
      localStorage,
      indexedDbStore,
    });
    const state: DemoState = {
      counter: 5,
      flags: {
        dirty: true,
        selected: ["rabbit"],
      },
    };

    await persistence.save(state);
    localStorage.setItem("alice-state", JSON.stringify({ counter: 1, flags: { dirty: false, selected: [] } }));

    expect(await persistence.load()).toEqual(state);
    await persistence.clear();
    expect(await persistence.restore()).toBeNull();
  });
});
