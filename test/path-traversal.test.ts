import { describe, it, expect } from "vitest";
import { validateProjectPath } from "../src/server";
import { createEmptyWorldProject } from "../src/project-template";
import { writeA3P } from "../src/a3p-writer/archive";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import request from "supertest";
import { createServer } from "../src/server";

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
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-path-traversal-evidence-"));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alice-path-traversal-projects-"));
    const projectPath = path.join(projectRoot, "myProject.a3p");
    try {
      fs.writeFileSync(
        projectPath,
        await writeA3P(createEmptyWorldProject({ projectName: "Traversal Safe Project" })),
      );
      const app = createServer({ port: 0, evidenceDir, allowedProjectDirs: [projectRoot] });
      const res = await request(app)
        .post("/api/launch")
        .send({ project: projectPath });
      expect(res.status).toBe(200);
      expect(res.body.projectName).toBe("Traversal Safe Project");
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects a symlink that escapes the allowed directory via API", async () => {
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-path-traversal-evidence-"));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alice-path-traversal-projects-"));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alice-path-traversal-outside-"));
    const outsideProject = path.join(outsideRoot, "outside.a3p");
    const symlinkProject = path.join(projectRoot, "link.a3p");
    try {
      fs.writeFileSync(
        outsideProject,
        await writeA3P(createEmptyWorldProject({ projectName: "Outside Project" })),
      );
      fs.symlinkSync(outsideProject, symlinkProject);
      const app = createServer({ port: 0, evidenceDir, allowedProjectDirs: [projectRoot] });

      const res = await request(app)
        .post("/api/launch")
        .send({ project: symlinkProject });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("outside allowed");

      const healthRes = await request(app).get("/api/health");
      expect(healthRes.body.launched).toBe(false);
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("rejects a symlink whose real target is not an .a3p file via API", async () => {
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-path-traversal-evidence-"));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alice-path-traversal-projects-"));
    const targetProject = path.join(projectRoot, "target.zip");
    const symlinkProject = path.join(projectRoot, "link.a3p");
    try {
      fs.writeFileSync(
        targetProject,
        await writeA3P(createEmptyWorldProject({ projectName: "Wrong Extension Project" })),
      );
      fs.symlinkSync(targetProject, symlinkProject);
      const app = createServer({ port: 0, evidenceDir, allowedProjectDirs: [projectRoot] });

      const res = await request(app)
        .post("/api/launch")
        .send({ project: symlinkProject });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(".a3p");

      const healthRes = await request(app).get("/api/health");
      expect(healthRes.body.launched).toBe(false);
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
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
});
