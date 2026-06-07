export interface ProjectModification {
  addCommentToMethod?: string;
  commentText?: string;
  addObject?: { name: string; className: string };
}

export interface WriteA3POptions {
  xmlEntryName?: string;
  baseXmlText?: string | null;
  manifest?: Record<string, unknown> | null;
  thumbnail?: Uint8Array | null;
  resources?: Map<string, Uint8Array>;
  preserveSourceEntries?: boolean;
}
