import {
  detectProjectVersion,
  migrateProjectXml,
  type ProjectVersionInfo,
} from "../project-migration.js";

export interface ProjectIoMigrationResult {
  xmlText: string;
  versionInfo: ProjectVersionInfo;
}

export function migrateProjectArchiveXml(
  xmlText: string,
  versionText: string | null,
  manifest: Record<string, unknown> | null,
): ProjectIoMigrationResult {
  return migrateProjectXml(
    xmlText,
    detectProjectVersion(versionText, manifest, xmlText),
  );
}
