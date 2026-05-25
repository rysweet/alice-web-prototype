import { describe, expect, it } from "vitest";
import {
  TutorialSystem,
  matchesExpectedAction,
  type TutorialStepDefinition,
} from "../src/tutorial-system";

function createClock(start = 0): { now: () => number; set: (value: number) => void } {
  let current = start;
  return {
    now: () => current,
    set: (value: number) => {
      current = value;
    },
  };
}

describe("TutorialSystem", () => {
  it("matches nested expected action fields", () => {
    expect(matchesExpectedAction(
      {
        type: "add-object",
        target: "bunny",
        metadata: { resource: "BunnyResource", palette: ["warm", "playful"] },
      },
      {
        type: "add-object",
        metadata: { resource: "BunnyResource", palette: ["warm", "playful"] },
      },
    )).toBe(true);
  });

  it("advances through tutorial steps and reports completion", () => {
    const steps: TutorialStepDefinition[] = [
      {
        id: "add-ground",
        instructionText: "Add the ground.",
        expectedAction: { type: "add-object", target: "ground" },
      },
      {
        id: "animate-bunny",
        instructionText: "Make the bunny hop.",
        expectedAction: { type: "call-method", target: "bunny", value: "hop" },
      },
    ];
    const tutorial = new TutorialSystem(steps);

    expect(tutorial.progress.currentStep?.id).toBe("add-ground");
    expect(tutorial.recordAction({ type: "add-object", target: "camera" }).accepted).toBe(false);
    expect(tutorial.recordAction({ type: "add-object", target: "ground" })).toMatchObject({
      accepted: true,
      nextStepId: "animate-bunny",
    });
    expect(tutorial.progress.completedStepIds).toEqual(["add-ground"]);

    const finish = tutorial.recordAction({
      type: "call-method",
      target: "bunny",
      value: "hop",
    });
    expect(finish).toMatchObject({ accepted: true, completed: true, nextStepId: null });
    expect(tutorial.isComplete).toBe(true);
  });

  it("supports custom validation for lesson-specific checks", () => {
    const tutorial = new TutorialSystem([
      {
        id: "name-scene",
        instructionText: "Name the first scene.",
        expectedAction: { type: "rename-scene" },
        validation: (action) => action.type === "rename-scene" && typeof action.value === "string" && action.value.length >= 5,
      },
    ]);

    expect(tutorial.recordAction({ type: "rename-scene", value: "Zoo" }).accepted).toBe(false);
    expect(tutorial.recordAction({ type: "rename-scene", value: "ZooIntro" }).completed).toBe(true);
  });

  it("reveals hints progressively after each timeout interval and resets them per step", () => {
    const clock = createClock();
    const tutorial = new TutorialSystem([
      {
        id: "add-character",
        instructionText: "Add a character.",
        expectedAction: { type: "add-object", target: "bunny" },
        hints: ["Open the gallery.", "Choose a biped.", "Drag the object into the scene."],
        hintDelayMs: 5_000,
      },
      {
        id: "make-it-hop",
        instructionText: "Make it hop.",
        expectedAction: { type: "call-method", target: "bunny", value: "hop" },
        hints: ["Use a motion method."],
        hintDelayMs: 5_000,
      },
    ], { clock: clock.now });

    expect(tutorial.getAvailableHints()).toEqual([]);
    clock.set(5_000);
    expect(tutorial.getAvailableHints()).toEqual(["Open the gallery."]);
    clock.set(10_000);
    expect(tutorial.getCurrentHint()).toBe("Choose a biped.");
    clock.set(15_000);
    expect(tutorial.getAvailableHints()).toEqual([
      "Open the gallery.",
      "Choose a biped.",
      "Drag the object into the scene.",
    ]);

    tutorial.recordAction({ type: "add-object", target: "bunny" });
    expect(tutorial.getAvailableHints()).toEqual([]);
    clock.set(20_000);
    expect(tutorial.getAvailableHints()).toEqual(["Use a motion method."]);
  });
});
