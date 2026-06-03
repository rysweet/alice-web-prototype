import { describe, expect, it } from "vitest";
import { searchGallery } from "../src/gallery/gallery-data.js";
import { GalleryCatalog } from "../src/gallery.js";
import { SceneEditor } from "../src/scene-editor.js";
import { SBiped, SCamera, SProp, STransport } from "../src/story-api/index.js";

describe("SceneEditor", () => {
  it("seeds a default ground plane and camera", () => {
    const editor = new SceneEditor();

    expect(editor.getObject("ground")).toBeTruthy();
    expect(editor.getObject("camera")).toBeInstanceOf(SCamera);
  });

  it("places gallery models into the scene and snaps ground models to the floor", () => {
    const editor = new SceneEditor({ gallery: new GalleryCatalog() });

    const placed = editor.placeFromGallery("people/biped", "hero");

    expect(placed).toBeInstanceOf(SBiped);
    expect(editor.selectedName).toBe("hero");
    expect(editor.getProperty("hero", "position")).toEqual({ x: 0, y: 0.9, z: 0 });
  });

  it("edits scene object properties including model relationships", () => {
    const editor = new SceneEditor({ gallery: new GalleryCatalog() });
    editor.placeFromGallery("props/prop", "platform", { position: { x: 0, y: 0, z: 0 } });
    editor.placeFromGallery("people/biped", "hero", { position: { x: 1, y: 0, z: 0 } });

    editor.setProperty("hero", "color", "RED");
    editor.setProperty("hero", "opacity", 0.5);
    editor.setProperty("hero", "vehicle", "platform");

    expect(editor.getProperty("hero", "color")).toBe("RED");
    expect(editor.getProperty("hero", "opacity")).toBe(0.5);
    expect(editor.getProperty("hero", "vehicle")).toBe("platform");
  });

  it("updates camera state for focus, move, and orbit", () => {
    const editor = new SceneEditor({ gallery: new GalleryCatalog() });
    editor.placeFromGallery("props/prop", "crate", {
      position: { x: 3, y: 0, z: 2 },
      size: { width: 2, height: 4, depth: 2 },
    });

    editor.focusCameraOn("crate", 8);
    editor.moveCamera({ x: 1, y: 0, z: -2 });
    const beforeOrbit = editor.getCameraState().position;
    editor.orbitCamera(Math.PI / 2, 0);
    const afterOrbit = editor.getCameraState();

    expect(afterOrbit.target).toEqual({ x: 3, y: 2, z: 2 });
    expect(beforeOrbit).not.toEqual(afterOrbit.position);
  });

  it("can place custom objects without the gallery", () => {
    const editor = new SceneEditor();
    const object = editor.placeObject("marker", "org.lgna.story.SProp", {
      position: { x: 5, y: 1, z: -2 },
      select: false,
    });

    expect(object).toBeInstanceOf(SProp);
    expect(editor.selectedName).toBeNull();
    expect(editor.getProperty("marker", "position")).toEqual({ x: 5, y: 1, z: -2 });
  });

  it("respects explicit placement overrides when gallery defaults would snap to ground", () => {
    const editor = new SceneEditor({ gallery: new GalleryCatalog() });

    editor.placeFromGallery("people/biped", "hero", {
      position: { x: 2, y: 5, z: -1 },
      size: { width: 2, height: 3, depth: 4 },
      placeOnGround: false,
    });

    expect(editor.getProperty("hero", "position")).toEqual({ x: 2, y: 5, z: -1 });
    expect(editor.getProperty("hero", "size")).toEqual({ width: 2, height: 3, depth: 4 });
  });

  it("clears selection when removing the selected object", () => {
    const editor = new SceneEditor();
    editor.placeObject("marker", "org.lgna.story.SProp");

    expect(editor.selectedName).toBe("marker");
    expect(editor.removeObject("marker")).toBe(true);
    expect(editor.selectedName).toBeNull();
    expect(editor.removeObject("marker")).toBe(false);
  });

  it("supports clearing vehicle bindings and rejects non-string vehicle values", () => {
    const editor = new SceneEditor({ gallery: new GalleryCatalog() });
    editor.placeFromGallery("props/prop", "platform");
    editor.placeFromGallery("people/biped", "hero");

    editor.setProperty("hero", "vehicle", "platform");
    expect(editor.getProperty("hero", "vehicle")).toBe("platform");

    editor.setProperty("hero", "vehicle", null);
    expect(editor.getProperty("hero", "vehicle")).toBeNull();
    expect(() => editor.setProperty("hero", "vehicle", 42)).toThrow(/entity name or null/);
  });

  it("focuses on non-model entities with the default camera offset and minimum distance", () => {
    const editor = new SceneEditor();

    editor.focusCameraOn("camera", 0);

    expect(editor.getCameraState()).toEqual({
      position: { x: 0, y: 1.5, z: 1 },
      target: { x: 0, y: 0, z: 0 },
    });
  });

  it("rejects selecting names that are not in the scene", () => {
    const editor = new SceneEditor();

    expect(() => editor.selectObject("missing")).toThrow(/not found/);
    editor.selectObject(null);
    expect(editor.selectedName).toBeNull();
  });

  const placementCases: Array<{
    name: string;
    place: (editor: SceneEditor) => void;
    expectedPosition?: { x: number; y: number; z: number };
    expectedOrientation?: { x: number; y: number; z: number; w: number };
    expectedSelection?: string | null;
  }> = [
    {
      name: "defaults custom prop placement to the origin",
      place: (editor) => {
        editor.placeObject("prop-default", "org.lgna.story.SProp");
      },
      expectedPosition: { x: 0, y: 0, z: 0 },
      expectedSelection: "prop-default",
    },
    {
      name: "preserves explicit custom prop positions",
      place: (editor) => {
        editor.placeObject("prop-positioned", "org.lgna.story.SProp", {
          position: { x: -3, y: 2, z: 4 },
        });
      },
      expectedPosition: { x: -3, y: 2, z: 4 },
      expectedSelection: "prop-positioned",
    },
    {
      name: "snaps gallery bipeds to half their default height",
      place: (editor) => {
        editor.placeFromGallery("people/biped", "grounded-biped");
      },
      expectedPosition: { x: 0, y: 0.9, z: 0 },
      expectedSelection: "grounded-biped",
    },
    {
      name: "snaps gallery bipeds to half their explicit size when requested",
      place: (editor) => {
        editor.placeFromGallery("people/biped", "sized-biped", {
          size: { width: 2, height: 6, depth: 2 },
          placeOnGround: true,
        });
      },
      expectedPosition: { x: 0, y: 3, z: 0 },
      expectedSelection: "sized-biped",
    },
    {
      name: "leaves selection unchanged when placement opts out of selection",
      place: (editor) => {
        editor.placeObject("unselected", "org.lgna.story.SProp", { select: false });
      },
      expectedPosition: { x: 0, y: 0, z: 0 },
      expectedSelection: null,
    },
    {
      name: "applies explicit orientations during placement",
      place: (editor) => {
        editor.placeObject("turned", "org.lgna.story.SProp", {
          orientation: { x: 0, y: 0.5, z: 0, w: 0.5 },
          select: false,
        });
      },
      expectedOrientation: { x: 0, y: 0.5, z: 0, w: 0.5 },
      expectedSelection: null,
    },
  ];

  for (const testCase of placementCases) {
    it(testCase.name, () => {
      const editor = new SceneEditor({ gallery: new GalleryCatalog() });
      testCase.place(editor);
      if (testCase.expectedPosition) {
        const name = testCase.expectedSelection ?? editor.listObjectNames().find((value) => value !== "ground" && value !== "camera")!;
        expect(editor.getProperty(name, "position")).toEqual(testCase.expectedPosition);
      }
      if (testCase.expectedOrientation) {
        expect(editor.getProperty("turned", "orientation")).toEqual(testCase.expectedOrientation);
      }
      expect(editor.selectedName).toBe(testCase.expectedSelection);
    });
  }

  const propertyCases: Array<{
    name: string;
    propertyName: string;
    value: unknown;
    expected: unknown;
  }> = [
    {
      name: "stores custom size values",
      propertyName: "size",
      value: { width: 4, height: 5, depth: 6 },
      expected: { width: 4, height: 5, depth: 6 },
    },
    {
      name: "stores custom color values",
      propertyName: "color",
      value: "BLUE",
      expected: "BLUE",
    },
    {
      name: "stores custom opacity values",
      propertyName: "opacity",
      value: 0.25,
      expected: 0.25,
    },
    {
      name: "stores custom positions through the generic property API",
      propertyName: "position",
      value: { x: 8, y: 1, z: -4 },
      expected: { x: 8, y: 1, z: -4 },
    },
  ];

  for (const testCase of propertyCases) {
    it(testCase.name, () => {
      const editor = new SceneEditor({ gallery: new GalleryCatalog() });
      editor.placeFromGallery("props/prop", "prop");

      editor.setProperty("prop", testCase.propertyName, testCase.value);

      expect(editor.getProperty("prop", testCase.propertyName)).toEqual(testCase.expected);
    });
  }

  it("rejects duplicate placement names", () => {
    const editor = new SceneEditor();
    editor.placeObject("marker", "org.lgna.story.SProp");

    expect(() => editor.placeObject("marker", "org.lgna.story.SProp")).toThrow(/already exists/);
  });

  it("accepts gallery-data resource ids and model entries", () => {
    const editor = new SceneEditor({ gallery: new GalleryCatalog() });
    const submarine = searchGallery("submarine")[0];
    const alien = searchGallery("alien")[0];

    expect(submarine).toBeDefined();
    expect(alien).toBeDefined();
    expect(editor.placeFromGallery(submarine!.resourceId, "submarine")).toBeInstanceOf(STransport);
    expect(editor.placeFromGallery(alien!, "alien")).toBeInstanceOf(SBiped);
    expect(editor.listObjectNames()).toEqual(expect.arrayContaining(["submarine", "alien"]));
  });

  it("rejects unknown gallery model identifiers", () => {
    const editor = new SceneEditor({ gallery: new GalleryCatalog() });

    expect(() => editor.placeFromGallery("missing/model", "ghost")).toThrow(/gallery model/);
  });

  it("rejects non-model property updates for size and color", () => {
    const editor = new SceneEditor();

    expect(() => editor.setProperty("camera", "size", { width: 1, height: 1, depth: 1 })).toThrow(/does not support size/);
    expect(() => editor.setProperty("camera", "color", "RED")).toThrow(/does not support color/);
  });

  it("returns false when removing names that were never present", () => {
    const editor = new SceneEditor();

    expect(editor.removeObject("ghost")).toBe(false);
  });
});
