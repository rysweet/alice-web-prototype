import * as fs from "fs";
import * as path from "path";

/** Strip path separators and traversal sequences from a user-supplied name. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
}

/** Matches percent-encoded dot (%2e), forward-slash (%2f), or backslash (%5c). */
const ENCODED_TRAVERSAL_RE = /%(2e|2f|5c)/i;

const resolvedDirCache = new WeakMap<readonly string[], string[]>();

function getResolvedDirs(allowedProjectDirs: readonly string[]): string[] {
  let resolved = resolvedDirCache.get(allowedProjectDirs);
  if (!resolved) {
    resolved = allowedProjectDirs.map((dir) => path.resolve(dir));
    resolvedDirCache.set(allowedProjectDirs, resolved);
  }
  return resolved;
}

function isPathWithinAllowedDirs(projectPath: string, allowedDirs: readonly string[]): boolean {
  return allowedDirs.some(
    (allowedDir) =>
      projectPath === allowedDir ||
      projectPath.startsWith(`${allowedDir}${path.sep}`),
  );
}

async function resolveExistingAllowedDirs(allowedProjectDirs: readonly string[]): Promise<string[]> {
  return Promise.all(allowedProjectDirs.map((dir) => fs.promises.realpath(dir)));
}

/**
 * Validate that a project path is safe to open.
 *
 * Rejects null bytes, percent-encoded traversal characters, non-`.a3p`
 * extensions, and paths that resolve outside `allowedProjectDirs`.
 */
export function validateProjectPath(
  projectPath: string,
  allowedProjectDirs: readonly string[],
): { valid: true; resolvedPath: string } | { valid: false; error: string } {
  if (projectPath.includes("\0")) {
    return { valid: false, error: "project path contains a null byte" };
  }

  if (ENCODED_TRAVERSAL_RE.test(projectPath)) {
    return {
      valid: false,
      error: "project path contains encoded traversal characters",
    };
  }

  const resolvedPath = path.resolve(projectPath);

  if (!resolvedPath.endsWith(".a3p")) {
    return { valid: false, error: "project path must be an .a3p file" };
  }

  const resolvedAllowedDirs = getResolvedDirs(allowedProjectDirs);
  const isWithinAllowedDir = isPathWithinAllowedDirs(resolvedPath, resolvedAllowedDirs);

  if (!isWithinAllowedDir) {
    return {
      valid: false,
      error: "project path is outside allowed directories",
    };
  }

  return { valid: true, resolvedPath };
}

export async function validateExistingProjectRealPath(
  projectPath: string,
  allowedProjectDirs: readonly string[],
): Promise<{ valid: true; resolvedPath: string } | { valid: false; error: string }> {
  let realProjectPath: string;
  try {
    realProjectPath = await fs.promises.realpath(projectPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { valid: false, error: `project file not found: ${projectPath}` };
    }
    return { valid: false, error: `project file could not be read: ${projectPath}` };
  }

  if (!realProjectPath.endsWith(".a3p")) {
    return { valid: false, error: "project path must be an .a3p file" };
  }

  let realAllowedDirs: string[];
  try {
    realAllowedDirs = await resolveExistingAllowedDirs(allowedProjectDirs);
  } catch {
    return { valid: false, error: "allowed project directory could not be resolved" };
  }

  if (!isPathWithinAllowedDirs(realProjectPath, realAllowedDirs)) {
    return { valid: false, error: "project path is outside allowed directories" };
  }

  return { valid: true, resolvedPath: realProjectPath };
}
