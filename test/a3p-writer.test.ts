import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseA3P } from "../src/a3p-parser";
import { modifyAndWriteA3P } from "../src/a3p-writer";

const ALICE_HOME = process.env.ALICE_HOME ?? path.resolve(__dirname, "../../alice");
const STARTER_A3P = path.join(
  ALICE_HOME,
  "core/resources/target/distribution/application/starter-projects/amazonMinimum.a3p",
);
const OUTPUT_DIR = path.resolve(__dirname, "../.test-roundtrip");

describe("a3p-writer round-trip", () => {
  const fileExists = fs.existsSync(STARTER_A3P);

  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  it.skipIf(!fileExists)("modifies and writes .a3p back", async () => {
    const outputPath = path.join(OUTPUT_DIR, "modified.a3p");
    const result = await modifyAndWriteA3P(STARTER_A3P, outputPath, {
      addCommentToMethod: "performCustomSetup",
      commentText: "round-trip proof",
    });

    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(100);
  });

  it.skipIf(!fileExists)("modified .a3p is re-parseable", async () => {
    const outputPath = path.join(OUTPUT_DIR, "modified.a3p");
    if (!fs.existsSync(outputPath)) return;

    const data = fs.readFileSync(outputPath);
    const project = await parseA3P(data);

    expect(project.projectName).toBeTruthy();
    expect(project.sceneObjects.length).toBeGreaterThan(0);
    expect(project.methods.length).toBeGreaterThan(0);
  });

  it.skipIf(!fileExists)("preserves scene objects through round-trip", async () => {
    const original = await parseA3P(fs.readFileSync(STARTER_A3P));
    const outputPath = path.join(OUTPUT_DIR, "modified.a3p");
    if (!fs.existsSync(outputPath)) return;

    const modified = await parseA3P(fs.readFileSync(outputPath));
    expect(modified.sceneObjects.length).toBe(original.sceneObjects.length);
    expect(modified.projectName).toBe(original.projectName);
  });

  it.skipIf(!fileExists)("preserves methods through round-trip", async () => {
    const original = await parseA3P(fs.readFileSync(STARTER_A3P));
    const outputPath = path.join(OUTPUT_DIR, "modified.a3p");
    if (!fs.existsSync(outputPath)) return;

    const modified = await parseA3P(fs.readFileSync(outputPath));
    const origNames = original.methods.map((m) => m.name).sort();
    const modNames = modified.methods.map((m) => m.name).sort();
    expect(modNames).toEqual(origNames);
  });
});
