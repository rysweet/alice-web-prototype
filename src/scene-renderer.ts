/**
 * Headless scene renderer using Three.js + node-canvas.
 * Produces a PNG screenshot of the Alice scene without a browser.
 */
import type { AliceProject, AliceObject } from "./a3p-parser";

export interface RenderOptions {
  width: number;
  height: number;
}

export interface RenderResult {
  png: Buffer;
  objectCount: number;
  sceneDescription: string;
}

let cachedCreateCanvas: typeof import("canvas")["createCanvas"] | null = null;

function sceneTypeName(typeName: string): string {
  const lastDot = typeName.lastIndexOf(".");
  return lastDot === -1 ? typeName : typeName.slice(lastDot + 1);
}

/**
 * Render the Alice scene to a PNG buffer using software rasterization.
 * This is a simplified 2D top-down projection — not full 3D — suitable
 * for evidence screenshots that prove the scene was parsed and laid out.
 */
export async function renderSceneToPng(
  project: AliceProject,
  options: RenderOptions = { width: 640, height: 480 },
): Promise<RenderResult> {
  if (!cachedCreateCanvas) {
    const canvasModule = await import("canvas");
    cachedCreateCanvas = canvasModule.createCanvas;
  }
  const canvas = cachedCreateCanvas(options.width, options.height);
  const ctx = canvas.getContext("2d");

  // Sky background
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, options.width, options.height);

  // Ground plane (bottom half)
  ctx.fillStyle = "#4A7C3F";
  ctx.fillRect(0, options.height * 0.6, options.width, options.height * 0.4);

  // Horizon line
  ctx.strokeStyle = "#3A6C2F";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, options.height * 0.6);
  ctx.lineTo(options.width, options.height * 0.6);
  ctx.stroke();

  const centerX = options.width / 2;
  const centerY = options.height * 0.5;
  const scale = 30;
  const descriptions: string[] = [];
  let objectCount = 0;

  for (const obj of project.sceneObjects) {
    if (obj.typeName.includes("SGround") || obj.typeName.includes("SCamera")) {
      continue;
    }

    objectCount += 1;
    const x = centerX + (obj.position?.x ?? 0) * scale;
    const y = centerY - (obj.position?.z ?? 0) * scale;
    const w = (obj.size?.width ?? 1) * scale;
    const h = (obj.size?.depth ?? 1) * scale;

    // Object color
    if (obj.typeName.includes("SProp")) {
      ctx.fillStyle = "#B5651D";
    } else if (obj.typeName.includes("SModel") || obj.typeName.includes("SJointedModel")) {
      ctx.fillStyle = "#CC7722";
    } else {
      ctx.fillStyle = "#8888CC";
    }

    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    // Label
    ctx.fillStyle = "#000";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(obj.name, x, y - h / 2 - 4);
    descriptions.push(`${obj.name}(${sceneTypeName(obj.typeName)})`);
  }

  // Title
  ctx.fillStyle = "#000";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Alice Scene: ${project.projectName}`, 10, 20);
  ctx.font = "11px sans-serif";
  ctx.fillText(`${project.sceneObjects.length} objects, ${project.methods.length} methods`, 10, 38);

  const description = descriptions.join(", ");

  return {
    png: canvas.toBuffer("image/png"),
    objectCount,
    sceneDescription: description || "empty scene",
  };
}
