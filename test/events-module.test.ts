import { describe, expect, it } from "vitest";
import { EventSystem, EventSystemError } from "../src/events.js";

const positions = new Map<string, { x: number; y: number; z: number }>([
  ["bunny", { x: 0, y: 0, z: 0 }],
  ["cat", { x: 1, y: 0, z: 1 }],
  ["hawk", { x: 50, y: 0, z: 0 }],
]);

function createEventSystem(): EventSystem {
  return new EventSystem({
    hasObject: (name) => positions.has(name),
    getObjectPosition: (name) => positions.get(name) ?? null,
  });
}

describe("EventSystem", () => {
  it("registers scene activation handlers and fires them", () => {
    const events = createEventSystem();

    const registration = events.register({
      eventType: "sceneActivated",
      handlerName: "onStart",
    });

    expect(registration.id).toBe("evt-1");
    expect(events.totalRegistrations).toBe(1);
    expect(events.fire("sceneActivated").triggered).toEqual([
      { id: "evt-1", eventType: "sceneActivated", handlerName: "onStart" },
    ]);
  });

  it("filters keyPress handlers by payload key", () => {
    const events = createEventSystem();
    events.register({ eventType: "keyPress", handlerName: "jump", key: "Space" });
    events.register({ eventType: "keyPress", handlerName: "duck", key: "ArrowDown" });

    const fired = events.fire("keyPress", { key: "Space" });
    expect(fired.registrationsEvaluated).toBe(2);
    expect(fired.triggered).toEqual([
      { id: "evt-1", eventType: "keyPress", handlerName: "jump" },
    ]);
  });

  it("accepts Java-style key event types alongside the legacy alias", () => {
    const events = createEventSystem();
    events.register({ eventType: "keyPressed", handlerName: "jump", key: "Space" });

    expect(events.fire("keyPress", { key: "Space" }).triggered).toEqual([
      { id: "evt-1", eventType: "keyPressed", handlerName: "jump" },
    ]);
    expect(events.fire("keyPressed", { key: "Space" }).triggered).toEqual([
      { id: "evt-1", eventType: "keyPressed", handlerName: "jump" },
    ]);
  });

  it("queues events and drains them in FIFO order", () => {
    const events = createEventSystem();
    events.register({ eventType: "sceneActivated", handlerName: "onStart" });
    events.register({ eventType: "keyPressed", handlerName: "jump", key: "Space" });

    const first = events.enqueue("sceneActivated");
    const second = events.enqueue("keyPressed", { key: "Space" });
    const drained = events.drainQueue();

    expect(first.id).toBe("qevt-1");
    expect(second.id).toBe("qevt-2");
    expect(events.queueSize).toBe(0);
    expect(drained).toEqual([
      {
        queuedEventId: "qevt-1",
        registrationsEvaluated: 1,
        triggered: [{ id: "evt-1", eventType: "sceneActivated", handlerName: "onStart" }],
      },
      {
        queuedEventId: "qevt-2",
        registrationsEvaluated: 1,
        triggered: [{ id: "evt-2", eventType: "keyPressed", handlerName: "jump" }],
      },
    ]);
  });

  it("bubbles mouse events from target to ancestors and honors capture listeners", () => {
    const events = new EventSystem({
      hasObject: (name) => ["scene", "panel", "button"].includes(name),
      getParentObject: (name) => ({ button: "panel", panel: "scene" }[name] ?? null),
    });
    events.register({ eventType: "mouseClicked", handlerName: "sceneCapture", target: "scene", useCapture: true });
    events.register({ eventType: "mouseClicked", handlerName: "panelCapture", target: "panel", useCapture: true });
    events.register({ eventType: "mouseClicked", handlerName: "buttonClick", target: "button" });
    events.register({ eventType: "mouseClicked", handlerName: "panelBubble", target: "panel" });
    events.register({ eventType: "mouseClicked", handlerName: "sceneBubble", target: "scene" });

    const fired = events.fire("mouseClicked", { target: "button" });

    expect(fired.triggered).toEqual([
      {
        id: "evt-1",
        eventType: "mouseClicked",
        handlerName: "sceneCapture",
        phase: "capture",
        currentTarget: "scene",
        target: "button",
      },
      {
        id: "evt-2",
        eventType: "mouseClicked",
        handlerName: "panelCapture",
        phase: "capture",
        currentTarget: "panel",
        target: "button",
      },
      {
        id: "evt-3",
        eventType: "mouseClicked",
        handlerName: "buttonClick",
        phase: "target",
        currentTarget: "button",
        target: "button",
      },
      {
        id: "evt-4",
        eventType: "mouseClicked",
        handlerName: "panelBubble",
        phase: "bubble",
        currentTarget: "panel",
        target: "button",
      },
      {
        id: "evt-5",
        eventType: "mouseClicked",
        handlerName: "sceneBubble",
        phase: "bubble",
        currentTarget: "scene",
        target: "button",
      },
    ]);
  });

  it("validates proximity registrations against known scene objects", () => {
    const events = createEventSystem();

    expect(() =>
      events.register({
        eventType: "proximity",
        handlerName: "onMeet",
        targetObjects: ["bunny", "ghost"],
      }),
    ).toThrowError(new EventSystemError("unknown object: ghost"));
  });

  it("fires proximity handlers when tracked objects are within threshold", () => {
    const events = createEventSystem();
    events.register({
      eventType: "proximity",
      handlerName: "onMeet",
      targetObjects: ["bunny", "cat"],
      threshold: 2,
    });
    events.register({
      eventType: "proximity",
      handlerName: "tooFar",
      targetObjects: ["bunny", "hawk"],
      threshold: 2,
    });

    const fired = events.fire("proximity", { sourceObject: "bunny" });
    expect(fired.registrationsEvaluated).toBe(2);
    expect(fired.triggered).toEqual([
      { id: "evt-1", eventType: "proximity", handlerName: "onMeet" },
    ]);
  });

  it("reset clears registrations, queue state, and restarts ids", () => {
    const events = createEventSystem();
    events.register({ eventType: "sceneActivated", handlerName: "first" });
    events.enqueue("sceneActivated");
    events.reset();

    const registration = events.register({ eventType: "sceneActivated", handlerName: "second" });
    const queued = events.enqueue("sceneActivated");
    expect(registration.id).toBe("evt-1");
    expect(queued.id).toBe("qevt-1");
    expect(events.fire("sceneActivated").triggered).toHaveLength(1);
  });
});
