import { ProjectIoError } from "./types.js";

const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;

export function validateArchivePath(path: string): string {
  if (
    path.length === 0 ||
    path === "." ||
    path.startsWith("/") ||
    path.startsWith("./") ||
    path.includes("\\") ||
    WINDOWS_DRIVE_PREFIX.test(path)
  ) {
    throwUnsafePath(path);
  }

  const pathToCheck = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = pathToCheck.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throwUnsafePath(path);
  }

  return path;
}

export function assertSafeWritablePath(path: string): string {
  const safePath = validateArchivePath(path);
  if (safePath.endsWith("/")) {
    throwUnsafePath(path);
  }
  return safePath;
}

function throwUnsafePath(path: string): never {
  throw new ProjectIoError("unsafe-path", `Unsafe archive path rejected: "${path}"`);
}
