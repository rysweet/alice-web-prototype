import { describe, it, expect } from "vitest";
import { validateProjectPath } from "../src/server";
import * as path from "path";
import * as fs from "fs";
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
      expect(res.body.error).toBeDefined();
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
});
