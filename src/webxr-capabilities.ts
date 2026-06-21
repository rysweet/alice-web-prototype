export type WebXREvidenceSeverity = "unsupported" | "degraded" | "failed";

export type WebXREvidenceCode =
  | "secure-context-required"
  | "webxr-unavailable"
  | "immersive-vr-unsupported"
  | "session-request-failed"
  | "reference-space-unavailable"
  | "reference-space-local-fallback"
  | "input-sources-unavailable"
  | "controller-missing-target-ray"
  | "controller-missing-grip"
  | "controller-missing-gamepad"
  | "hand-tracking-unsupported"
  | "hand-pose-unavailable"
  | "invalid-movement-target"
  | "non-finite-pose"
  | "locomotion-disabled";

export interface WebXREvidence {
  readonly code: WebXREvidenceCode;
  readonly severity: WebXREvidenceSeverity;
  readonly message: string;
  readonly detail?: string;
}

export type WebXRCapabilityStatus = "supported" | "degraded" | "unsupported";

export interface WebXRReferenceSpaceCapability {
  readonly preferred: "local-floor";
  readonly active?: string;
  readonly available: readonly string[];
}

export interface WebXRInputCapability {
  readonly controllersSupported: boolean;
  readonly handsSupported: boolean;
  readonly gamepadsSupported: boolean;
}

export interface WebXRCapabilityReport {
  readonly status: WebXRCapabilityStatus;
  readonly immersiveVrSupported: boolean;
  readonly referenceSpaces: WebXRReferenceSpaceCapability;
  readonly input: WebXRInputCapability;
  readonly evidence: readonly WebXREvidence[];
}

export interface WebXRNavigatorLike {
  readonly xr?: {
    readonly isSessionSupported?: (mode: "immersive-vr") => Promise<boolean> | boolean;
  };
}

export interface WebXRCapabilityDetectionOptions {
  readonly isSecureContext: boolean;
  readonly navigator: WebXRNavigatorLike;
  readonly referenceSpaces?: readonly string[];
  readonly inputSupport?: Partial<WebXRInputCapability>;
}

export function createWebXREvidence(
  code: WebXREvidenceCode,
  severity: WebXREvidenceSeverity,
  message: string,
  detail?: string,
): WebXREvidence {
  return detail === undefined ? { code, severity, message } : { code, severity, message, detail };
}

function globalNavigator(): WebXRNavigatorLike | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as WebXRNavigatorLike);
}

function globalSecureContext(): boolean {
  return typeof isSecureContext === "boolean" ? isSecureContext : false;
}

function resolveReferenceSpaces(
  immersiveVrSupported: boolean,
  suppliedReferenceSpaces: readonly string[] | undefined,
  evidence: WebXREvidence[],
): WebXRReferenceSpaceCapability {
  const available = suppliedReferenceSpaces
    ? [...new Set(suppliedReferenceSpaces)]
    : immersiveVrSupported
      ? ["local-floor", "local"]
      : [];
  const active = available.includes("local-floor")
    ? "local-floor"
    : available.includes("local")
      ? "local"
      : undefined;

  if (immersiveVrSupported && suppliedReferenceSpaces && !active) {
    evidence.push(createWebXREvidence(
      "reference-space-unavailable",
      "unsupported",
      "Neither local-floor nor local reference space is reported as available.",
    ));
  }
  if (immersiveVrSupported && active === "local" && !available.includes("local-floor")) {
    evidence.push(createWebXREvidence(
      "reference-space-local-fallback",
      "degraded",
      "local-floor is unavailable; Alice is using local reference space.",
    ));
  }

  return active === undefined
    ? { preferred: "local-floor", available }
    : { preferred: "local-floor", active, available };
}

function resolveInputSupport(
  immersiveVrSupported: boolean,
  suppliedInputSupport: Partial<WebXRInputCapability> | undefined,
  evidence: WebXREvidence[],
): WebXRInputCapability {
  const input = immersiveVrSupported
    ? {
        controllersSupported: suppliedInputSupport?.controllersSupported ?? true,
        handsSupported: suppliedInputSupport?.handsSupported ?? false,
        gamepadsSupported: suppliedInputSupport?.gamepadsSupported ?? true,
      }
    : {
        controllersSupported: false,
        handsSupported: false,
        gamepadsSupported: false,
      };

  if (immersiveVrSupported && !input.controllersSupported) {
    evidence.push(createWebXREvidence(
      "input-sources-unavailable",
      "degraded",
      "No usable XR input sources are reported for this browser or device.",
    ));
  }
  if (immersiveVrSupported && !input.handsSupported) {
    evidence.push(createWebXREvidence(
      "hand-tracking-unsupported",
      "degraded",
      "Hand tracking is not available for the current browser or device.",
    ));
  }
  if (immersiveVrSupported && !input.gamepadsSupported) {
    evidence.push(createWebXREvidence(
      "controller-missing-gamepad",
      "degraded",
      "Controller gamepad axes or buttons are unavailable.",
    ));
  }

  return input;
}

export async function detectWebXRCapabilities(
  options: Partial<WebXRCapabilityDetectionOptions> = {},
): Promise<WebXRCapabilityReport> {
  const evidence: WebXREvidence[] = [];
  const navigatorLike = options.navigator ?? globalNavigator();
  const secure = options.isSecureContext ?? globalSecureContext();

  if (!secure) {
    evidence.push(createWebXREvidence(
      "secure-context-required",
      "unsupported",
      "WebXR requires a secure browser context such as HTTPS or localhost.",
    ));
  }

  if (!navigatorLike?.xr) {
    evidence.push(createWebXREvidence(
      "webxr-unavailable",
      "unsupported",
      "This browser does not expose navigator.xr.",
    ));
    return {
      status: "unsupported",
      immersiveVrSupported: false,
      referenceSpaces: { preferred: "local-floor", available: [] },
      input: resolveInputSupport(false, options.inputSupport, evidence),
      evidence,
    };
  }

  let immersiveVrSupported = false;
  try {
    immersiveVrSupported = Boolean(await navigatorLike.xr.isSessionSupported?.("immersive-vr"));
  } catch (error) {
    immersiveVrSupported = false;
    evidence.push(createWebXREvidence(
      "immersive-vr-unsupported",
      "unsupported",
      "The browser could not confirm immersive VR session support.",
      error instanceof Error ? error.message : String(error),
    ));
  }

  if (!immersiveVrSupported && !evidence.some((item) => item.code === "immersive-vr-unsupported")) {
    evidence.push(createWebXREvidence(
      "immersive-vr-unsupported",
      "unsupported",
      "The browser reports that immersive-vr sessions are unsupported.",
    ));
  }

  const referenceSpaces = resolveReferenceSpaces(immersiveVrSupported, options.referenceSpaces, evidence);
  const input = resolveInputSupport(immersiveVrSupported, options.inputSupport, evidence);
  const hasUnsupportedEvidence = evidence.some((item) => item.severity === "unsupported");

  return {
    status: hasUnsupportedEvidence ? "unsupported" : evidence.length > 0 ? "degraded" : "supported",
    immersiveVrSupported,
    referenceSpaces,
    input,
    evidence,
  };
}
