import { describe, it, expect, afterAll } from "vitest";
import { createServer } from "../src/server";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import type { AddressInfo } from "net";

const TEST_EVIDENCE_DIR = path.resolve(__dirname, "../.test-cli-evidence");

describe("CLI / server lifecycle", () => {
  let server: http.Server;

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    fs.rmSync(TEST_EVIDENCE_DIR, { recursive: true, force: true });
  });

  it("starts and responds to health check", async () => {
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true });
    const app = createServer({
      port: 0,
      evidenceDir: TEST_EVIDENCE_DIR,
    });

    server = app.listen(0);
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("running");
    expect(body.runtime).toBe("lookingglass");
  });
});
