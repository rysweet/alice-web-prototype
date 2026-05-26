import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const worktreeRoot = path.resolve(testDir, "..");
const gitRepoRoot = path.resolve(worktreeRoot, "..", "..", "..");
const sandboxRoot = path.join(gitRepoRoot, "worktrees", "mutation-sandboxes");

interface MutationCase {
  readonly name: string;
  readonly relativePath: string;
  readonly from: string;
  readonly to: string;
  readonly testFile: string;
}

function replaceExactlyOnce(source: string, from: string, to: string): string {
  const firstIndex = source.indexOf(from);
  if (firstIndex < 0) {
    throw new Error(`Unable to find mutation target: ${from}`);
  }
  if (source.indexOf(from, firstIndex + from.length) >= 0) {
    throw new Error(`Mutation target is ambiguous in source: ${from}`);
  }
  return `${source.slice(0, firstIndex)}${to}${source.slice(firstIndex + from.length)}`;
}

function runMutationCase(testCase: MutationCase): string {
  mkdirSync(sandboxRoot, { recursive: true });
  const sandboxPath = path.join(sandboxRoot, testCase.name);
  rmSync(sandboxPath, { force: true, recursive: true });

  execFileSync("git", ["worktree", "add", "--detach", sandboxPath, "HEAD"], {
    cwd: gitRepoRoot,
    stdio: "pipe",
  });

  try {
    const sharedNodeModules = path.join(worktreeRoot, "node_modules");
    const sandboxNodeModules = path.join(sandboxPath, "node_modules");
    if (existsSync(sharedNodeModules) && !existsSync(sandboxNodeModules)) {
      symlinkSync(sharedNodeModules, sandboxNodeModules, "dir");
    }

    const targetPath = path.join(sandboxPath, testCase.relativePath);
    const original = readFileSync(targetPath, "utf8");
    writeFileSync(targetPath, replaceExactlyOnce(original, testCase.from, testCase.to), "utf8");

    const result = spawnSync(
      "npm",
      ["test", "--", "--run", testCase.testFile],
      {
        cwd: sandboxPath,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "1",
        },
      },
    );

    expect(result.status).not.toBe(0);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(output).toMatch(/failed|error|FAIL/i);
    return output;
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", sandboxPath], {
      cwd: gitRepoRoot,
      encoding: "utf8",
    });
    rmSync(sandboxPath, { force: true, recursive: true });
  }
}

describe.sequential("mutation testing harness", () => {
  it("detects when deleting a method body breaks persistence tests", () => {
    const output = runMutationCase({
      name: "delete-save-body",
      relativePath: "src/preferences.ts",
      from: `  save(force = true): void {\n    if ((!force && !this._autoSave) || !this._storage) {\n      return;\n    }\n    this._storage.setItem(this._storageKey, JSON.stringify(this.toJSON()));\n  }`,
      to: `  save(force = true): void {\n  }`,
      testFile: "test/preferences.test.ts",
    });

    expect(output).toContain("preferences.test.ts");
  });

  it("detects when a comparison operator change flips archive encoding behavior", () => {
    const output = runMutationCase({
      name: "change-encoding-comparison",
      relativePath: "src/version-management.ts",
      from: '  return compareVersions(version, AliceVersion.VERSION_3_7) < 0 ? "utf8" : "utf16";',
      to: '  return compareVersions(version, AliceVersion.VERSION_3_7) <= 0 ? "utf8" : "utf16";',
      testFile: "test/version-management.test.ts",
    });

    expect(output).toContain("version-management.test.ts");
  });

  it("detects when returning the wrong type breaks activity serialization tests", () => {
    const output = runMutationCase({
      name: "wrong-serialize-return-type",
      relativePath: "src/history.ts",
      from: "  return JSON.stringify(activity.toJSON());",
      to: "  return activity.toJSON() as unknown as string;",
      testFile: "test/history.test.ts",
    });

    expect(output).toContain("history.test.ts");
  });
});
