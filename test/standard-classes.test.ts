import { describe, expect, it } from "vitest";
import {
  SBipedResource,
  SColor,
  SDirection,
  SDuration,
  SFlyerResource,
  SJointDirection,
  SMoveDirection,
  SProgram,
  SPropResource,
  SQuadrupedResource,
  SScene,
  STurnDirection,
} from "../src/standard-classes.js";

describe("standard-classes", () => {
  it("runs scene setup when a program starts", () => {
    const events: string[] = [];
    const scene = new SScene((activeScene) => {
      activeScene.add("ground");
      events.push("setup");
    });
    const program = new SProgram(scene);

    program.start();

    expect(program.isRunning).toBe(true);
    expect(scene.objects).toEqual(["ground"]);
    expect(events).toEqual(["setup"]);
  });

  it("provides predefined colors and custom rgb colors", () => {
    const accent = SColor.rgb(12, 34, 56);

    expect(SColor.WHITE.toHex()).toBe("#ffffff");
    expect(SColor.RED.equals(new SColor(255, 0, 0))).toBe(true);
    expect(accent.toHex()).toBe("#0c2238");
    expect(accent.equals(SColor.BLUE)).toBe(false);
  });

  it("tracks duration seconds and animation style", () => {
    const duration = new SDuration(1.5, "LINEAR");

    expect(duration.seconds).toBe(1.5);
    expect(duration.style).toBe("LINEAR");
    expect(duration.toMilliseconds()).toBe(1500);
  });

  it("exports resource enums for common character categories", () => {
    expect(SBipedResource.ALICE).toBe("ALICE");
    expect(SQuadrupedResource.DOG).toBe("DOG");
    expect(SFlyerResource.OWL).toBe("OWL");
    expect(SPropResource.TREE).toBe("TREE");
  });

  it("exports movement, turn, and joint direction constants", () => {
    expect(SDirection.FORWARD).toBe("FORWARD");
    expect(SMoveDirection.LEFT).toBe("LEFT");
    expect(STurnDirection.RIGHT).toBe("RIGHT");
    expect(SJointDirection.DOWN).toBe("DOWN");
  });
});
