// test/webxr-capabilities.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  detectWebXRCapabilities,
  type WebXRCapabilityDetectionOptions,
  type WebXRCapabilityReport,
  type WebXREvidenceCode,
} from "../src/webxr-capabilities.js";

function evidenceCodes(report: WebXRCapabilityReport): WebXREvidenceCode[] {
  return report.evidence.map((item) => item.code);
}

function navigatorWithSessionSupport(supported: boolean): WebXRCapabilityDetectionOptions["navigator"] {
  return {
    xr: {
      isSessionSupported: vi.fn(async (mode: string) => mode === "immersive-vr" && supported),
    },
  };
}

describe("detectWebXRCapabilities", () => {
  it("reports secure-context and missing navigator.xr evidence instead of silently falling back", async () => {
    const report = await detectWebXRCapabilities({
      isSecureContext: false,
      navigator: {},
    });

    expect(report.status).toBe("unsupported");
    expect(report.immersiveVrSupported).toBe(false);
    expect(report.referenceSpaces).toEqual({
      preferred: "local-floor",
      available: [],
    });
    expect(report.input).toMatchObject({
      controllersSupported: false,
      handsSupported: false,
      gamepadsSupported: false,
    });
    expect(evidenceCodes(report)).toEqual(
      expect.arrayContaining(["secure-context-required", "webxr-unavailable"]),
    );
  });

  it("queries immersive-vr support and records unsupported evidence when the browser rejects it", async () => {
    const navigator = navigatorWithSessionSupport(false);

    const report = await detectWebXRCapabilities({
      isSecureContext: true,
      navigator,
    });

    expect(navigator.xr?.isSessionSupported).toHaveBeenCalledWith("immersive-vr");
    expect(report.status).toBe("unsupported");
    expect(report.immersiveVrSupported).toBe(false);
    expect(evidenceCodes(report)).toContain("immersive-vr-unsupported");
  });

  it("returns degraded evidence for optional gaps while preserving usable immersive VR support", async () => {
    const report = await detectWebXRCapabilities({
      isSecureContext: true,
      navigator: navigatorWithSessionSupport(true),
      referenceSpaces: ["local"],
      inputSupport: {
        controllersSupported: true,
        handsSupported: false,
        gamepadsSupported: true,
      },
    });

    expect(report.status).toBe("degraded");
    expect(report.immersiveVrSupported).toBe(true);
    expect(report.referenceSpaces).toEqual({
      preferred: "local-floor",
      active: "local",
      available: ["local"],
    });
    expect(report.input).toEqual({
      controllersSupported: true,
      handsSupported: false,
      gamepadsSupported: true,
    });
    expect(evidenceCodes(report)).toEqual(
      expect.arrayContaining(["reference-space-local-fallback", "hand-tracking-unsupported"]),
    );
  });

  it("returns supported when secure immersive VR, local-floor, controllers, and gamepads are available", async () => {
    const report = await detectWebXRCapabilities({
      isSecureContext: true,
      navigator: navigatorWithSessionSupport(true),
      referenceSpaces: ["local-floor", "local"],
      inputSupport: {
        controllersSupported: true,
        handsSupported: true,
        gamepadsSupported: true,
      },
    });

    expect(report).toMatchObject({
      status: "supported",
      immersiveVrSupported: true,
      referenceSpaces: {
        preferred: "local-floor",
        active: "local-floor",
        available: ["local-floor", "local"],
      },
      input: {
        controllersSupported: true,
        handsSupported: true,
        gamepadsSupported: true,
      },
      evidence: [],
    });
  });
});
