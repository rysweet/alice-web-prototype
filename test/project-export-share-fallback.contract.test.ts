import { describe, expect, it } from "vitest";
import { exportWebPackage, generateShareArtifacts } from "../src/project-export.js";
import { createMinimalProject } from "./test-utils.js";

describe("project export share fallback evidence", () => {
  it("labels generated share artifacts as browser-download fallback instead of native Web Share success", async () => {
    const project = createMinimalProject();
    project.projectName = "Share fallback proof";
    const exported = await exportWebPackage(project, {
      title: "Share fallback proof",
      description: "Camera/export/share parity evidence.",
    });

    const share = await generateShareArtifacts({
      packageBase64: exported.package.base64,
      title: "Share fallback proof",
      description: "Camera/export/share parity evidence.",
    });

    expect(share.share).toMatchObject({
      delivery: {
        mode: "browser-download-fallback",
        nativeWebShare: false,
        requiresUserDownload: true,
      },
    });
    expect(JSON.stringify(share)).not.toMatch(/native web share succeeded|nativeWebShare"\s*:\s*true/i);
  });
});
