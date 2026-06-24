import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { exportWebPackage, generateShareArtifacts, validateWebPackage } from "../src/project-export.js";
import { createMinimalProject } from "./test-utils.js";

describe("project export native Web Share evidence", () => {
  it("records navigator.share delivery only after the native Web Share call succeeds", async () => {
    const project = createMinimalProject();
    project.projectName = "Native share proof";
    const exported = await exportWebPackage(project, {
      title: "Native share proof",
      description: "Camera/export/share parity evidence.",
      canonicalUrl: "https://example.edu/alice/native-share-proof",
    });
    const canShare = vi.fn(() => true);
    const share = vi.fn(async () => {});
    const packageBytes = Buffer.from(exported.package.base64, "base64");
    const file = new File([packageBytes], exported.package.filename, {
      type: exported.package.mimeType,
    });

    const result = await generateShareArtifacts({
      packageBase64: exported.package.base64,
      title: "Native share proof",
      description: "Camera/export/share parity evidence.",
      canonicalUrl: "https://example.edu/alice/native-share-proof",
      nativeShare: {
        navigator: { canShare, share },
        files: [file],
      },
    });

    expect(canShare).toHaveBeenCalledWith(expect.objectContaining({
      title: "Native share proof",
      text: "Camera/export/share parity evidence.",
      url: "https://example.edu/alice/native-share-proof",
      files: [file],
    }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(result.share.delivery).toEqual({
      mode: "native-web-share",
      nativeWebShare: true,
      requiresUserDownload: false,
      evidence: {
        api: "navigator.share",
        status: "shared",
        packageFilename: exported.package.filename,
        packageSizeBytes: exported.package.sizeBytes,
        packageSha256: exported.package.sha256,
        filesShared: true,
        canShareChecked: true,
      },
    });
    expect(result.validation.valid).toBe(true);
    expect(result.validation.errors).toEqual([]);
  });

  it("keeps the browser-download fallback when native Web Share cannot accept the package", async () => {
    const project = createMinimalProject();
    const exported = await exportWebPackage(project, { title: "Fallback proof" });
    const share = vi.fn(async () => {});

    const result = await generateShareArtifacts({
      packageBase64: exported.package.base64,
      title: "Fallback proof",
      nativeShare: {
        navigator: {
          canShare: () => false,
          share,
        },
      },
    });

    expect(share).not.toHaveBeenCalled();
    expect(result.share.delivery).toMatchObject({
      mode: "browser-download-fallback",
      nativeWebShare: false,
      requiresUserDownload: true,
    });
  });

  it("keeps browser-download fallback when native Web Share data omits the package file", async () => {
    const project = createMinimalProject();
    const exported = await exportWebPackage(project, { title: "No file share proof" });
    const share = vi.fn(async () => {});

    const result = await generateShareArtifacts({
      packageBase64: exported.package.base64,
      title: "No file share proof",
      nativeShare: {
        navigator: { share },
        data: {
          title: "No file share proof",
          text: "metadata-only share is not enough",
        },
      },
    });

    expect(share).not.toHaveBeenCalled();
    expect(result.share.delivery).toMatchObject({
      mode: "browser-download-fallback",
      nativeWebShare: false,
      requiresUserDownload: true,
    });
  });

  it("keeps browser-download fallback when native Web Share rejects the package file", async () => {
    const project = createMinimalProject();
    const exported = await exportWebPackage(project, { title: "Rejected native share proof" });
    const packageBytes = Buffer.from(exported.package.base64, "base64");
    const file = new File([packageBytes], exported.package.filename, {
      type: exported.package.mimeType,
    });
    const share = vi.fn(async () => {
      throw new Error("files unsupported");
    });

    const result = await generateShareArtifacts({
      packageBase64: exported.package.base64,
      title: "Rejected native share proof",
      nativeShare: {
        navigator: { share },
        files: [file],
      },
    });

    expect(share).toHaveBeenCalledTimes(1);
    expect(result.share.delivery).toMatchObject({
      mode: "browser-download-fallback",
      nativeWebShare: false,
      requiresUserDownload: true,
    });
  });

  it("rejects native Web Share evidence for a different package filename", async () => {
    const project = createMinimalProject();
    const exported = await exportWebPackage(project, { title: "Forged native share proof" });
    const zip = await JSZip.loadAsync(Buffer.from(exported.package.base64, "base64"));
    const shareEntry = zip.file("share.json");
    if (!shareEntry) throw new Error("share.json missing from exported package");
    const share = JSON.parse(await shareEntry.async("string")) as Record<string, unknown>;
    share.delivery = {
      mode: "native-web-share",
      nativeWebShare: true,
      requiresUserDownload: false,
      evidence: {
        api: "navigator.share",
        status: "shared",
        packageFilename: "different-package.alice-web.zip",
        filesShared: true,
        canShareChecked: true,
      },
    };
    zip.file("share.json", JSON.stringify(share, null, 2));
    const forgedPackageBase64 = Buffer.from(await zip.generateAsync({ type: "uint8array" })).toString("base64");

    const validation = await validateWebPackage({ packageBase64: forgedPackageBase64 });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-share-delivery" }),
    ]));
  });

  it("rejects embedded native Web Share delivery for the same package filename", async () => {
    const project = createMinimalProject();
    const exported = await exportWebPackage(project, { title: "Forged same-name share proof" });
    const validation = await validateNativeDelivery(exported.package.base64, {
      mode: "native-web-share",
      nativeWebShare: true,
      requiresUserDownload: false,
      evidence: {
        api: "navigator.share",
        status: "shared",
        packageFilename: exported.package.filename,
        packageSizeBytes: exported.package.sizeBytes,
        packageSha256: exported.package.sha256,
        filesShared: true,
        canShareChecked: true,
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-share-delivery" }),
    ]));
  });

  it("rejects browser-download delivery carrying native Web Share evidence", async () => {
    const project = createMinimalProject();
    const exported = await exportWebPackage(project, { title: "Fallback with forged native evidence" });
    const validation = await validateNativeDelivery(exported.package.base64, {
      mode: "browser-download-fallback",
      nativeWebShare: false,
      requiresUserDownload: true,
      evidence: {
        api: "navigator.share",
        status: "shared",
        packageFilename: exported.package.filename,
        packageSizeBytes: exported.package.sizeBytes,
        packageSha256: exported.package.sha256,
        filesShared: true,
        canShareChecked: true,
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-share-delivery" }),
    ]));
  });
});

async function validateNativeDelivery(packageBase64: string, delivery: unknown) {
  const zip = await JSZip.loadAsync(Buffer.from(packageBase64, "base64"));
  const shareEntry = zip.file("share.json");
  if (!shareEntry) throw new Error("share.json missing from exported package");
  const share = JSON.parse(await shareEntry.async("string")) as Record<string, unknown>;
  share.delivery = delivery;
  zip.file("share.json", JSON.stringify(share, null, 2));
  return validateWebPackage({
    packageBase64: Buffer.from(await zip.generateAsync({ type: "uint8array" })).toString("base64"),
  });
}
