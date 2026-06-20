import * as fs from "fs";
import * as path from "path";

/** Strip path separators and traversal sequences from a user-supplied name. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
}

/** Matches percent-encoded dot (%2e), forward-slash (%2f), or backslash (%5c). */
const ENCODED_TRAVERSAL_RE = /%(2e|2f|5c)/i;

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function realpathNearestExisting(resolvedPath: string): string | null {
  let current = resolvedPath;
  const missingSegments: string[] = [];

  while (true) {
    try {
      const realExistingPath = fs.realpathSync.native(current);
      return missingSegments.length === 0
        ? realExistingPath
        : path.join(realExistingPath, ...missingSegments.reverse());
    } catch (error) {
      if (!isMissingPathError(error)) {
        return null;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        return null;
      }

      missingSegments.push(path.basename(current));
      current = parent;
    }
  }
}

function isWithinDirectory(candidatePath: string, allowedDir: string): boolean {
  const relativePath = path.relative(allowedDir, candidatePath);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
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

  const realProjectPath = realpathNearestExisting(resolvedPath);
  if (!realProjectPath || !realProjectPath.endsWith(".a3p")) {
    return { valid: false, error: "project path must be an .a3p file" };
  }

  const realAllowedDirs = allowedProjectDirs
    .map((dir) => realpathNearestExisting(path.resolve(dir)))
    .filter((dir): dir is string => dir !== null);
  const isWithinAllowedDir = realAllowedDirs.some((allowedDir) =>
    isWithinDirectory(realProjectPath, allowedDir),
  );

  if (!isWithinAllowedDir) {
    return {
      valid: false,
      error: "project path is outside allowed directories",
    };
  }

  return { valid: true, resolvedPath: realProjectPath };
}

export async function validateExistingProjectRealPath(
  projectPath: string,
  allowedProjectDirs: readonly string[],
): Promise<{ valid: true; resolvedPath: string } | { valid: false; error: string }> {
  let realProjectPath: string;
  try {
    realProjectPath = await fs.promises.realpath(projectPath);
  } catch (error) {
    if (isMissingPathError(error)) {
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

  if (!realAllowedDirs.some((allowedDir) => isWithinDirectory(realProjectPath, allowedDir))) {
    return { valid: false, error: "project path is outside allowed directories" };
  }

  return { valid: true, resolvedPath: realProjectPath };
}
