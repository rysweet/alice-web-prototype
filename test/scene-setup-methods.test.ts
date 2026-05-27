import { describe, expect, it, vi } from "vitest";
import { SBox } from "../src/story-api/expanded-entities.js";
import {
  ScenePropertyManager,
  addSceneEntity,
  createDefaultScene,
  handleActiveChanged,
  initializeEventListeners,
  performCustomSetup,
  performGeneratedSetUp,
} from "../src/scene-setup-methods.js";

describe("scene setup methods", () => {
  it("creates a default scene with ground camera and sun entities", () => {
    const context = createDefaultScene();

    expect(context.scene.getEntity("ground")).toBe(context.ground);
    expect(context.scene.getEntity("camera")).toBe(context.camera);
    expect(context.scene.getEntity("sun")).toBe(context.sun);
    expect(context.propertyManager.snapshot()).toMatchObject({
      atmosphereColor: "#87CEEB",
      fogDensity: 0.01,
      groundColor: "#5C8C3B",
    });
    expect(context.scene.isActive).toBe(false);
  });

  it("applies scene level properties including the ground color", () => {
    const context = createDefaultScene();
    const manager = new ScenePropertyManager(context.scene, context.ground);

    manager
      .setAtmosphereColor("#112233")
      .setFogDensity(0.25)
      .setAmbientLightColor("#334455")
      .setFromAboveLightColor("#556677")
      .setFromBelowLightColor("#778899")
      .setGroundColor("#00AA00");

    expect(context.scene.getAtmosphereColor()).toBe("#112233");
    expect(context.scene.getFogDensity()).toBe(0.25);
    expect(context.scene.getAmbientLightColor()).toBe("#334455");
    expect(context.scene.getFromAboveLightColor()).toBe("#556677");
    expect(context.scene.getFromBelowLightColor()).toBe("#778899");
    expect(context.ground.imp.getProperty<string>("paint")?.value).toBe("#00AA00");
    expect(manager.snapshot().groundColor).toBe("#00AA00");
  });

  it("initializes event listeners and runs cleanups in reverse order", () => {
    const context = createDefaultScene();
    const events: string[] = [];

    const cleanup = initializeEventListeners(context, [
      () => {
        events.push("listener:one");
        return () => events.push("cleanup:one");
      },
      () => {
        events.push("listener:two");
        return () => events.push("cleanup:two");
      },
    ]);

    cleanup();

    expect(events).toEqual([
      "listener:one",
      "listener:two",
      "cleanup:two",
      "cleanup:one",
    ]);
  });

  it("runs generated and custom setup callbacks against the same context", () => {
    const context = createDefaultScene();
    const generated = vi.fn((value) => addSceneEntity(value, "generated", new SBox()));
    const custom = vi.fn((value) => value.propertyManager.setGroundColor("#884422"));

    performGeneratedSetUp(context, generated);
    performCustomSetup(context, custom);

    expect(generated).toHaveBeenCalledWith(context);
    expect(custom).toHaveBeenCalledWith(context);
    expect(context.scene.getEntity("generated")).toBeInstanceOf(SBox);
    expect(context.ground.imp.getProperty<string>("paint")?.value).toBe("#884422");
  });

  it("handles scene activation changes and invokes callbacks", () => {
    const context = createDefaultScene();
    const activated = vi.fn();
    const deactivated = vi.fn();

    expect(handleActiveChanged(context, true, { onActivated: activated })).toBe(true);
    expect(context.scene.isActive).toBe(true);
    expect(activated).toHaveBeenCalledWith(context);

    expect(handleActiveChanged(context, false, { onDeactivated: deactivated })).toBe(false);
    expect(context.scene.isActive).toBe(false);
    expect(deactivated).toHaveBeenCalledWith(context);
  });
});
