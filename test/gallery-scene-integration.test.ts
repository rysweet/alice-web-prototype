import { describe, expect, it } from "vitest";
import { searchGallery } from "../src/gallery/gallery-data.js";
import {
  GALLERY_ADD_TO_SCENE_EVENT,
  GallerySceneIntegration,
  type EntityData,
} from "../src/gallery/gallery-scene-integration.js";
import { SceneEditor } from "../src/scene-editor.js";
import { STransport } from "../src/story-api/index.js";

describe("GallerySceneIntegration", () => {
  it("emits a gallery:add-to-scene event with entity data", () => {
    const target = new EventTarget();
    const integration = new GallerySceneIntegration({ eventTarget: target });
    let detail: EntityData | null = null;

    target.addEventListener(GALLERY_ADD_TO_SCENE_EVENT, (event) => {
      detail = (event as CustomEvent<EntityData>).detail;
    });

    const entity = integration.addModelToScene("ALIEN");

    expect(entity.resourceId).toBe("ALIEN");
    expect(entity.type).toBe("BIPED");
    expect(entity.model.geometry.vertices.length).toBeGreaterThan(0);
    expect(detail).toEqual(entity);
  });

  it("invokes registered callbacks with the created entity", () => {
    const integration = new GallerySceneIntegration({ eventTarget: new EventTarget() });
    const received: EntityData[] = [];
    const dispose = integration.onAddToScene((entity) => {
      received.push(entity);
    });

    integration.addModelToScene("PENGUIN", { x: 1, y: 2, z: 3 });
    dispose();

    expect(received).toHaveLength(1);
    expect(received[0]?.resourceId).toBe("PENGUIN");
    expect(received[0]?.type).toBe("BIPED");
    expect(received[0]?.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("defaults entity position to the origin", () => {
    const integration = new GallerySceneIntegration({ eventTarget: new EventTarget() });

    const entity = integration.addModelToScene("SUBMARINE");

    expect(entity.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(entity.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("bridges searched gallery models into the scene editor", () => {
    const integration = new GallerySceneIntegration({ eventTarget: new EventTarget() });
    const editor = new SceneEditor();
    const adapter = integration.connectSceneEditor(editor);
    const model = searchGallery("submarine")[0];

    expect(model).toBeDefined();
    integration.addModelToScene(model!.resourceId);

    expect(editor.selectedName).toBe("submarine");
    expect(editor.getObject("submarine")).toBeInstanceOf(STransport);
    expect(editor.scene.entities.has("submarine")).toBe(true);

    adapter.dispose();
  });
});
