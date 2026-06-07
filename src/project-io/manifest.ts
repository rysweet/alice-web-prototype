import { ProjectIoError } from "./types.js";

export function parseManifestText(manifestText: string | null): Record<string, unknown> | null {
  if (manifestText === null) {
    return null;
  }

  try {
    return JSON.parse(manifestText) as Record<string, unknown>;
  } catch (error) {
    throw new ProjectIoError(
      "invalid-manifest",
      "manifest.json is not valid JSON.",
      error,
    );
  }
}

export function serializeManifest(manifest: Record<string, unknown>): string {
  return JSON.stringify(manifest, null, 2);
}
