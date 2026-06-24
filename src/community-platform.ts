import type { ShareArtifacts } from "./project-export";

export const COMMUNITY_SHARE_SCHEMA_VERSION = "alice-web.community-share/v1" as const;

export interface CommunityShareRecord {
  readonly schema_version: typeof COMMUNITY_SHARE_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly storage: "server-memory";
  readonly platform: "alice-web-local-community";
  readonly package: ShareArtifacts["share"]["package"];
  readonly teacher?: ShareArtifacts["share"]["teacher"];
  readonly links: ShareArtifacts["share"]["links"];
  readonly evidence: readonly string[];
}

export class CommunityPlatformStore {
  private records = new Map<string, CommunityShareRecord>();

  publish(shareArtifacts: ShareArtifacts): CommunityShareRecord {
    const publishedAt = new Date().toISOString();
    const id = communityShareId(shareArtifacts.share.title, shareArtifacts.share.package.sha256);
    const record: CommunityShareRecord = {
      schema_version: COMMUNITY_SHARE_SCHEMA_VERSION,
      id,
      title: shareArtifacts.share.title,
      publishedAt,
      storage: "server-memory",
      platform: "alice-web-local-community",
      package: shareArtifacts.share.package,
      ...(shareArtifacts.share.teacher ? { teacher: shareArtifacts.share.teacher } : {}),
      links: shareArtifacts.share.links,
      evidence: [
        "web-package-validated",
        "community-platform-recorded",
        ...(shareArtifacts.share.teacher ? ["teacher-share-metadata"] : []),
      ],
    };
    this.records.set(id, record);
    return record;
  }

  list(): readonly CommunityShareRecord[] {
    return Array.from(this.records.values()).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }

  get(id: string): CommunityShareRecord | null {
    return this.records.get(id) ?? null;
  }
}

function communityShareId(title: string, sha256: string): string {
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "alice-share";
  return `${stem}-${sha256.slice(0, 12)}`;
}
