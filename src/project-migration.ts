export type ProjectVersionSource = "version.txt" | "manifest" | "xml" | "default";

export type ProjectResourceKind = "image" | "audio" | "model" | "other";
export type ProjectMigrationSupport =
  | "alice-3-reader-migration"
  | "alice-2-guidance-only"
  | "unknown-version";

export interface ProjectVersionInfo {
  originalAliceVersion: string | null;
  detectedAliceVersion: string;
  manifestVersion: string | null;
  xmlVersion: string | null;
  versionSource: ProjectVersionSource;
  migrated: boolean;
  migrationSteps: string[];
  migrationSupport?: ProjectMigrationSupport;
  unsupportedReason?: string | null;
}

const CURRENT_ALICE_VERSION = "3.10.0.0";
const RESOURCE_SUFFIX_PACKAGES = [
  "biped",
  "flyer",
  "marinemammal",
  "marine",
  "person",
  "prop",
  "quadruped",
  "swimmer",
  "transport",
  "vehicle",
] as const;
const ALICE_2_UNSUPPORTED_REASON =
  "Alice 2 projects require desktop Alice conversion before Alice web import; automatic Alice 2 conversion is not supported.";

interface MigrationRule {
  readonly toVersion: string;
  readonly description: string;
  readonly apply: (xml: string) => string;
}

const MIGRATION_RULES: readonly MigrationRule[] = [
  {
    toVersion: "3.1.20.0.0",
    description: "move dresser resources into the prop package",
    apply: (xml) => xml.replaceAll(
      "org.lgna.story.resources.dresser.",
      "org.lgna.story.resources.prop.",
    ),
  },
  {
    toVersion: "3.1.35.0.0",
    description: "rename legacy resource classes to *Resource forms",
    apply: (xml) => xml.replace(
      /org\.lgna\.story\.resources\.((?:biped|flyer|marinemammal|marine|person|prop|quadruped|swimmer|transport|vehicle))\.([A-Za-z][A-Za-z0-9_]*)/g,
      (match, pkg: string, typeName: string) => (
        RESOURCE_SUFFIX_PACKAGES.includes(pkg as (typeof RESOURCE_SUFFIX_PACKAGES)[number]) &&
        !typeName.endsWith("Resource")
          ? `org.lgna.story.resources.${pkg}.${typeName}Resource`
          : match
      ),
    ),
  },
  {
    toVersion: "3.4.0.0",
    description: "update mouse click event references",
    apply: (xml) => xml.replaceAll(
      '<method isVarArgs="false" name="getModelAtMouseLocation"><declaringClass name="org.lgna.story.event.MouseClickEvent"/><parameters/></method>',
      '<method isVarArgs="false" name="getModelAtMouseLocation"><declaringClass name="org.lgna.story.event.MouseClickOnObjectEvent"/><parameters/></method>',
    ),
  },
  {
    toVersion: "3.9.0.0",
    description: "widen getDistanceTo parameter type to SThing",
    apply: (xml) => xml.replaceAll(
      '<method isVarArgs="true" name="getDistanceTo"><declaringClass name="org.lgna.story.STurnable"/><parameters><type name="org.lgna.story.STurnable"/>',
      '<method isVarArgs="true" name="getDistanceTo"><declaringClass name="org.lgna.story.STurnable"/><parameters><type name="org.lgna.story.SThing"/>',
    ),
  },
];

export function getCurrentAliceVersion(): string {
  return CURRENT_ALICE_VERSION;
}

export function compareProjectVersions(left: string, right: string): number {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue < rightValue ? -1 : 1;
    }
  }
  return 0;
}

export function detectProjectVersion(
  versionText: string | null,
  manifest: Record<string, unknown> | null,
  xmlText: string,
): ProjectVersionInfo {
  const normalizedVersionText = normalizeCandidate(versionText);
  const xmlVersion = extractXmlVersion(xmlText);
  const explicitManifestVersion = extractExplicitManifestVersion(manifest);
  const genericManifestVersion = extractGenericManifestVersion(manifest);
  const supportedExplicitManifestVersion = isSupportedAliceVersion(explicitManifestVersion ?? "")
    ? explicitManifestVersion
    : null;
  const supportedGenericManifestVersion = isSupportedAliceVersion(genericManifestVersion ?? "")
    ? genericManifestVersion
    : null;
  const nestedManifestVersion = supportedExplicitManifestVersion
    ?? supportedGenericManifestVersion
    ?? findNestedAliceVersion(manifest);
  const manifestVersion = supportedExplicitManifestVersion
    ?? supportedGenericManifestVersion
    ?? nestedManifestVersion
    ?? explicitManifestVersion
    ?? genericManifestVersion;

  if (normalizedVersionText && isAliceProjectVersion(normalizedVersionText)) {
    return buildVersionInfo({
      originalAliceVersion: normalizedVersionText,
      detectedAliceVersion: normalizedVersionText,
      manifestVersion,
      xmlVersion,
      versionSource: "version.txt",
    });
  }

  if (normalizedVersionText && isAlice2ProjectVersion(normalizedVersionText)) {
    return buildVersionInfo({
      originalAliceVersion: normalizedVersionText,
      detectedAliceVersion: normalizedVersionText,
      manifestVersion,
      xmlVersion,
      versionSource: "version.txt",
      migrationSupport: "alice-2-guidance-only",
      unsupportedReason: ALICE_2_UNSUPPORTED_REASON,
    });
  }

  if (supportedExplicitManifestVersion && isAliceProjectVersion(supportedExplicitManifestVersion)) {
    return buildVersionInfo({
      originalAliceVersion: supportedExplicitManifestVersion,
      detectedAliceVersion: supportedExplicitManifestVersion,
      manifestVersion,
      xmlVersion,
      versionSource: "manifest",
    });
  }

  if (supportedExplicitManifestVersion && isAlice2ProjectVersion(supportedExplicitManifestVersion)) {
    return buildVersionInfo({
      originalAliceVersion: supportedExplicitManifestVersion,
      detectedAliceVersion: supportedExplicitManifestVersion,
      manifestVersion,
      xmlVersion,
      versionSource: "manifest",
      migrationSupport: "alice-2-guidance-only",
      unsupportedReason: ALICE_2_UNSUPPORTED_REASON,
    });
  }

  if (xmlVersion && isAliceProjectVersion(xmlVersion)) {
    return buildVersionInfo({
      originalAliceVersion: xmlVersion,
      detectedAliceVersion: xmlVersion,
      manifestVersion,
      xmlVersion,
      versionSource: "xml",
    });
  }

  if (xmlVersion && isAlice2ProjectVersion(xmlVersion)) {
    return buildVersionInfo({
      originalAliceVersion: xmlVersion,
      detectedAliceVersion: xmlVersion,
      manifestVersion,
      xmlVersion,
      versionSource: "xml",
      migrationSupport: "alice-2-guidance-only",
      unsupportedReason: ALICE_2_UNSUPPORTED_REASON,
    });
  }

  if (supportedGenericManifestVersion && isAliceProjectVersion(supportedGenericManifestVersion)) {
    return buildVersionInfo({
      originalAliceVersion: supportedGenericManifestVersion,
      detectedAliceVersion: supportedGenericManifestVersion,
      manifestVersion,
      xmlVersion,
      versionSource: "manifest",
    });
  }

  if (supportedGenericManifestVersion && isAlice2ProjectVersion(supportedGenericManifestVersion)) {
    return buildVersionInfo({
      originalAliceVersion: supportedGenericManifestVersion,
      detectedAliceVersion: supportedGenericManifestVersion,
      manifestVersion,
      xmlVersion,
      versionSource: "manifest",
      migrationSupport: "alice-2-guidance-only",
      unsupportedReason: ALICE_2_UNSUPPORTED_REASON,
    });
  }

  if (nestedManifestVersion && isAliceProjectVersion(nestedManifestVersion)) {
    return buildVersionInfo({
      originalAliceVersion: nestedManifestVersion,
      detectedAliceVersion: nestedManifestVersion,
      manifestVersion,
      xmlVersion,
      versionSource: "manifest",
    });
  }

  if (nestedManifestVersion && isAlice2ProjectVersion(nestedManifestVersion)) {
    return buildVersionInfo({
      originalAliceVersion: nestedManifestVersion,
      detectedAliceVersion: nestedManifestVersion,
      manifestVersion,
      xmlVersion,
      versionSource: "manifest",
      migrationSupport: "alice-2-guidance-only",
      unsupportedReason: ALICE_2_UNSUPPORTED_REASON,
    });
  }

  return buildVersionInfo({
    originalAliceVersion: normalizedVersionText ?? manifestVersion ?? xmlVersion,
    detectedAliceVersion: CURRENT_ALICE_VERSION,
    manifestVersion,
    xmlVersion,
    versionSource: "default",
    migrationSupport: "unknown-version",
  });
}

export function migrateProjectXml(
  xmlText: string,
  versionInfo: ProjectVersionInfo,
): { xmlText: string; versionInfo: ProjectVersionInfo } {
  if (
    versionInfo.migrationSupport === "alice-2-guidance-only" ||
    isAlice2ProjectVersion(versionInfo.originalAliceVersion ?? "") ||
    isAlice2ProjectVersion(versionInfo.detectedAliceVersion)
  ) {
    return {
      xmlText,
      versionInfo: {
        ...versionInfo,
        migrationSupport: "alice-2-guidance-only",
        migrated: false,
        migrationSteps: [
          ...versionInfo.migrationSteps,
          ALICE_2_UNSUPPORTED_REASON,
        ],
        unsupportedReason: versionInfo.unsupportedReason ?? ALICE_2_UNSUPPORTED_REASON,
      },
    };
  }

  let migratedXml = xmlText;
  let workingVersion = versionInfo.originalAliceVersion ?? versionInfo.detectedAliceVersion;
  const migrationSteps = [...versionInfo.migrationSteps];
  let migrated = false;

  if (isAliceProjectVersion(workingVersion)) {
    for (const rule of MIGRATION_RULES) {
      if (compareProjectVersions(workingVersion, rule.toVersion) >= 0) {
        continue;
      }
      const nextXml = rule.apply(migratedXml);
      if (nextXml !== migratedXml) {
        migrated = true;
        migrationSteps.push(`${rule.toVersion}: ${rule.description}`);
        migratedXml = nextXml;
      }
      workingVersion = rule.toVersion;
    }
  }

  if (compareProjectVersions(workingVersion, CURRENT_ALICE_VERSION) < 0) {
    migrated = migrated || isAliceProjectVersion(versionInfo.detectedAliceVersion);
    migrationSteps.push(`${CURRENT_ALICE_VERSION}: align archive version with current reader`);
    workingVersion = CURRENT_ALICE_VERSION;
  }

  return {
    xmlText: migratedXml,
    versionInfo: {
      ...versionInfo,
      detectedAliceVersion: workingVersion,
      migrated,
      migrationSteps,
    },
  };
}

export function synchronizeManifestVersion(
  manifest: Record<string, unknown> | null,
  versionInfo: ProjectVersionInfo,
): Record<string, unknown> | null {
  if (!manifest) {
    return null;
  }

  const nextManifest = structuredClone(manifest);
  const targetVersion = versionInfo.detectedAliceVersion;

  if (typeof nextManifest.aliceVersion === "string") {
    nextManifest.aliceVersion = targetVersion;
    return nextManifest;
  }

  if (typeof nextManifest.projectVersion === "string") {
    nextManifest.projectVersion = targetVersion;
    return nextManifest;
  }

  if (typeof nextManifest.version === "string" && isAliceProjectVersion(nextManifest.version)) {
    nextManifest.version = targetVersion;
    return nextManifest;
  }

  const createdWith = nextManifest.createdWith;
  if (isRecord(createdWith) && typeof createdWith.version === "string" && isAliceProjectVersion(createdWith.version)) {
    createdWith.version = targetVersion;
    nextManifest.createdWith = createdWith;
  }

  return nextManifest;
}

export function classifyProjectResource(path: string): ProjectResourceKind {
  const extension = path.includes(".")
    ? path.slice(path.lastIndexOf(".") + 1).toLowerCase()
    : "";

  if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(extension)) {
    return "image";
  }
  if (["wav", "mp3", "ogg", "aiff", "aif", "au", "m4a"].includes(extension)) {
    return "audio";
  }
  if (["a3r", "a3t", "dae", "fbx", "glb", "gltf", "obj", "ply", "stl"].includes(extension)) {
    return "model";
  }
  return "other";
}

function parseVersionParts(version: string): number[] {
  return version
    .trim()
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isFinite(value));
}

function normalizeCandidate(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractXmlVersion(xmlText: string): string | null {
  const match = xmlText.match(/<node[^>]*\sversion="([^"]+)"/);
  return normalizeCandidate(match?.[1]);
}

function extractExplicitManifestVersion(manifest: Record<string, unknown> | null): string | null {
  if (!manifest) {
    return null;
  }

  const directCandidates = [
    manifest.aliceVersion,
    manifest.projectVersion,
    isRecord(manifest.createdWith) ? manifest.createdWith.version : undefined,
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeCandidate(typeof candidate === "string" ? candidate : null);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractGenericManifestVersion(manifest: Record<string, unknown> | null): string | null {
  return normalizeCandidate(typeof manifest?.version === "string" ? manifest.version : null);
}

function findNestedAliceVersion(value: unknown, depth = 0): string | null {
  if (depth > 4) {
    return null;
  }
  if (typeof value === "string") {
    return isSupportedAliceVersion(value) ? value.trim() : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = findNestedAliceVersion(entry, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  for (const nestedValue of Object.values(value)) {
    const nested = findNestedAliceVersion(nestedValue, depth + 1);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function isAliceProjectVersion(value: string): boolean {
  return /^3(?:\.\d+){2,4}$/.test(value.trim());
}

function isAlice2ProjectVersion(value: string): boolean {
  return /^2(?:\.\d+){1,4}$/.test(value.trim());
}

function isSupportedAliceVersion(value: string): boolean {
  return isAliceProjectVersion(value) || isAlice2ProjectVersion(value);
}

function buildVersionInfo(options: Omit<ProjectVersionInfo, "migrated" | "migrationSteps"> & {
  migrated?: boolean;
  migrationSteps?: string[];
}): ProjectVersionInfo {
  return {
    migrated: false,
    migrationSteps: [],
    migrationSupport: "alice-3-reader-migration",
    unsupportedReason: null,
    ...options,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
