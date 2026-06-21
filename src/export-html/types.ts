export interface HtmlExportViewport {
  width: number;
  height: number;
}

export interface HtmlExportOptions {
  title?: string;
  previewMode?: boolean;
  tweedleSource?: string;
  viewport?: Partial<HtmlExportViewport>;
  packageName?: string;
  runtimeIdentity?: string;
  metadata?: HtmlExportMetadata;
}

export interface HtmlExportMetadata {
  description?: string;
  canonicalUrl?: string;
  preview?: string;
}

export interface HtmlExportDocument {
  schemaVersion: "alice-web.player-document/v1";
  title: string;
  previewMode: boolean;
  tweedleSource: string;
  packageName: string;
  runtimeIdentity: string;
  entrypoint: "index.html";
  metadata: HtmlExportMetadata;
  html: string;
}

export const DEFAULT_STANDALONE_VIEWPORT: HtmlExportViewport = { width: 1280, height: 720 };
export const DEFAULT_PREVIEW_VIEWPORT: HtmlExportViewport = { width: 960, height: 540 };
