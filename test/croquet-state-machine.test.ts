import { describe, expect, it } from "vitest";
import { UndoRedoManager } from "../src/undo-redo.js";
import {
  ActionOperation,
  CompletionModel,
  CompoundState,
  State,
  StateMachine,
  StateMachineSerializer,
  Transition,
} from "../src/croquet-state-machine.js";

describe("croquet state machine", () => {
  it("runs state enter update and exit hooks during transitions", () => {
    const events: string[] = [];
    const idle = new State<{ ready: boolean }>("idle", {
      enter: () => events.push("enter:idle"),
      update: () => events.push("update:idle"),
      exit: () => events.push("exit:idle"),
    });
    const running = new State<{ ready: boolean }>("running", {
      enter: () => events.push("enter:running"),
      update: () => events.push("update:running"),
    });
    const machine = new StateMachine<{ ready: boolean }>({
      data: { ready: false },
      states: [idle, running],
      transitions: [
        new Transition<{ ready: boolean }>("idle", "running", ({ data }) => data?.ready === true),
      ],
      initialState: idle,
    });

    machine.start();
    machine.update(16);
    machine.update(16, { ready: true });

    expect(events).toEqual([
      "enter:idle",
      "update:idle",
      "update:idle",
      "exit:idle",
      "enter:running",
    ]);
    expect(machine.currentState?.name).toBe("running");
  });

  it("supports nested compound states and nested serialization", () => {
    const childMachine = new StateMachine({
      states: [new State("child-idle"), new State("child-active")],
      transitions: [new Transition("child-idle", "child-active", () => true)],
      initialState: "child-idle",
    });
    const parentMachine = new StateMachine({
      states: [new State("boot"), new CompoundState("play", childMachine)],
      transitions: [new Transition("boot", "play", () => true)],
      initialState: "boot",
    });
    const serializer = new StateMachineSerializer();

    parentMachine.start();
    parentMachine.update();
    parentMachine.update();

    const snapshot = serializer.serialize(parentMachine);
    const restoredMachine = new StateMachine({
      states: [new State("boot"), new CompoundState("play", new StateMachine({
        states: [new State("child-idle"), new State("child-active")],
        initialState: "child-idle",
      }))],
      initialState: "boot",
    });
    serializer.restore(restoredMachine, snapshot);

    expect(snapshot).toEqual({
      currentState: "play",
      compoundStates: {
        play: {
          currentState: "child-active",
          compoundStates: {},
        },
      },
    });
    expect(restoredMachine.currentState?.name).toBe("play");
    const restoredPlay = restoredMachine.getState("play") as CompoundState<unknown>;
    expect(restoredPlay.stateMachine.currentState?.name).toBe("child-active");
  });

  it("allows wildcard transitions and direct restoration", () => {
    const machine = new StateMachine({
      states: [new State("one"), new State("two"), new State("three")],
      transitions: [new Transition("*", "three", ({ deltaMs }) => deltaMs > 0)],
      initialState: "one",
    });

    machine.start();
    machine.update(1);
    machine.restoreCurrentState("two");

    expect(machine.currentState?.name).toBe("two");
  });

  it("tracks completion model progress and failures", () => {
    const model = new CompletionModel("compile");

    model.begin(4, "starting").advance(2).complete("done");
    expect(model.status).toBe("completed");
    expect(model.progress).toBe(1);
    expect(model.message).toBe("done");

    model.reset().begin(1);
    model.fail(new Error("boom"));
    expect(model.status).toBe("failed");
    expect(model.message).toBe("boom");
  });

  it("wraps undoable croquet actions with completion tracking", () => {
    const undoRedo = new UndoRedoManager();
    let value = 0;
    const operation = new ActionOperation(
      "increment",
      () => {
        value += 1;
      },
      () => {
        value -= 1;
      },
      { undoRedo },
    );

    operation.perform();
    undoRedo.undo();
    operation.perform();

    expect(value).toBe(1);
    expect(operation.completionModel.status).toBe("completed");
    expect(undoRedo.undoCount).toBe(1);
    expect(undoRedo.redoCount).toBe(0);
  });
});
