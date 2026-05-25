import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";

const EVIDENCE_DIR = "/tmp/hook-integration-test-evidence";
let testProjectPath: string;

beforeAll(async () => {
  execSync("npm run build:server", { stdio: "inherit" });

  // Create a minimal test .a3p
  const zip = new JSZip();
  zip.file("version.txt", "3.10.0.0");
  zip.file(
    "programType.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="1" type="org.lgna.project.ast.NamedUserType" uuid="program" version="3.10062">
  <property name="name"><value type="java.lang.String">Program</value></property>
  <property name="superType">
    <node key="2" type="org.lgna.project.ast.JavaType" uuid="program-super">
      <type name="org.lgna.story.SProgram"/>
    </node>
  </property>
  <property name="fields">
    <collection type="java.util.ArrayList">
      <node key="scene-field" type="org.lgna.project.ast.UserField" uuid="scene-field-uuid">
        <property name="name"><value type="java.lang.String">myScene</value></property>
        <property name="valueType">
          <node key="scene-type" type="org.lgna.project.ast.NamedUserType" uuid="scene-type-uuid">
            <property name="name"><value type="java.lang.String">Scene</value></property>
            <property name="superType">
              <node key="scene-super" type="org.lgna.project.ast.JavaType" uuid="scene-super-uuid">
                <type name="org.lgna.story.SScene"/>
              </node>
            </property>
            <property name="fields"><collection type="java.util.ArrayList"/></property>
            <property name="methods"><collection type="java.util.ArrayList"/></property>
            <property name="constructors"><collection type="java.util.ArrayList"/></property>
          </node>
        </property>
      </node>
    </collection>
  </property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
  <property name="constructors"><collection type="java.util.ArrayList"/></property>
</node>`,
  );
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  testProjectPath = path.join(EVIDENCE_DIR, "test-input.a3p");
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(testProjectPath, buf);
});

afterAll(() => {
  fs.rmSync(EVIDENCE_DIR, { recursive: true, force: true });
});

function runHook(hookName: string, extraArgs: string[] = []): string {
  const hookPath = path.resolve("dist-server/hooks", `${hookName}.js`);
  const evidenceSubdir = path.join(EVIDENCE_DIR, hookName);
  fs.mkdirSync(evidenceSubdir, { recursive: true });
  const args = [
    "--project",
    testProjectPath,
    "--evidence-dir",
    evidenceSubdir,
    "--json",
    ...extraArgs,
  ];
  return execSync(`node ${hookPath} ${args.join(" ")}`, {
    encoding: "utf-8",
    timeout: 10000,
  }).trim();
}

describe("eatme CLI hooks", () => {
  it("place-object produces valid JSON and artifacts", () => {
    const stdout = runHook("place-object");
    const result = JSON.parse(stdout);
    expect(result.schema_version).toBe(
      "eatme.alice-object-placement-result/v1",
    );
    expect(result.status).toBe("placed");
    expect(result.placement_artifact).toBe("placement.json");

    const evidenceDir = path.join(EVIDENCE_DIR, "place-object");
    expect(fs.existsSync(path.join(evidenceDir, "placed-project.a3p"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(evidenceDir, "placement.json"))).toBe(true);
    expect(fs.existsSync(path.join(evidenceDir, "scene.diff.json"))).toBe(true);

    const placement = JSON.parse(
      fs.readFileSync(path.join(evidenceDir, "placement.json"), "utf-8"),
    );
    expect(placement.schema_version).toBe(
      "eatme.alice-object-placement-artifact/v1",
    );
    expect(placement.object_class).toBe("org.lgna.story.SBiped");
  });

  it("edit-procedure produces valid JSON and artifacts", () => {
    const stdout = runHook("edit-procedure");
    const result = JSON.parse(stdout);
    expect(result.schema_version).toBe(
      "eatme.alice-first-lesson-code-editor-action-proof-result/v1",
    );
    expect(result.status).toBe("proved");
    expect(result.procedure_selector).toBe("scene.eatmeFirstLessonStep");

    const evidenceDir = path.join(EVIDENCE_DIR, "edit-procedure");
    expect(
      fs.existsSync(path.join(evidenceDir, "edited-project.a3p")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(evidenceDir, "first-lesson-code-editor-action-proof.json"),
      ),
    ).toBe(true);
  });

  it("run-world produces valid JSON and artifacts", () => {
    const stdout = runHook("run-world");
    const result = JSON.parse(stdout);
    expect(result.schema_version).toBe("eatme.alice-run-world-result/v1");
    expect(result.status).toBe("completed");

    const evidenceDir = path.join(EVIDENCE_DIR, "run-world");
    expect(
      fs.existsSync(path.join(evidenceDir, "run-world-result.json")),
    ).toBe(true);
  });

  it("save-project produces valid JSON and artifacts", () => {
    const stdout = runHook("save-project", [
      "--save-selector",
      "scene.eatmeFirstLessonStep",
    ]);
    const result = JSON.parse(stdout);
    expect(result.schema_version).toBe("eatme.alice-project-save-result/v1");
    expect(result.status).toBe("saved");

    const evidenceDir = path.join(EVIDENCE_DIR, "save-project");
    expect(
      fs.existsSync(path.join(evidenceDir, "saved-project.a3p")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(evidenceDir, "desktop-save-operation-result.json"),
      ),
    ).toBe(true);

    const saveResult = JSON.parse(
      fs.readFileSync(
        path.join(evidenceDir, "desktop-save-operation-result.json"),
        "utf-8",
      ),
    );
    expect(saveResult.schema_version).toBe(
      "eatme.alice-desktop-save-operation-result/v1",
    );
    expect(saveResult.status).toBe("saved");
    expect(saveResult.saved_file_size_bytes).toBeGreaterThan(0);
  });
});
