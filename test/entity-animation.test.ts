import { describe, expect, it } from "vitest";
import {
  MoveAnimation,
  PlayAudioAnimation,
  ResizeAnimation,
  RollAnimation,
  SayAnimation,
  SetOpacityAnimation,
  SetPaintAnimation,
  ThinkAnimation,
  TurnAnimation,
  VehicleAnimation,
} from "../src/entity-animation.js";
import { SCamera, SProp } from "../src/story-api/index.js";

describe("entity-animation", () => {
  it("moves entities along a vector over time", () => {
    const entity = new SProp();
    const animation = new MoveAnimation(entity, { x: 4, y: 2, z: -6 }, 1000, (portion) => portion);

    expect(animation.update(500).value).toEqual({ x: 2, y: 1, z: -3 });
    expect(entity.position).toEqual({ x: 2, y: 1, z: -3 });
    animation.update(500);
    expect(entity.position).toEqual({ x: 4, y: 2, z: -6 });
  });

  it("turns and rolls entities around configured axes", () => {
    const entity = new SProp();
    const turn = new TurnAnimation(entity, 0.25, { x: 0, y: 1, z: 0 }, 1000);
    const turned = turn.update(1000).value;
    const roll = new RollAnimation(entity, "RIGHT", 0.125, 1000);
    const rolled = roll.update(1000).value;

    expect(turned.y).not.toBe(0);
    expect(rolled.z).not.toBe(turned.z);
  });

  it("resizes, recolors, and fades models", () => {
    const entity = new SProp();
    entity.color = "#000000";
    const resize = new ResizeAnimation(entity, { width: 4, height: 6, depth: 8 }, 1000, (portion) => portion);
    const recolor = new SetPaintAnimation(entity, "#ffffff", 1000, (portion) => portion);
    const fade = new SetOpacityAnimation(entity, 0.25, 1000, (portion) => portion);

    resize.update(1000);
    recolor.update(500);
    fade.update(1000);

    expect(entity.size).toEqual({ width: 4, height: 6, depth: 8 });
    expect(entity.color).toBe("#808080");
    expect(entity.opacity).toBeCloseTo(0.25, 5);
  });

  it("drives say and think bubbles for their duration", () => {
    const entity = new SProp();
    const say = new SayAnimation(entity, "Hello", 1000);

    say.update(500);
    expect(entity.speechBubbleEntity?.text).toBe("Hello");
    say.update(500);
    expect(entity.speechBubbleEntity).toBeNull();

    const think = new ThinkAnimation(entity, "Hmm", 1000);
    think.update(500);
    expect(entity.speechBubbleEntity?.kind).toBe("think");
    think.update(500);
    expect(entity.speechBubbleEntity).toBeNull();
  });

  it("captures audio playback and vehicle attachment scenarios", () => {
    const platform = new SProp();
    const rider = new SProp();
    const camera = new SCamera();
    rider.position = { x: 3, y: 1, z: -2 };

    const audio = new PlayAudioAnimation(rider, "theme.mp3", 500);
    const attach = new VehicleAnimation(camera, platform, 250);
    audio.update(500);
    attach.update(250);

    expect(audio.positionAtStart).toEqual({ x: 3, y: 1, z: -2 });
    expect(rider.imp.getProperty<string>("lastAudioSource")?.value).toBe("theme.mp3");
    expect(camera.imp.vehicle?.owner).toBe(platform);

    attach.reset();
    expect(camera.imp.vehicle).toBeNull();
  });
});
