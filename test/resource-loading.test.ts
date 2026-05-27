import { describe, expect, it } from "vitest";
import {
  AssetManifest,
  AudioLoader,
  ModelResourceLoader,
  ProgressTracker,
  ResourceCache,
  TextureLoader,
} from "../src/resource-loading.js";

enum DemoAsset {
  Bunny = "models/bunny",
  Tree = "models/tree",
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const WAV_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);

describe("resource-loading", () => {
  it("evicts the least-recently-used cache entry", () => {
    const cache = new ResourceCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);

    cache.set("c", 3);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("enumerates manifest entries by type", () => {
    const manifest = new AssetManifest<string>([
      { key: DemoAsset.Bunny, type: "model", uri: "bunny.a3r" },
      { key: "textures/sky", type: "texture", uri: "sky.png" },
      { key: "audio/theme", type: "audio", uri: "theme.wav" },
    ]);

    expect(manifest.keys("model")).toEqual([DemoAsset.Bunny]);
    expect(manifest.keys("texture")).toEqual(["textures/sky"]);
    expect(manifest.keys().length).toBe(3);
  });

  it("loads model resources by enum key and reuses the cache", async () => {
    let loads = 0;
    const manifest = new AssetManifest<DemoAsset>([
      { key: DemoAsset.Bunny, type: "model", uri: "bunny.a3r", metadata: { joints: 12 } },
      { key: DemoAsset.Tree, type: "model", uri: "tree.a3r", metadata: { joints: 0 } },
    ]);
    const loader = new ModelResourceLoader(
      manifest,
      async (entry) => {
        loads += 1;
        return new Uint8Array([entry.key.length]);
      },
      (entry, bytes) => ({ uri: entry.uri, bytes: Array.from(bytes), joints: entry.metadata?.joints ?? 0 }),
    );

    const first = await loader.load(DemoAsset.Bunny);
    const second = await loader.load(DemoAsset.Bunny);

    expect(first).toBe(second);
    expect(first.payload).toEqual({ uri: "bunny.a3r", bytes: [DemoAsset.Bunny.length], joints: 12 });
    expect(loads).toBe(1);
  });

  it("detects texture formats and generates mipmaps", async () => {
    const textureLoader = new TextureLoader(async () => PNG_BYTES);
    const texture = await textureLoader.load({
      key: "textures/sky",
      type: "texture",
      uri: "sky.png",
      width: 64,
      height: 16,
    });

    expect(texture.format).toBe("image/png");
    expect(texture.mipmaps[0]).toEqual({ level: 0, width: 64, height: 16 });
    expect(texture.mipmaps.at(-1)).toEqual({ level: 6, width: 1, height: 1 });
  });

  it("detects audio formats from headers", async () => {
    const audioLoader = new AudioLoader(async () => WAV_BYTES);
    const audio = await audioLoader.load({
      key: "audio/theme",
      type: "audio",
      uri: "theme.wav",
      durationMs: 1200,
    });

    expect(audio.format).toBe("audio/wav");
    expect(audio.durationMs).toBe(1200);
  });

  it("reports loading progress callbacks", async () => {
    const manifest = new AssetManifest<DemoAsset>([
      { key: DemoAsset.Bunny, type: "model", uri: "bunny.a3r" },
      { key: DemoAsset.Tree, type: "model", uri: "tree.a3r" },
    ]);
    const loader = new ModelResourceLoader(
      manifest,
      async () => new Uint8Array([1, 2, 3]),
      (_entry, bytes) => ({ size: bytes.length }),
    );
    const tracker = new ProgressTracker();
    const percents: number[] = [];

    tracker.subscribe((snapshot) => {
      percents.push(snapshot.percent);
    });
    await loader.loadMany([DemoAsset.Bunny, DemoAsset.Tree], tracker);

    expect(percents[0]).toBe(0);
    expect(percents.at(-1)).toBe(100);
    expect(tracker.snapshot().completed).toBe(2);
  });
});
