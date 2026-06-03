import { describe, expect, it } from "vitest";
import * as PublicApi from "../src/index.js";
import * as GalleryUi from "../src/gallery/index.js";

describe("gallery barrel exports", () => {
  it("exports the gallery UI module through the public index", () => {
    expect(PublicApi.GalleryUi).toBe(GalleryUi);
    expect(typeof PublicApi.GalleryUi.buildGalleryCatalog).toBe("function");
    expect(typeof PublicApi.GalleryUi.GalleryBrowserView).toBe("function");
    expect(typeof PublicApi.GalleryUi.GalleryToSceneAdapter).toBe("function");
  });
});
