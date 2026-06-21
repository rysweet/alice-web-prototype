// test/alice-identity.test.ts
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "..");

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf-8");
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readText(relativePath)) as Record<string, unknown>;
}

describe("Alice WebXR identity boundary", () => {
  it("keeps package and runtime identity on alice-web while adding WebXR helpers", () => {
    const packageJson = readJson("package.json");
    const index = readText("src/index.ts");

    expect(packageJson.name).toBe("alice-web");
    expect(index).toContain('export * as WebXRCapabilities from "./webxr-capabilities";');
    expect(index).toContain('export * as WebXRSession from "./webxr-session";');
    expect(index).toContain('export * as WebXRInput from "./webxr-input";');
    expect(index).toContain('export * as WebXRLocomotion from "./webxr-locomotion";');
    expect(index).toContain('export * as WebXRUi from "./webxr-ui";');
    expect(index).not.toMatch(/LookingGlassWebXR|lookingglass-webxr|lookingglass-vr/);
  });

  it("wires browser runtime UI with Alice data attributes and no LookingGlass runtime labels", () => {
    const html = readText("src/index.html");
    const main = readText("src/main.ts");
    const combined = `${html}\n${main}`;

    expect(combined).toContain("Alice");
    expect(combined).toContain("data-alice-webxr-vr-button");
    expect(combined).toContain("data-alice-webxr-status");
    expect(combined).toContain("data-alice-webxr-evidence");
    expect(main).toContain("detectWebXRCapabilities");
    expect(main).toContain("createWebXRSessionController");
    expect(main).toContain("createWebXRLocomotion");
    expect(main).toContain("renderWebXRStatus");
    expect(combined).not.toMatch(/LookingGlass|lookingglass/);
  });
});
