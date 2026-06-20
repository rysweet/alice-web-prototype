import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { execFileSync, execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import JSZip from "jszip";

let evidenceDir: string;
let testProjectPath: string;

beforeAll(() => {
  execSync("npm run build:server", { stdio: "inherit" });
});

beforeEach(async () => {
  evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-hooks-test-"));
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
  testProjectPath = path.join(evidenceDir, "test-input.a3p");
  fs.writeFileSync(testProjectPath, buf);
});

afterEach(() => {
  fs.rmSync(evidenceDir, { recursive: true, force: true });
});

function runHook(hookName: string, extraArgs: string[] = []): string {
  const hookPath = path.resolve("dist-server/hooks", `${hookName}.js`);
  const evidenceSubdir = path.join(evidenceDir, hookName);
  fs.mkdirSync(evidenceSubdir, { recursive: true });
  const args = [
    "--project",
    testProjectPath,
    "--evidence-dir",
    evidenceSubdir,
    "--json",
    ...extraArgs,
  ];
  return execFileSync("node", [hookPath, ...args], {
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

    const hookEvidenceDir = path.join(evidenceDir, "place-object");
    expect(fs.existsSync(path.join(hookEvidenceDir, "placed-project.a3p"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(hookEvidenceDir, "placement.json"))).toBe(true);
    expect(fs.existsSync(path.join(hookEvidenceDir, "scene.diff.json"))).toBe(true);

    const placement = JSON.parse(
      fs.readFileSync(path.join(hookEvidenceDir, "placement.json"), "utf-8"),
    );
    expect(placement.schema_version).toBe(
      "eatme.alice-object-placement-artifact/v1",
    );
    expect(placement.object_class).toBe("org.lgna.story.SBiped");
  });

  it("place-object honors explicit names and resource types", () => {
    const stdout = runHook("place-object", [
      "--name",
      "heroBunny",
      "--resource-type",
      "org.lgna.story.resources.biped.BunnyResource",
    ]);
    const result = JSON.parse(stdout);
    expect(result.object_identifier).toBe("heroBunny");

    const hookEvidenceDir = path.join(evidenceDir, "place-object");
    const placement = JSON.parse(
      fs.readFileSync(path.join(hookEvidenceDir, "placement.json"), "utf-8"),
    );
    const diff = JSON.parse(
      fs.readFileSync(path.join(hookEvidenceDir, "scene.diff.json"), "utf-8"),
    );
    expect(placement.object_identifier).toBe("heroBunny");
    expect(placement.resource_type).toBe(
      "org.lgna.story.resources.biped.BunnyResource",
    );
    expect(diff.added_fields).toEqual(["heroBunny"]);
  });

  it("edit-procedure produces valid JSON and artifacts", () => {
    const stdout = runHook("edit-procedure");
    const result = JSON.parse(stdout);
    expect(result.schema_version).toBe(
      "eatme.alice-first-lesson-code-editor-action-proof-result/v1",
    );
    expect(result.status).toBe("proved");
    expect(result.procedure_selector).toBe("scene.eatmeFirstLessonStep");

    const hookEvidenceDir = path.join(evidenceDir, "edit-procedure");
    expect(
      fs.existsSync(path.join(hookEvidenceDir, "edited-project.a3p")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(hookEvidenceDir, "first-lesson-code-editor-action-proof.json"),
      ),
    ).toBe(true);
  });

  it("edit-procedure creates missing methods for plain selectors and custom markers", () => {
    const stdout = runHook("edit-procedure", [
      "--procedure-selector",
      "customStep",
      "--edit-spec",
      "append-comment:custom-marker",
    ]);
    const result = JSON.parse(stdout);
    expect(result.procedure_selector).toBe("customStep");

    const hookEvidenceDir = path.join(evidenceDir, "edit-procedure");
    const diff = JSON.parse(
      fs.readFileSync(path.join(hookEvidenceDir, "procedure.diff.json"), "utf-8"),
    );
    expect(diff.method_name).toBe("customStep");
    expect(diff.before_statement_count).toBe(0);
    expect(diff.after_statement_count).toBe(1);
    expect(diff.added_statements).toEqual(["custom-marker"]);
  });

  it("run-world produces valid JSON and artifacts", () => {
    const stdout = runHook("run-world");
    const result = JSON.parse(stdout);
    expect(result.schema_version).toBe("eatme.alice-run-world-result/v1");
    expect(result.status).toBe("completed");

    const hookEvidenceDir = path.join(evidenceDir, "run-world");
    expect(
      fs.existsSync(path.join(hookEvidenceDir, "run-world-result.json")),
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

    const hookEvidenceDir = path.join(evidenceDir, "save-project");
    expect(
      fs.existsSync(path.join(hookEvidenceDir, "saved-project.a3p")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(hookEvidenceDir, "desktop-save-operation-result.json"),
      ),
    ).toBe(true);

    const saveResult = JSON.parse(
      fs.readFileSync(
        path.join(hookEvidenceDir, "desktop-save-operation-result.json"),
        "utf-8",
      ),
    );
    expect(saveResult.schema_version).toBe(
      "eatme.alice-desktop-save-operation-result/v1",
    );
    expect(saveResult.status).toBe("saved");
    expect(saveResult.saved_file_size_bytes).toBeGreaterThan(0);
  });

  it("save-project preserves custom targets while emitting canonical evidence copy", () => {
    const customTarget = path.join(evidenceDir, "custom-output", "lesson-copy.a3p");
    const stdout = runHook("save-project", [
      "--save-selector",
      "scene.eatmeFirstLessonStep",
      "--target",
      customTarget,
    ]);
    const result = JSON.parse(stdout);
    expect(result.status).toBe("saved");

    const hookEvidenceDir = path.join(evidenceDir, "save-project");
    expect(fs.existsSync(customTarget)).toBe(true);
    expect(
      fs.existsSync(path.join(hookEvidenceDir, "saved-project.a3p")),
    ).toBe(true);
  });
});
