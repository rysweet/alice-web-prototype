import { describe, expect, it, vi } from "vitest";
import {
  InstanceProperty,
  ListProperty,
  PropertyOwnerBase,
  SetProperty,
} from "../src/project-properties";

describe("project property depth cases", () => {
  it("treats normalized equivalent instance values as no-ops and honors listener removal", () => {
    const owner = new PropertyOwnerBase();
    const score = new InstanceProperty(owner, "score", 10, {
      normalize: (value: number) => Math.max(0, Math.min(10, value)),
    });
    const listener = vi.fn();

    score.addListener(listener);
    expect(score.setValue(12)).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    expect(score.setValue(8)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    score.removeListener(listener);
    expect(score.setValue(6)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns defensive list snapshots and stops indexed listener notifications after removal", () => {
    const owner = new PropertyOwnerBase();
    const steps = new ListProperty(owner, "steps", ["wake up"]);
    const indexedListener = vi.fn();

    const snapshot = steps.toArray();
    snapshot.push("mutated");
    expect(steps.toArray()).toEqual(["wake up"]);

    steps.addIndexedListener(indexedListener);
    expect(steps.addAt(1, "open world")).toBe(2);
    expect(indexedListener).toHaveBeenCalledTimes(1);

    steps.removeIndexedListener(indexedListener);
    expect(steps.set(1, "run world")).toBe(true);
    expect(indexedListener).toHaveBeenCalledTimes(1);
  });

  it("returns defensive set snapshots and stops set listener notifications after removal", () => {
    const owner = new PropertyOwnerBase();
    const tags = new SetProperty(owner, "tags", ["lesson"]);
    const setListener = vi.fn();

    const snapshot = tags.value;
    snapshot.add("mutated");
    expect(tags.toArray()).toEqual(["lesson"]);

    tags.addSetListener(setListener);
    expect(tags.add("review")).toBe(2);
    expect(setListener).toHaveBeenCalledTimes(1);

    tags.removeSetListener(setListener);
    expect(tags.remove("review")).toEqual(["review"]);
    expect(setListener).toHaveBeenCalledTimes(1);
  });
});
