import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createAppearanceFromMaterial,
  createMaterialDefinition,
  ManagedTexture,
  mapTextureCoordinate,
  TextureCoordinate2,
  TextureManager,
} from "../src/materials";
import { TexturedAppearance } from "../src/scenegraph";

describe("materials", () => {
  it("supports texture coordinates and mapping transforms", () => {
    expect(TextureCoordinate2.createNaN().isNaN()).toBe(true);

    const mapped = mapTextureCoordinate(new TextureCoordinate2(0.25, 0.75), {
      repeatU: 2,
      offsetU: 0.1,
      repeatV: 0.5,
      offsetV: -0.25,
      flipV: true,
    });

    expect(mapped.u).toBeCloseTo(0.6);
    expect(mapped.v).toBeCloseTo(0.875);
  });

  it("tracks texture image updates, alpha, and three.js conversion", () => {
    const texture = new ManagedTexture("hero", {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 128]),
    });
    const events: string[] = [];
    texture.addListener((_changed, reason) => events.push(reason));

    texture.setMipMappingDesired(false);
    texture.setPotentiallyAlphaBlended(true);
    texture.updateImage({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 255, 0, 255]),
    });

    const threeTexture = texture.toThreeTexture();

    expect(texture.isValid()).toBe(true);
    expect(events).toContain("mipmap");
    expect(events).toContain("image");
    expect(texture.potentiallyAlphaBlended).toBe(false);
    expect(threeTexture).toBeInstanceOf(THREE.DataTexture);
    expect(threeTexture!.userData.isPotentiallyAlphaBlended).toBe(false);
  });

  it("caches texture loads and tracks reference counts", async () => {
    let loads = 0;
    const manager = new TextureManager(async (key) => {
      loads += 1;
      return {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([key.length, 0, 255, 255]),
      };
    });

    const first = await manager.acquire("bird");
    const second = await manager.acquire("bird");

    expect(first).toBe(second);
    expect(loads).toBe(1);
    expect(manager.referenceCount("bird")).toBe(2);
    expect(manager.release("bird")).toBe(1);
    expect(manager.isReferenced("bird")).toBe(true);
    expect(manager.release("bird")).toBe(0);
    expect(manager.isReferenced("bird")).toBe(false);
  });

  it("creates textured appearances from material definitions", () => {
    const diffuse = new ManagedTexture("diffuse", {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 255, 255, 255]),
    });
    const appearance = createAppearanceFromMaterial(
      createMaterialDefinition({
        diffuseColor: 0x123456,
        specularColor: 0x222222,
        emissiveColor: 0x111111,
        opacity: 0.5,
        shininess: 24,
        diffuseTextureKey: "diffuse",
        alphaBlended: true,
        clamped: true,
      }),
      { diffuse },
    );

    expect(appearance).toBeInstanceOf(TexturedAppearance);
    const textured = appearance as TexturedAppearance;
    expect(textured.color).toBe(0x123456);
    expect(textured.opacity).toBeCloseTo(0.5);
    expect(textured.specularHighlightColor).toBe(0x222222);
    expect(textured.emissiveColor).toBe(0x111111);
    expect(textured.specularHighlightExponent).toBe(24);
    expect(textured.diffuseColorTexture).toBeInstanceOf(THREE.Texture);
    expect(textured.isDiffuseColorTextureAlphaBlended).toBe(true);
    expect(textured.isDiffuseColorTextureClamped).toBe(true);
  });
});
