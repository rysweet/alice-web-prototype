import { describe, expect, it } from "vitest";
import {
  SBiped,
  SFlyer,
  SMarineMammal,
  SQuadruped,
  SSlitherer,
  SSwimmer,
  getAbsolutePose,
} from "../src/biped-quadruped.js";

describe("biped-quadruped", () => {
  it("drives biped walking turning and gestures with bound resources", () => {
    const hero = new SBiped("Hero");

    const walk = hero.walk(2);
    hero.turn("LEFT", 0.125);
    const gesture = hero.gesture("wave");

    expect(walk.name).toBe("walk");
    expect(hero.lastAnimation?.name).toBe("gesture");
    expect(hero.position.z).toBeLessThan(0);
    expect(gesture.joints).toContain("LEFT_SHOULDER");
    expect(hero.resource.listJointIds().map((joint) => joint.name)).toContain("RIGHT_HAND");
    expect(hero.getLeftShoulder()?.orientation.w).not.toBe(1);
  });

  it("animates quadrupeds with trot gallop and tail wag presets", () => {
    const dog = new SQuadruped("Dog");

    dog.trot(1.5);
    const gallop = dog.gallop(3);
    const wag = dog.tailWag(0.25);

    expect(gallop.distance).toBe(3);
    expect(wag.amount).toBe(0.25);
    expect(dog.position.z).toBeLessThan(-4);
    expect(dog.resource.listJointIds().map((joint) => joint.name)).toContain("TAIL_0");
    expect(dog.getTail()?.orientation.w).not.toBe(1);
  });

  it("covers flyer swimmer marine mammal and slitherer helpers", () => {
    const bird = new SFlyer("Bird");
    const fish = new SSwimmer("Fish");
    const dolphin = new SMarineMammal("Dolphin");
    const snake = new SSlitherer("Snake");

    bird.takeoff(2);
    bird.soar(3);
    fish.swim(2);
    fish.dive(1);
    dolphin.tailWag(0.125);
    snake.slither(2);

    expect(bird.getLeftWingShoulder()?.orientation.w).not.toBe(1);
    expect(getAbsolutePose(bird).position.y).toBeGreaterThan(1.5);
    expect(fish.position.z).toBeLessThan(-1.5);
    expect(dolphin.resource.name).toBe("SMarineMammal");
    expect(snake.lastAnimation?.name).toBe("slither");
    expect(snake.head?.orientation.w).toBe(1);
  });
});
