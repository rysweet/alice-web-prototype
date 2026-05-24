import { describe, expect, it } from "vitest";
import {
  SAxes,
  SBillboard,
  SBiped,
  SBox,
  SCamera,
  SCameraMarker,
  SCone,
  SCylinder,
  SDisc,
  SFlyer,
  SJoint,
  SProgram,
  SProp,
  SScene,
  SSlitherer,
  SSphere,
  SSwimmer,
  STarget,
  STextModel,
  SThingMarker,
  STorus,
  Scene,
  createEntityForType,
  type Size,
} from "../src/story-api";

describe("expanded story-api entity coverage", () => {
  it("maps major Java facade types through createEntityForType", () => {
    expect(createEntityForType("org.lgna.story.SDisc")).toBeInstanceOf(SDisc);
    expect(createEntityForType("org.lgna.story.SSphere")).toBeInstanceOf(SSphere);
    expect(createEntityForType("org.lgna.story.SBox")).toBeInstanceOf(SBox);
    expect(createEntityForType("org.lgna.story.SCone")).toBeInstanceOf(SCone);
    expect(createEntityForType("org.lgna.story.SCylinder")).toBeInstanceOf(SCylinder);
    expect(createEntityForType("org.lgna.story.STorus")).toBeInstanceOf(STorus);
    expect(createEntityForType("org.lgna.story.STextModel")).toBeInstanceOf(STextModel);
    expect(createEntityForType("org.lgna.story.SBillboard")).toBeInstanceOf(SBillboard);
    expect(createEntityForType("org.lgna.story.SAxes")).toBeInstanceOf(SAxes);
    expect(createEntityForType("org.lgna.story.SCameraMarker")).toBeInstanceOf(SCameraMarker);
    expect(createEntityForType("org.lgna.story.SThingMarker")).toBeInstanceOf(SThingMarker);
    expect(createEntityForType("org.lgna.story.STarget")).toBeInstanceOf(STarget);
    expect(createEntityForType("org.lgna.story.SSlitherer")).toBeInstanceOf(SSlitherer);
    expect(createEntityForType("org.lgna.story.SSwimmer")).toBeInstanceOf(SSwimmer);
  });

  it("supports shape-specific property APIs wired to the property system", () => {
    const sphere = new SSphere();
    const disc = new SDisc();
    const cylinder = new SCylinder();
    const cone = new SCone();
    const torus = new STorus();

    sphere.radius = 2;
    disc.radius = 3;
    cylinder.radius = 4;
    cylinder.length = 10;
    cone.baseRadius = 5;
    cone.length = 12;
    torus.innerRadius = 1;
    torus.outerRadius = 6;

    expect(sphere.size).toEqual({ width: 4, height: 4, depth: 4 });
    expect(disc.size).toEqual({ width: 6, height: 1, depth: 6 });
    expect(cylinder.size).toEqual({ width: 8, height: 10, depth: 8 });
    expect(cone.size).toEqual({ width: 10, height: 12, depth: 10 });
    expect(torus.outerRadius).toBe(6);
    expect(torus.imp.getProperty<number>("innerRadius")?.value).toBe(1);
  });

  it("moves, rotates, rolls, and places transformable entities", () => {
    const flyer = new SFlyer();
    const target = new STarget();
    target.position = { x: 5, y: 2, z: -3 };

    flyer.move("FORWARD", 2);
    flyer.turn("LEFT", Math.PI / 2);
    flyer.move("FORWARD", 2);
    flyer.roll("RIGHT", Math.PI / 4);
    flyer.moveToward(target, 3);
    flyer.place("ABOVE", target, 1);

    expect(flyer.position.y).toBeGreaterThan(target.position.y);
    expect(flyer.orientation).not.toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(flyer.position.x).not.toBe(0);
  });

  it("captures speech and thought state on models", () => {
    const billboard = new SBillboard();
    billboard.say("Hello", 1.5);
    billboard.think("Hmm", 0.5);

    expect(billboard.lastSpokenText).toBe("Hello");
    expect(billboard.lastThoughtText).toBe("Hmm");
    expect(billboard.speechBubble).toEqual({ kind: "think", text: "Hmm", duration: 0.5 });
    expect(billboard.speechBubbleEntity).toMatchObject({ kind: "think", text: "Hmm", duration: 0.5 });
    expect(billboard.speechBubbleEntity!.anchor.y).toBeGreaterThanOrEqual(billboard.position.y);
  });

  it("exposes joint entities and can straighten poses", () => {
    const snake = new SSlitherer();
    const neck = snake.getJointEntity("NECK");
    const head = snake.head;

    expect(neck).toBeInstanceOf(SJoint);
    expect(head).toBeInstanceOf(SJoint);
    expect(snake.getJoint("TAIL")).toEqual({ name: "TAIL", parent: "SPINE_UPPER" });

    neck!.orientation = { x: 0, y: 0.5, z: 0, w: 0.5 };
    snake.straightenOutJoints();

    expect(neck!.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("supports swimmer-specific helpers and joint access", () => {
    const swimmer = new SSwimmer();
    const target = new SProp();
    target.position = { x: 4, y: 1, z: -2 };

    swimmer.swimTo(target);

    expect(swimmer.position).toEqual(target.position);
    expect(swimmer.tail?.name).toBe("TAIL");
  });

  it("supports scene entity properties and activation listeners", () => {
    const sceneEntity = new SScene();
    const events: Array<{ active: boolean; count: number }> = [];

    sceneEntity.atmosphereColor = "SKY_BLUE";
    sceneEntity.fromAboveLightColor = "WHITE";
    sceneEntity.fromBelowLightColor = "GRAY";
    sceneEntity.fogDensity = 0.25;
    sceneEntity.addSceneActivationListener((active, count) => events.push({ active, count }));

    sceneEntity.imp.activate();
    sceneEntity.imp.deactivate();

    expect(sceneEntity.atmosphereColor).toBe("SKY_BLUE");
    expect(sceneEntity.fogDensity).toBe(0.25);
    expect(events).toEqual([
      { active: true, count: 1 },
      { active: false, count: 1 },
    ]);
  });

  it("lets programs switch active runtime scenes", () => {
    const program = new SProgram();
    const first = new Scene();
    const second = new Scene();
    const hero = new SBiped();
    const camera = new SCamera();

    first.addEntity("hero", hero);
    second.addEntity("camera", camera);

    program.setActiveScene(first);
    expect(first.isActive).toBe(true);
    expect(hero.imp.isActive).toBe(true);
    expect(program.activeScene).toBe(first);

    program.setActiveScene(second);
    expect(first.isActive).toBe(false);
    expect(hero.imp.isActive).toBe(false);
    expect(second.isActive).toBe(true);
    expect(camera.imp.isActive).toBe(true);
  });

  it("notifies property listeners for bound paint/color properties", () => {
    const marker = new SThingMarker();
    const colors: string[] = [];
    const paints: string[] = [];

    marker.imp.getProperty<string>("color")!.addListener((change) => colors.push(change.value));
    marker.imp.getProperty<string>("paint")!.addListener((change) => paints.push(change.value));
    marker.colorId = "RED";

    expect(marker.paint).toBe("RED");
    expect(colors).toContain("RED");
    expect(paints).toContain("RED");
  });

  it("supports text model editing operations", () => {
    const text = new STextModel();
    text.value = "Alice";
    text.append(" 3");
    text.insert(0, "Hello ");
    text.replace(6, 11, "World");
    text.deleteCharAt(11);

    expect(text.value).toBe("Hello World3");
    expect(text.charAt(0)).toBe("H");
    expect(text.indexOf("World")).toBe(6);
    expect(text.length).toBe(12);
  });

  it("preserves characterization behavior for size property listeners", () => {
    const prop = new SProp();
    const sizeProperty = prop.imp.getProperty<Size>("size")!;
    const changes: Size[] = [];

    sizeProperty.addListener((change) => changes.push(change.value));
    prop.size = { width: 2, height: 3, depth: 4 };

    expect(changes).toEqual([{ width: 2, height: 3, depth: 4 }]);
  });

  it("supports explicit visual setter helpers", () => {
    const prop = new SProp();

    prop.setColor("RED");
    prop.setOpacity(0.25);
    prop.setSize({ width: 2, height: 3, depth: 4 });

    expect(prop.color).toBe("RED");
    expect(prop.opacity).toBe(0.25);
    expect(prop.size).toEqual({ width: 2, height: 3, depth: 4 });
  });
});
