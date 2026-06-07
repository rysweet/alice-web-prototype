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
  const isWithinAllowedDir = resolvedAllowedDirs.some(
    (allowedDir) =>
      resolvedPath === allowedDir ||
      resolvedPath.startsWith(`${allowedDir}${path.sep}`),
  );

  if (!isWithinAllowedDir) {
    return {
      valid: false,
      error: "project path is outside allowed directories",
    };
  }

  return { valid: true, resolvedPath };
}
