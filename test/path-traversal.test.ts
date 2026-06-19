import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { validateProjectPath } from "../src/server";
import * as path from "path";
import * as fs from "fs";
import request from "supertest";
import { createServer } from "../src/server";

const SYNTHETIC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="1" type="org.lgna.project.ast.NamedUserType" uuid="aaa" version="3.10062">
  <property name="name"><value type="java.lang.String">Program</value></property>
  <property name="superType">
    <node key="2" type="org.lgna.project.ast.JavaType" uuid="bbb">
      <type name="org.lgna.story.SProgram"/>
    </node>
  </property>
  <property name="fields"><collection type="java.util.ArrayList"/></property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
</node>`;

async function buildSyntheticA3P(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("version.txt", "3.6.0.0");
  zip.file("programType.xml", SYNTHETIC_XML);
  return zip.generateAsync({ type: "uint8array" });
}

describe("validateProjectPath", () => {
  const allowedDirs = ["/home/user/projects"];

  it("accepts valid .a3p path within allowed dir", () => {
    const result = validateProjectPath("/home/user/projects/myProject.a3p", allowedDirs);
    expect(result.valid).toBe(true);
  });

  it("accepts valid .a3p in subdirectory of allowed dir", () => {
    const result = validateProjectPath("/home/user/projects/sub/deep/project.a3p", allowedDirs);
    expect(result.valid).toBe(true);
  });

  it("rejects path traversal with ../", () => {
    const result = validateProjectPath("/home/user/projects/../../evil.a3p", allowedDirs);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("outside allowed");
  });

  it("rejects encoded traversal %2e%2e", () => {
    const result = validateProjectPath("/home/user/projects/%2e%2e/evil.a3p", allowedDirs);
    expect(result.valid).toBe(false);
  });

  it("rejects null bytes", () => {
    const result = validateProjectPath("/home/user/projects/evil\0.a3p", allowedDirs);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("null");
  });

  it("rejects non-.a3p extension", () => {
    const result = validateProjectPath("/home/user/projects/evil.txt", allowedDirs);
    expect(result.valid).toBe(false);
  });

  it("rejects path outside allowed dirs", () => {
    const result = validateProjectPath("/etc/passwd.a3p", allowedDirs);
    expect(result.valid).toBe(false);
  });

  it("rejects encoded forward slash %2f", () => {
    const result = validateProjectPath("/home/user/projects/%2f..%2f..%2fetc%2fpasswd.a3p", allowedDirs);
    expect(result.valid).toBe(false);
  });

  it("rejects encoded backslash %5c", () => {
    const result = validateProjectPath("/home/user/projects/%5c..%5c.a3p", allowedDirs);
    expect(result.valid).toBe(false);
  });

  it("handles multiple allowed dirs", () => {
    const dirs = ["/home/user/projects", "/workspace/alice"];
    expect(validateProjectPath("/workspace/alice/test.a3p", dirs).valid).toBe(true);
    expect(validateProjectPath("/var/evil.a3p", dirs).valid).toBe(false);
  });

  it("rejects empty string input", () => {
    const result = validateProjectPath("", allowedDirs);
    expect(result.valid).toBe(false);
  });
});

describe("POST /api/launch — path traversal protection", () => {
  it("rejects traversal path via API", async () => {
    const evidenceDir = path.resolve(__dirname, `../.test-path-traversal-${Date.now()}`);
    fs.mkdirSync(evidenceDir, { recursive: true });
    try {
      const app = createServer({ port: 0, evidenceDir, allowedProjectDirs: ["/safe"] });
      const res = await request(app)
        .post("/api/launch")
        .send({ project: "/safe/../../etc/passwd.a3p" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("outside allowed");
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("accepts valid path within allowed dir via API", async () => {
    const evidenceDir = path.resolve(__dirname, `../.test-path-traversal2-${Date.now()}`);
    fs.mkdirSync(evidenceDir, { recursive: true });
    try {
      const app = createServer({ port: 0, evidenceDir, allowedProjectDirs: ["/safe"] });
      const res = await request(app)
        .post("/api/launch")
        .send({ project: "/safe/myProject.a3p" });
      expect(res.status).toBe(200);
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects non-string project input via API", async () => {
    const evidenceDir = path.resolve(__dirname, `../.test-path-traversal3-${Date.now()}`);
    fs.mkdirSync(evidenceDir, { recursive: true });
    try {
      const app = createServer({ port: 0, evidenceDir, allowedProjectDirs: ["/safe"] });
      const res = await request(app)
        .post("/api/launch")
        .send({ project: 12345 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("string");
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("does not set launched state on rejected path", async () => {
    const evidenceDir = path.resolve(__dirname, `../.test-path-traversal4-${Date.now()}`);
    fs.mkdirSync(evidenceDir, { recursive: true });
    try {
      const app = createServer({ port: 0, evidenceDir, allowedProjectDirs: ["/safe"] });
      // Attempt launch with traversal path — should be rejected
      await request(app)
        .post("/api/launch")
        .send({ project: "/safe/../../etc/passwd.a3p" });
      // Verify server does not consider itself launched
      const healthRes = await request(app).get("/api/health");
      expect(healthRes.body.launched).toBe(false);
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("validates options.projectPath fallback against allowed dirs", async () => {
    const evidenceDir = path.resolve(__dirname, `../.test-path-traversal5-${Date.now()}`);
    fs.mkdirSync(evidenceDir, { recursive: true });
    try {
      const app = createServer({
        port: 0,
        evidenceDir,
        projectPath: "/outside/dir/project.a3p",
        allowedProjectDirs: ["/safe"],
      });
      // Launch without body.project — falls back to options.projectPath
      const res = await request(app).post("/api/launch").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("outside allowed");
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("allows the configured projectPath directory when no explicit allowed dirs are supplied", async () => {
    const fixtureRoot = path.resolve(__dirname, `../.test-path-traversal6-${Date.now()}`);
    const projectDir = path.join(fixtureRoot, "starter-projects");
    const evidenceDir = path.join(fixtureRoot, "evidence");
    const projectPath = path.join(projectDir, "starter.a3p");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(projectPath, await buildSyntheticA3P());
    try {
      const app = createServer({
        port: 0,
        evidenceDir,
        projectPath,
      });

      const res = await request(app).post("/api/launch").send({});

      expect(res.status).toBe(200);
      expect(res.body.project).toBe(projectPath);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
