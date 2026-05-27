import { describe, expect, it } from "vitest";
import {
  EnvironmentMap,
  RenderQueue,
  RenderStatistics,
  SceneManager,
  SceneRenderer,
  ShadowMapper,
  type ManagedRenderScene,
  type RenderableItem,
} from "../src/render-scene-manager.js";

function createRenderable(overrides: Partial<RenderableItem> & Pick<RenderableItem, "id" | "materialId">): RenderableItem {
  return {
    distanceToCamera: 0,
    triangleCount: 12,
    textureIds: [],
    castsShadow: false,
    transparent: false,
    ...overrides,
  };
}

describe("render-scene-manager", () => {
  it("sorts opaque batches by material before transparent distance sorting", () => {
    const queue = new RenderQueue();
    queue.enqueueAll([
      createRenderable({ id: "glass-near", materialId: "glass", distanceToCamera: 2, transparent: true }),
      createRenderable({ id: "wood-far", materialId: "wood", distanceToCamera: 5 }),
      createRenderable({ id: "metal-near", materialId: "metal", distanceToCamera: 1 }),
      createRenderable({ id: "glass-far", materialId: "glass", distanceToCamera: 8, transparent: true }),
      createRenderable({ id: "wood-near", materialId: "wood", distanceToCamera: 1 }),
    ]);

    expect(queue.sorted().map((item) => item.id)).toEqual([
      "metal-near",
      "wood-near",
      "wood-far",
      "glass-far",
      "glass-near",
    ]);
  });

  it("tracks draw calls triangles textures and average frame time", () => {
    const stats = new RenderStatistics();
    stats.beginFrame();
    stats.recordDrawCall(12);
    stats.recordTextureBindings(["albedo", "normal", "albedo"]);
    stats.finishFrame(16);

    stats.beginFrame();
    stats.recordDrawCall(24);
    const snapshot = stats.finishFrame(20);

    expect(snapshot.drawCalls).toBe(1);
    expect(snapshot.triangles).toBe(24);
    expect(snapshot.textures).toBe(0);
    expect(snapshot.framesRendered).toBe(2);
    expect(snapshot.averageFrameTimeMs).toBe(18);
  });

  it("computes ascending shadow cascades and assigns shadow casters by depth range", () => {
    const mapper = new ShadowMapper(3, 0.5);
    const splits = mapper.computeCascadeSplits(1, 100);
    const cascades = mapper.buildShadowCascades([
      createRenderable({ id: "near", materialId: "m", distanceToCamera: 5, castsShadow: true }),
      createRenderable({ id: "mid", materialId: "m", distanceToCamera: 30, castsShadow: true }),
      createRenderable({ id: "far", materialId: "m", distanceToCamera: 90, castsShadow: true }),
      createRenderable({ id: "off", materialId: "m", distanceToCamera: 10, castsShadow: false }),
    ], 1, 100);

    expect(splits).toHaveLength(3);
    expect(splits[0]!).toBeGreaterThan(1);
    expect(splits[2]).toBe(100);
    expect(cascades.map((cascade) => cascade.renderableIds)).toEqual([
      ["near"],
      ["mid"],
      ["far"],
    ]);
  });

  it("captures environment probes and chooses the nearest probe for reflections", () => {
    const environmentMap = new EnvironmentMap();
    environmentMap.registerProbe("lobby", { x: 0, y: 0, z: 0 });
    environmentMap.registerProbe("forest", { x: 50, y: 0, z: 0 });
    environmentMap.captureProbe("lobby");

    expect(environmentMap.chooseProbe({ x: 2, y: 0, z: 0 })?.id).toBe("lobby");
    expect(environmentMap.sampleReflection("lobby", 0.6)).toEqual({
      probeId: "lobby",
      mipLevel: 3,
      facesCaptured: 6,
    });
  });

  it("renders a full scene into batches shadow passes and statistics", () => {
    const environmentMap = new EnvironmentMap();
    environmentMap.registerProbe("stage", { x: 0, y: 0, z: 0 });
    environmentMap.captureProbe("stage", ["px", "nx", "py", "ny", "pz", "nz"]);
    const renderer = new SceneRenderer(new RenderQueue(), new ShadowMapper(2, 0.5), environmentMap, new RenderStatistics());
    const scene: ManagedRenderScene = {
      name: "demo",
      renderables: [
        createRenderable({ id: "hero", materialId: "skin", distanceToCamera: 3, castsShadow: true, textureIds: ["skin-albedo"] }),
        createRenderable({ id: "cape", materialId: "fabric", distanceToCamera: 4, textureIds: ["fabric-albedo"] }),
      ],
    };

    const frame = renderer.renderScene(scene, {
      near: 1,
      far: 20,
      position: { x: 0, y: 0, z: 0 },
    }, { frameTimeMs: 18 });

    expect(frame.sceneName).toBe("demo");
    expect(frame.orderedRenderableIds).toEqual(["cape", "hero"]);
    expect(frame.batches).toHaveLength(2);
    expect(frame.shadowCascades.flatMap((cascade) => cascade.renderableIds)).toContain("hero");
    expect(frame.selectedProbeId).toBe("stage");
    expect(frame.stats).toMatchObject({
      drawCalls: 2,
      triangles: 24,
      textures: 2,
      frameTimeMs: 18,
    });
  });

  it("manages scene transitions and promotes the next scene when removing the active scene", () => {
    const manager = new SceneManager();
    manager.addScene({ name: "intro", renderables: [] });
    manager.addScene({ name: "battle", renderables: [] });

    manager.setActiveScene("battle", { kind: "fade", durationMs: 400 });
    expect(manager.lastTransition).toEqual({
      fromScene: "intro",
      toScene: "battle",
      kind: "fade",
      durationMs: 400,
      progress: 0,
    });
    expect(manager.updateTransition(200)?.progress).toBeCloseTo(0.5);
    expect(manager.removeScene("battle")).toBe(true);
    expect(manager.activeScene?.name).toBe("intro");
  });
});
