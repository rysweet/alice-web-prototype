import { describe, expect, it, vi } from "vitest";
import { createResourceManager } from "../src/resource-manager.js";

describe("resource manager depth", () => {
  it("returns entry snapshots without leaking top-level metadata mutations", async () => {
    const manager = createResourceManager(async () => new Uint8Array([1, 2, 3]));
    manager.register("textures/cat.png", "texture", {
      name: "Cat",
      provenance: "gallery",
      width: 64,
    });

    await manager.get("textures/cat.png");
    const entry = manager.getEntry("textures/cat.png");
    expect(entry).not.toBeNull();
    expect(entry?.lastAccessed).toBeGreaterThan(0);

    entry!.name = "Mutated";
    entry!.metadata.provenance = "mutated";

    expect(manager.getEntry("textures/cat.png")).toMatchObject({
      name: "Cat",
      metadata: { provenance: "gallery" },
    });
  });

  it("rolls back failed acquire reference counts and allows retry", async () => {
    let attempt = 0;
    const manager = createResourceManager(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("load failed");
      }
      return new Uint8Array([attempt]);
    });
    manager.register("models/bunny.a3r", "model");

    await expect(manager.acquire("models/bunny.a3r")).rejects.toThrow("load failed");
    expect(manager.referenceCount("models/bunny.a3r")).toBe(0);

    const data = await manager.acquire("models/bunny.a3r");
    expect([...data]).toEqual([2]);
    expect(manager.referenceCount("models/bunny.a3r")).toBe(1);
    expect(manager.release("models/bunny.a3r")).toBe(0);
  });

  it("removes loaded entries and permits clean re-registration", async () => {
    let version = 1;
    const loader = vi.fn(async () => new Uint8Array([version]));
    const manager = createResourceManager(loader);
    manager.register("shared-key", "audio");

    await manager.get("shared-key");
    expect(manager.remove("shared-key")).toBe(true);
    expect(manager.getIfLoaded("shared-key")).toBeNull();
    expect(manager.stats().catalogSize).toBe(0);

    version = 2;
    manager.register("shared-key", "audio", { name: "second-pass" });
    expect(await manager.get("shared-key")).toEqual(new Uint8Array([2]));
    expect(manager.getEntry("shared-key")).toMatchObject({ name: "second-pass", loaded: true });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
