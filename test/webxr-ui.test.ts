// test/webxr-ui.test.ts
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderWebXRStatus } from "../src/webxr-ui.js";

describe("renderWebXRStatus", () => {
  it("renders unsupported status, disabled VR button, locomotion mode, and evidence with stable data attributes", () => {
    const dom = new JSDOM("<!doctype html><main id=\"root\"></main>");
    const root = dom.window.document.getElementById("root");
    if (!root) {
      throw new Error("missing root");
    }

    renderWebXRStatus(root, {
      status: "unsupported",
      buttonState: "disabled",
      message: "VR is unavailable in this browser.",
      locomotionMode: "combined",
      evidence: [
        {
          code: "webxr-unavailable",
          severity: "unsupported",
          message: "This browser does not expose navigator.xr.",
        },
      ],
    });

    const button = root.querySelector<HTMLButtonElement>("[data-alice-webxr-vr-button]");
    const status = root.querySelector<HTMLElement>("[data-alice-webxr-status]");
    const evidence = root.querySelector<HTMLElement>("[data-alice-webxr-evidence]");
    const evidenceItem = root.querySelector<HTMLElement>("[data-alice-webxr-evidence-code=\"webxr-unavailable\"]");
    const locomotion = root.querySelector<HTMLElement>("[data-alice-webxr-locomotion-mode]");

    expect(button?.dataset.aliceWebxrVrButton).toBe("disabled");
    expect(button?.disabled).toBe(true);
    expect(status?.dataset.aliceWebxrStatus).toBe("unsupported");
    expect(status?.textContent).toContain("VR is unavailable in this browser.");
    expect(evidence).not.toBeNull();
    expect(evidenceItem?.textContent).toBe("This browser does not expose navigator.xr.");
    expect(locomotion?.dataset.aliceWebxrLocomotionMode).toBe("combined");
  });

  it("uses textContent for evidence messages instead of injecting HTML", () => {
    const dom = new JSDOM("<!doctype html><main id=\"root\"></main>");
    const root = dom.window.document.getElementById("root");
    if (!root) {
      throw new Error("missing root");
    }
    const hostileEvidence = "<img src=x onerror=alert(1)>WebXR unavailable";

    renderWebXRStatus(root, {
      status: "failed",
      buttonState: "enter",
      message: "VR startup failed.",
      evidence: [
        {
          code: "session-request-failed",
          severity: "failed",
          message: hostileEvidence,
        },
      ],
    });

    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain(hostileEvidence);
    expect(root.innerHTML).not.toContain("<img src=\"x\"");
  });

  it("renders invalid movement target evidence separately for click/move feedback", () => {
    const dom = new JSDOM("<!doctype html><main id=\"root\"></main>");
    const root = dom.window.document.getElementById("root");
    if (!root) {
      throw new Error("missing root");
    }

    renderWebXRStatus(root, {
      status: "active",
      buttonState: "exit",
      locomotionMode: "click-move",
      invalidTargetMessage: "Tree is not a valid movement target.",
      evidence: [
        {
          code: "invalid-movement-target",
          severity: "degraded",
          message: "Select hit tree instead of a movement surface.",
        },
      ],
    });

    const invalidTarget = root.querySelector<HTMLElement>("[data-alice-webxr-invalid-target]");
    expect(root.querySelector<HTMLButtonElement>("[data-alice-webxr-vr-button]")?.dataset.aliceWebxrVrButton).toBe("exit");
    expect(root.querySelector<HTMLElement>("[data-alice-webxr-status]")?.dataset.aliceWebxrStatus).toBe("active");
    expect(invalidTarget?.textContent).toBe("Tree is not a valid movement target.");
  });

  it("renders camera comfort fallback evidence without claiming true VR support", () => {
    const dom = new JSDOM("<!doctype html><main id=\"root\"></main>");
    const root = dom.window.document.getElementById("root");
    if (!root) {
      throw new Error("missing root");
    }

    renderWebXRStatus(root, {
      status: "unsupported",
      buttonState: "disabled",
      message: "Browser camera workflow available.",
      evidence: [
        {
          code: "desktop-camera-fallback",
          severity: "degraded",
          message: "Desktop camera fallback is available.",
        },
      ],
      cameraComfort: {
        schema_version: "alice.camera-vr-comfort-evidence/v1",
        status: "partial",
        browserWebXrStatus: "unsupported",
        desktopCameraAvailable: true,
        keyboardMovementAvailable: true,
        reducedMotionRespected: true,
        trueHeadsetVrSupported: false,
        nativeVrSupported: false,
        cameraMode: "orbit",
        evidenceCodes: ["desktop-camera-fallback", "true-vr-unsupported"],
        comfortChecks: {
          discreteMovementStep: true,
          stableHorizon: true,
          noForcedHeadset: true,
        },
        unsupportedReason: "Alice web records browser WebXR and desktop camera comfort evidence only; true headset/native VR remains unsupported.",
      },
    });

    expect(root.querySelector("[data-testid=\"alice-camera-vr-comfort-panel\"]")).not.toBeNull();
    expect(root.querySelector("[data-testid=\"alice-camera-keyboard-movement\"]")?.textContent)
      .toContain("Keyboard camera movement available");
    expect(root.querySelector("[data-testid=\"alice-camera-reduced-motion\"]")?.textContent)
      .toContain("Reduced-motion comfort check respected");
    expect(root.querySelector("[data-testid=\"alice-true-vr-unsupported\"]")?.textContent)
      .toContain("true headset/native VR remains unsupported");
  });
});
