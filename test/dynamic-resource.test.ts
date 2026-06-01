import { describe, it, expect } from "vitest";
import {
  ResourceBase,
  DynamicResource,
  DynamicModelResource,
  DynamicAudioResource,
  DynamicImageResource,
  ResourceManager,
  ResourceBundle,
  AudioResource as StaticAudioResource,
  type ResourceKind,
  type ProjectResource,
} from "../src/resource-system.js";

// ═══════════════════════════════════════════════════════════════════════════
// DynamicResource hierarchy — TDD tests (written before implementation)
//
// DynamicResource extends ResourceBase with `data: ArrayBuffer` and
// `source: "runtime"` to distinguish user-imported runtime assets from
// archive-loaded resources.
//
// Subtypes: DynamicModelResource, DynamicAudioResource, DynamicImageResource
// ResourceManager gains registerDynamic() convenience method.
// ResourceKind widens to include "dynamic".
// ProjectResource union widens to include DynamicResource subtypes.
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// ResourceBase export
// ---------------------------------------------------------------------------

describe("ResourceBase — export", () => {
  it("exports ResourceBase as a class", () => {
    expect(ResourceBase).toBeDefined();
    expect(typeof ResourceBase).toBe("function");
  });

  it("ResourceBase can be instantiated directly for testing", () => {
    const base = new ResourceBase("audio", "test-id", "Test Resource", ["tag1"]);
    expect(base.kind).toBe("audio");
    expect(base.id).toBe("test-id");
    expect(base.name).toBe("Test Resource");
    expect(base.tags).toEqual(["tag1"]);
  });

  it("ResourceBase rejects empty id", () => {
    expect(() => new ResourceBase("audio", "", "Name")).toThrow("Resource id cannot be empty");
  });

  it("ResourceBase rejects empty name", () => {
    expect(() => new ResourceBase("audio", "id", "  ")).toThrow("Resource name cannot be empty");
  });
});

// ---------------------------------------------------------------------------
// ResourceKind widened to include "dynamic"
// ---------------------------------------------------------------------------

describe("ResourceKind — dynamic kind", () => {
  it("accepts 'dynamic' as a valid ResourceKind (compile-time check)", () => {
    const kind: ResourceKind = "dynamic";
    expect(kind).toBe("dynamic");
  });
});

// ---------------------------------------------------------------------------
// DynamicResource base class
// ---------------------------------------------------------------------------

describe("DynamicResource — base class", () => {
  it("exports DynamicResource as a class", () => {
    expect(DynamicResource).toBeDefined();
    expect(typeof DynamicResource).toBe("function");
  });

  it("extends ResourceBase", () => {
    const dr = new DynamicResource("audio", "dyn-001", "Dynamic Sound", new ArrayBuffer(512));
    expect(dr).toBeInstanceOf(ResourceBase);
    expect(dr).toBeInstanceOf(DynamicResource);
  });

  it("has kind, id, name from ResourceBase", () => {
    const dr = new DynamicResource("image", "dyn-img", "My Image", new ArrayBuffer(256));
    expect(dr.kind).toBe("image");
    expect(dr.id).toBe("dyn-img");
    expect(dr.name).toBe("My Image");
  });

  it("has data: ArrayBuffer", () => {
    const buf = new ArrayBuffer(1024);
    const dr = new DynamicResource("model", "m-1", "Model", buf);
    expect(dr.data).toBeInstanceOf(ArrayBuffer);
    expect(dr.data.byteLength).toBe(1024);
  });

  it("defensive copy: modifying original buffer does not affect resource", () => {
    const buf = new ArrayBuffer(8);
    const view = new Uint8Array(buf);
    view[0] = 42;
    const dr = new DynamicResource("audio", "a-1", "Sound", buf);

    // Modify original
    view[0] = 99;

    // Resource should still have 42
    const resourceView = new Uint8Array(dr.data);
    expect(resourceView[0]).toBe(42);
  });

  it("source is always 'runtime'", () => {
    const dr = new DynamicResource("audio", "a-2", "Sound2", new ArrayBuffer(0));
    expect(dr.source).toBe("runtime");
  });

  it("accepts optional tags", () => {
    const dr = new DynamicResource("audio", "a-3", "Tagged", new ArrayBuffer(0), ["imported", "user"]);
    expect(dr.tags).toEqual(["imported", "user"]);
    expect(dr.hasTag("imported")).toBe(true);
    expect(dr.hasTag("archive")).toBe(false);
  });

  it("rejects empty id", () => {
    expect(() => new DynamicResource("audio", "", "Name", new ArrayBuffer(0))).toThrow(
      "Resource id cannot be empty",
    );
  });

  it("rejects empty name", () => {
    expect(() => new DynamicResource("audio", "id", "  ", new ArrayBuffer(0))).toThrow(
      "Resource name cannot be empty",
    );
  });
});

// ---------------------------------------------------------------------------
// DynamicModelResource
// ---------------------------------------------------------------------------

describe("DynamicModelResource", () => {
  it("exports DynamicModelResource as a class", () => {
    expect(DynamicModelResource).toBeDefined();
  });

  it("extends DynamicResource", () => {
    const dmr = new DynamicModelResource("mod-1", "Custom Model", new ArrayBuffer(2048));
    expect(dmr).toBeInstanceOf(DynamicResource);
    expect(dmr).toBeInstanceOf(ResourceBase);
  });

  it("kind is 'model'", () => {
    const dmr = new DynamicModelResource("mod-1", "Model", new ArrayBuffer(0));
    expect(dmr.kind).toBe("model");
  });

  it("source is 'runtime'", () => {
    const dmr = new DynamicModelResource("mod-1", "Model", new ArrayBuffer(0));
    expect(dmr.source).toBe("runtime");
  });

  it("has data: ArrayBuffer", () => {
    const dmr = new DynamicModelResource("mod-1", "Model", new ArrayBuffer(512));
    expect(dmr.data.byteLength).toBe(512);
  });

  it("accepts optional tags", () => {
    const dmr = new DynamicModelResource("mod-1", "Model", new ArrayBuffer(0), ["custom"]);
    expect(dmr.hasTag("custom")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DynamicAudioResource
// ---------------------------------------------------------------------------

describe("DynamicAudioResource", () => {
  it("exports DynamicAudioResource as a class", () => {
    expect(DynamicAudioResource).toBeDefined();
  });

  it("extends DynamicResource", () => {
    const dar = new DynamicAudioResource("aud-1", "Custom Sound", new ArrayBuffer(4096));
    expect(dar).toBeInstanceOf(DynamicResource);
    expect(dar).toBeInstanceOf(ResourceBase);
  });

  it("kind is 'audio'", () => {
    const dar = new DynamicAudioResource("aud-1", "Sound", new ArrayBuffer(0));
    expect(dar.kind).toBe("audio");
  });

  it("source is 'runtime'", () => {
    const dar = new DynamicAudioResource("aud-1", "Sound", new ArrayBuffer(0));
    expect(dar.source).toBe("runtime");
  });

  it("has data: ArrayBuffer", () => {
    const dar = new DynamicAudioResource("aud-1", "Sound", new ArrayBuffer(2048));
    expect(dar.data.byteLength).toBe(2048);
  });

  it("accepts optional tags", () => {
    const dar = new DynamicAudioResource("aud-1", "Sound", new ArrayBuffer(0), ["sfx"]);
    expect(dar.hasTag("sfx")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DynamicImageResource
// ---------------------------------------------------------------------------

describe("DynamicImageResource", () => {
  it("exports DynamicImageResource as a class", () => {
    expect(DynamicImageResource).toBeDefined();
  });

  it("extends DynamicResource", () => {
    const dir = new DynamicImageResource("img-1", "Custom Texture", new ArrayBuffer(8192));
    expect(dir).toBeInstanceOf(DynamicResource);
    expect(dir).toBeInstanceOf(ResourceBase);
  });

  it("kind is 'image'", () => {
    const dir = new DynamicImageResource("img-1", "Texture", new ArrayBuffer(0));
    expect(dir.kind).toBe("image");
  });

  it("source is 'runtime'", () => {
    const dir = new DynamicImageResource("img-1", "Texture", new ArrayBuffer(0));
    expect(dir.source).toBe("runtime");
  });

  it("has data: ArrayBuffer", () => {
    const dir = new DynamicImageResource("img-1", "Texture", new ArrayBuffer(4096));
    expect(dir.data.byteLength).toBe(4096);
  });

  it("accepts optional tags", () => {
    const dir = new DynamicImageResource("img-1", "Texture", new ArrayBuffer(0), ["user-import"]);
    expect(dir.hasTag("user-import")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ResourceManager.registerDynamic()
// ---------------------------------------------------------------------------

describe("ResourceManager — registerDynamic", () => {
  it("registerDynamic adds a DynamicResource to the manager", () => {
    const manager = new ResourceManager();
    const dr = new DynamicAudioResource("dyn-aud", "User Sound", new ArrayBuffer(512));
    manager.registerDynamic(dr);

    expect(manager.hasResource("dyn-aud")).toBe(true);
    expect(manager.getResource("dyn-aud")).toBe(dr);
  });

  it("registerDynamic places resource in 'dynamic' bundle by default", () => {
    const manager = new ResourceManager();
    const dr = new DynamicModelResource("dyn-mod", "User Model", new ArrayBuffer(1024));
    manager.registerDynamic(dr);

    const found = manager.manifest.findResource("dyn-mod");
    expect(found).toBe(dr);
  });

  it("registerDynamic accepts a custom bundleId", () => {
    const manager = new ResourceManager();
    const dr = new DynamicImageResource("dyn-img", "User Image", new ArrayBuffer(256));
    manager.registerDynamic(dr, "user-imports");

    expect(manager.hasResource("dyn-img")).toBe(true);
  });

  it("registerDynamic returns this for chaining", () => {
    const manager = new ResourceManager();
    const dr = new DynamicAudioResource("d1", "Sound1", new ArrayBuffer(0));
    const result = manager.registerDynamic(dr);
    expect(result).toBe(manager);
  });

  it("registered DynamicResource shows up in listResources", () => {
    const manager = new ResourceManager();
    const dr = new DynamicAudioResource("list-test", "List Test", new ArrayBuffer(0));
    manager.registerDynamic(dr);

    const all = manager.listResources();
    expect(all.some((r) => r.id === "list-test")).toBe(true);
  });

  it("registered DynamicResource can be retrieved with requireResource", () => {
    const manager = new ResourceManager();
    const dr = new DynamicModelResource("req-test", "Req Test", new ArrayBuffer(0));
    manager.registerDynamic(dr);

    expect(() => manager.requireResource("req-test")).not.toThrow();
    expect(manager.requireResource("req-test")).toBe(dr);
  });
});

// ---------------------------------------------------------------------------
// ProjectResource union includes DynamicResource subtypes
// ---------------------------------------------------------------------------

describe("ProjectResource — union includes dynamic types", () => {
  it("DynamicModelResource is assignable to ProjectResource (compile-time check)", () => {
    const dr: ProjectResource = new DynamicModelResource("p-1", "PR Model", new ArrayBuffer(0));
    expect(dr.kind).toBe("model");
  });

  it("DynamicAudioResource is assignable to ProjectResource (compile-time check)", () => {
    const dr: ProjectResource = new DynamicAudioResource("p-2", "PR Audio", new ArrayBuffer(0));
    expect(dr.kind).toBe("audio");
  });

  it("DynamicImageResource is assignable to ProjectResource (compile-time check)", () => {
    const dr: ProjectResource = new DynamicImageResource("p-3", "PR Image", new ArrayBuffer(0));
    expect(dr.kind).toBe("image");
  });

  it("DynamicResource subtypes can be added to ResourceBundle", () => {
    const bundle = new ResourceBundle("dynamic-bundle", "Dynamic Bundle");
    const model = new DynamicModelResource("dm-1", "Model", new ArrayBuffer(0));
    const audio = new DynamicAudioResource("da-1", "Audio", new ArrayBuffer(0));
    const image = new DynamicImageResource("di-1", "Image", new ArrayBuffer(0));

    bundle.add(model).add(audio).add(image);
    expect(bundle.list().length).toBe(3);
    expect(bundle.list("model").length).toBe(1);
    expect(bundle.list("audio").length).toBe(1);
    expect(bundle.list("image").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: DynamicResource with existing system
// ---------------------------------------------------------------------------

describe("DynamicResource — integration with existing system", () => {
  it("coexists with static resources in ResourceManager", () => {
    const manager = new ResourceManager();

    // Static resource
    const staticAudio = new StaticAudioResource("static-aud", "Static Sound", 2.5, "wav");
    manager.registerResource(staticAudio);

    // Dynamic resource
    const dynamicAudio = new DynamicAudioResource("dynamic-aud", "Dynamic Sound", new ArrayBuffer(1024));
    manager.registerDynamic(dynamicAudio);

    expect(manager.hasResource("static-aud")).toBe(true);
    expect(manager.hasResource("dynamic-aud")).toBe(true);
    expect(manager.listResources().length).toBe(2);
  });

  it("DynamicResource source distinguishes from archive resources", () => {
    const dr = new DynamicAudioResource("src-test", "Source Test", new ArrayBuffer(0));
    expect(dr.source).toBe("runtime");
    // Static resources don't have a source property — this is the distinguishing feature
  });
});
