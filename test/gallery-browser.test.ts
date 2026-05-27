import { describe, expect, it } from "vitest";
import {
  ClassGallery,
  GalleryCategory,
  GalleryImporter,
  GalleryItem,
  GallerySearch,
  GalleryThumbnail,
} from "../src/gallery-browser.js";

describe("gallery-browser", () => {
  function fixtures(): { people: GalleryCategory; animals: GalleryCategory; rabbit: GalleryItem; horse: GalleryItem } {
    const rabbit = new GalleryItem("rabbit", "Rabbit", "Friendly biped hero", "people", "", ["hero", "student"]);
    const horse = new GalleryItem("horse", "Horse", "Fast quadruped", "animals", "", ["ride", "pet"]);
    return {
      people: new GalleryCategory("people", "People", [rabbit]),
      animals: new GalleryCategory("animals", "Animals", [horse]),
      rabbit,
      horse,
    };
  }

  it("organizes items into categories and supports previews", () => {
    const { people, rabbit } = fixtures();

    expect(people.list()).toEqual([rabbit]);
    expect(people.search("friendly")).toEqual([rabbit]);
    expect(rabbit.toPreview()).toBe("Rabbit: Friendly biped hero");
  });

  it("filters gallery items by query, category, and tags", () => {
    const { people, animals, rabbit, horse } = fixtures();
    const search = new GallerySearch([people, animals]);

    expect(search.find("", { category: "animals" })).toEqual([horse]);
    expect(search.find("hero", { tags: ["student"] })).toEqual([rabbit]);
    expect(search.find("pet", { tags: ["ride"] })).toEqual([horse]);
  });

  it("imports items into the scene and keeps a history", () => {
    const { rabbit } = fixtures();
    const importer = new GalleryImporter((item) => ({ itemId: item.id, sceneName: `scene:${item.name}` }));

    expect(importer.import(rabbit)).toEqual({ itemId: "rabbit", sceneName: "scene:Rabbit" });
    expect(importer.history()).toEqual([{ itemId: "rabbit", sceneName: "scene:Rabbit" }]);
  });

  it("generates cached thumbnails and browses user-defined classes", () => {
    const { rabbit } = fixtures();
    let renders = 0;
    const thumbnails = new GalleryThumbnail((item) => {
      renders += 1;
      return `thumb:${item.id}:${renders}`;
    });
    const classes = new ClassGallery();

    classes.register({
      id: "class/friendlyRabbit",
      name: "FriendlyRabbit",
      description: "Student-authored helper class",
      category: "classes",
      tags: ["student", "helper"],
    });

    expect(thumbnails.get(rabbit)).toBe("thumb:rabbit:1");
    expect(thumbnails.get(rabbit)).toBe("thumb:rabbit:1");
    thumbnails.invalidate(rabbit.id);
    expect(thumbnails.get(rabbit)).toBe("thumb:rabbit:2");
    expect(classes.browse("helper").map((item) => item.id)).toEqual(["class/friendlyRabbit"]);
  });
});
