import { describe, expect, it } from "vitest";
import { ProjectIoError } from "../project-io.js";
import {
  assertSafeWritablePath,
  validateArchivePath,
} from "./path-security.js";

function expectUnsafe(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectIoError);
    expect((error as ProjectIoError).code).toBe("unsafe-path");
    return;
  }
  throw new Error("Expected unsafe path rejection");
}

describe("project-io/path-security", () => {
  it("accepts archive-relative paths without normalizing them", () => {
    expect(validateArchivePath("resources/images/hero texture.png")).toBe(
      "resources/images/hero texture.png",
    );
    expect(validateArchivePath("folder.name/file-name_01.a3r")).toBe(
      "folder.name/file-name_01.a3r",
    );
  });

  it("rejects traversal, absolute, Windows, UNC, and malformed archive paths", () => {
    for (const path of [
      "",
      ".",
      "./programType.xml",
      "resources/../evil.png",
      "../evil.png",
      "resources//evil.png",
      "/absolute/programType.xml",
      "\\\\server\\share\\evil.png",
      "C:/Users/Alice/evil.png",
      "C:\\Users\\Alice\\evil.png",
      "resources\\evil.png",
    ]) {
      expectUnsafe(() => validateArchivePath(path));
    }
  });

  it("uses the same fail-closed rules for write targets", () => {
    expect(assertSafeWritablePath("resources/models/bunny.a3r")).toBe(
      "resources/models/bunny.a3r",
    );
    expectUnsafe(() => assertSafeWritablePath("resources/../../manifest.json"));
  });
});
