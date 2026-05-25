import { describe, expect, it } from "vitest";
import { EntityEventSystem } from "../src/entity-events.js";
import { MoveDirection, SBox, TurnDirection } from "../src/story-api";

describe("entity event system", () => {
  it("maps key pressed events to move and turn actions", () => {
    const hero = new SBox();
    const system = new EntityEventSystem({ hero });
    const initialOrientation = { ...hero.orientation };

    system.bindKeyPressedMove("hero", "w", MoveDirection.FORWARD, 2);
    system.bindKeyPressedTurn("hero", "a", TurnDirection.LEFT, 0.25);

    const moveResult = system.fireKeyPressed({ type: "keyPressed", key: "w" });
    const turnResult = system.fireKeyPressed({ type: "keyPressed", key: "a" });

    expect(moveResult.triggered).toHaveLength(1);
    expect(turnResult.triggered).toHaveLength(1);
    expect(hero.position.z).toBe(-2);
    expect(hero.orientation).not.toEqual(initialOrientation);
  });

  it("maps mouse clicks to say and think actions", () => {
    const narrator = new SBox();
    const system = new EntityEventSystem({ narrator });

    system.bindMouseClickSay("narrator", "Hello there", { target: "narrator" });
    system.bindMouseClickThink("narrator", "Hmm...", { target: "narrator" });

    const result = system.fireMouseClick({ type: "mouseClicked", target: "narrator" });

    expect(result.triggered).toHaveLength(2);
    expect(narrator.lastSpokenText).toBe("Hello there");
    expect(narrator.lastThoughtText).toBe("Hmm...");
  });

  it("runs scene activation initialization sequences", () => {
    const hero = new SBox();
    const system = new EntityEventSystem({ hero });

    system.bindSceneActivatedSequence([
      { entity: "hero", action: { kind: "say", text: "Ready" } },
      { entity: "hero", action: { kind: "move", direction: MoveDirection.RIGHT, amount: 1.5 } },
    ]);

    const result = system.fireSceneActivated();

    expect(result.triggered).toHaveLength(1);
    expect(hero.lastSpokenText).toBe("Ready");
    expect(hero.position.x).toBe(1.5);
  });

  it("fires collision responses once per enter event", () => {
    const left = new SBox();
    const right = new SBox();
    left.position = { x: 0, y: 0, z: 0 };
    right.position = { x: 0.4, y: 0, z: 0 };
    const system = new EntityEventSystem({ left, right });

    system.bindCollisionResponse("left", "right", [
      { entity: "source", action: { kind: "say", text: "Ouch" } },
      { entity: "target", action: { kind: "think", text: "That was close" } },
    ]);

    const first = system.checkCollisions();
    const second = system.checkCollisions();

    expect(first.triggered).toEqual([{ type: "collision", source: "left", target: "right" }]);
    expect(first.executedBindings).toHaveLength(1);
    expect(second.triggered).toHaveLength(0);
    expect(left.lastSpokenText).toBe("Ouch");
    expect(right.lastThoughtText).toBe("That was close");
  });

  it("fires proximity responses when entities are within threshold", () => {
    const cat = new SBox();
    const bunny = new SBox();
    cat.position = { x: 0, y: 0, z: 0 };
    bunny.position = { x: 1, y: 0, z: 0 };
    const system = new EntityEventSystem({ cat, bunny });

    system.bindProximityResponse("cat", "bunny", 1.5, [
      { entity: "source", action: { kind: "think", text: "Near enough" } },
      { entity: "target", action: { kind: "say", text: "Hi friend" } },
    ]);

    const result = system.fireProximity({ type: "proximity", sourceObject: "cat" });

    expect(result.triggered).toHaveLength(1);
    expect(cat.lastThoughtText).toBe("Near enough");
    expect(bunny.lastSpokenText).toBe("Hi friend");
  });
});
