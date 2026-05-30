import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../src/server";
import * as fs from "fs";
import * as path from "path";
import type { Express } from "express";
import request from "supertest";

describe("POST /api/code/create-procedure", () => {
  let app: Express;
  let evidenceDir: string;

  beforeAll(() => {
    evidenceDir = path.resolve(__dirname, `../.test-create-procedure-${Date.now()}`);
    fs.mkdirSync(evidenceDir, { recursive: true });
    app = createServer({ port: 0, evidenceDir });
  });

  afterAll(() => {
    fs.rmSync(evidenceDir, { recursive: true, force: true });
  });

  it("creates a simple procedure", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "walkForward" })
      .expect(200);
    expect(res.body.status).toBe("created");
    expect(res.body.name).toBe("walkForward");
    expect(res.body.kind).toBe("procedure");
  });

  it("creates a procedure with parameters", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({
        name: "moveToPosition",
        parameters: [
          { name: "x", type: "DecimalNumber" },
          { name: "y", type: "DecimalNumber" },
          { name: "z", type: "DecimalNumber", defaultValue: "0.0" },
        ],
      })
      .expect(200);
    expect(res.body.parameters).toHaveLength(3);
    expect(res.body.parameters[2].defaultValue).toBe("0.0");
  });

  it("rejects missing name", async () => {
    await request(app)
      .post("/api/code/create-procedure")
      .send({})
      .expect(400);
  });

  it("rejects empty name", async () => {
    await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "" })
      .expect(400);
  });

  it("rejects duplicate name", async () => {
    await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "myFirstMethod" })
      .expect(400);
  });

  it("rejects parameter without name", async () => {
    await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "badParams", parameters: [{ type: "Number" }] })
      .expect(400);
  });
});

describe("POST /api/code/create-function", () => {
  let app: Express;
  let evidenceDir: string;

  beforeAll(() => {
    evidenceDir = path.resolve(__dirname, `../.test-create-function-${Date.now()}`);
    fs.mkdirSync(evidenceDir, { recursive: true });
    app = createServer({ port: 0, evidenceDir });
  });

  afterAll(() => {
    fs.rmSync(evidenceDir, { recursive: true, force: true });
  });

  it("creates a function with return type", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({ name: "getDistance", returnType: "DecimalNumber" })
      .expect(200);
    expect(res.body.status).toBe("created");
    expect(res.body.kind).toBe("function");
    expect(res.body.returnType).toBe("DecimalNumber");
  });

  it("creates a function with parameters", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({
        name: "calculateArea",
        returnType: "DecimalNumber",
        parameters: [
          { name: "width", type: "DecimalNumber" },
          { name: "height", type: "DecimalNumber" },
        ],
      })
      .expect(200);
    expect(res.body.parameters).toHaveLength(2);
  });

  it("rejects missing returnType", async () => {
    await request(app)
      .post("/api/code/create-function")
      .send({ name: "noReturn" })
      .expect(400);
  });

  it("rejects missing name", async () => {
    await request(app)
      .post("/api/code/create-function")
      .send({ returnType: "Boolean" })
      .expect(400);
  });

  it("rejects duplicate name with existing procedure", async () => {
    await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "sharedName" })
      .expect(200);
    await request(app)
      .post("/api/code/create-function")
      .send({ name: "sharedName", returnType: "Boolean" })
      .expect(400);
  });
});
