import * as THREE from "three";
import { Geometry } from "./scenegraph-geometry-primitives";
import { GeometryBounds, VisualAppearance } from "./scenegraph-math-primitives";

export class PlaneGeometry extends Geometry {
  constructor(public width: number, public depth: number) {
    super("plane");
  }

  protected override computeBounds(): GeometryBounds {
    return {
      min: new THREE.Vector3(-this.width / 2, 0, -this.depth / 2),
      max: new THREE.Vector3(this.width / 2, 0, this.depth / 2),
    };
  }

  override toThreeGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(this.width, this.depth);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }
}

export abstract class Appearance {
  visible = true;
  abstract toThreeMaterial(side?: THREE.Side): THREE.Material;
}

export class SingleAppearance extends Appearance implements VisualAppearance {
  color = 0xffffff;
  opacity = 1;
  ambientColor: number | null = null;
  fillingStyle: "solid" | "wireframe" = "solid";
  shadingStyle: "smooth" | "flat" = "smooth";
  specularHighlightColor = 0x000000;
  emissiveColor = 0x000000;
  specularHighlightExponent = 0;
  isEthereal = false;

  clone(): SingleAppearance {
    const copy = new SingleAppearance();
    Object.assign(copy, this);
    return copy;
  }

  toThreeMaterial(side: THREE.Side = THREE.FrontSide): THREE.Material {
    return new THREE.MeshPhongMaterial({
      color: this.color,
      emissive: this.emissiveColor,
      specular: this.specularHighlightColor,
      shininess: this.specularHighlightExponent,
      opacity: this.opacity,
      transparent: this.opacity < 1 || this.isEthereal,
      wireframe: this.fillingStyle === "wireframe",
      flatShading: this.shadingStyle === "flat",
      side,
      depthWrite: !this.isEthereal,
    });
  }
}

export class TexturedAppearance extends SingleAppearance {
  texture: THREE.Texture | null = null;
  diffuseColorTexture: THREE.Texture | null = null;
  bumpTexture: THREE.Texture | null = null;
  textureId = -1;
  isDiffuseColorTextureAlphaBlended = false;
  isDiffuseColorTextureClamped = false;

  override clone(): TexturedAppearance {
    const copy = new TexturedAppearance();
    Object.assign(copy, this);
    return copy;
  }

  setDiffuseColorTextureAlphaBlended(isDiffuseColorTextureAlphaBlended: boolean): void {
    this.isDiffuseColorTextureAlphaBlended = isDiffuseColorTextureAlphaBlended;
  }

  setDiffuseColorTextureClamped(isDiffuseColorTextureClamped: boolean): void {
    this.isDiffuseColorTextureClamped = isDiffuseColorTextureClamped;
  }

  setDiffuseColorTexture(diffuseColorTexture: THREE.Texture | null): void {
    this.diffuseColorTexture = diffuseColorTexture;
  }

  setDiffuseColorTextureAndInferAlphaBlend(diffuseColorTexture: THREE.Texture | null): void {
    this.diffuseColorTexture = diffuseColorTexture;
    const inferredAlphaBlend = diffuseColorTexture
      ? ((diffuseColorTexture.userData?.isPotentiallyAlphaBlended as boolean | undefined)
          ?? (diffuseColorTexture.format === THREE.RGBAFormat || diffuseColorTexture.format === THREE.AlphaFormat))
      : false;
    this.isDiffuseColorTextureAlphaBlended = inferredAlphaBlend;
  }

  setBumpTexture(bumpTexture: THREE.Texture | null): void {
    this.bumpTexture = bumpTexture;
  }

  override toThreeMaterial(side: THREE.Side = THREE.FrontSide): THREE.Material {
    const material = super.toThreeMaterial(side) as THREE.MeshPhongMaterial;
    const texture = this.diffuseColorTexture ?? this.texture;
    if (texture) {
      texture.wrapS = this.isDiffuseColorTextureClamped
        ? THREE.ClampToEdgeWrapping
        : THREE.RepeatWrapping;
      texture.wrapT = texture.wrapS;
      material.map = texture;
    }
    if (this.bumpTexture) {
      material.bumpMap = this.bumpTexture;
    }
    material.transparent = this.isDiffuseColorTextureAlphaBlended || material.transparent;
    return material;
  }
}
