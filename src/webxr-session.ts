import { createWebXRInputTracker, normalizeWebXRInput, type WebXRInputState, type WebXRInputTracker } from "./webxr-input.js";
import { createWebXREvidence, type WebXREvidence } from "./webxr-capabilities.js";

export type { WebXREvidenceCode } from "./webxr-capabilities.js";

export type WebXRSessionState = "idle" | "unsupported" | "starting" | "active" | "ended" | "failed";

export interface WebXRSessionControllerOptions {
  readonly renderer: {
    readonly xr: {
      enabled: boolean;
      setSession(session: unknown | null): Promise<void> | void;
    };
  };
  readonly scene: { add(object: unknown): void; remove(object: unknown): void };
  readonly camera: unknown;
  readonly userRig: {
    readonly position?: { x: number; y: number; z: number };
    add(object: unknown): void;
    remove(object: unknown): void;
  };
  readonly orbitControls: { enabled: boolean; update?: () => void };
  readonly navigator: {
    readonly xr: {
      readonly isSessionSupported?: (mode: "immersive-vr") => Promise<boolean> | boolean;
      readonly requestSession: (mode: "immersive-vr") => Promise<WebXRSessionLike> | WebXRSessionLike;
    };
  };
  readonly referenceSpacePreference?: readonly string[];
  readonly logger?: Pick<Console, "error" | "warn">;
  readonly onSelect?: (event: { readonly inputSource?: unknown }, input: WebXRInputState) => void;
}

export interface WebXRSessionLike {
  readonly inputSources?: Iterable<unknown>;
  requestReferenceSpace(type: string): Promise<unknown> | unknown;
  addEventListener(type: string, listener: (event: { readonly inputSource?: unknown }) => void): void;
  removeEventListener(type: string, listener: (event: { readonly inputSource?: unknown }) => void): void;
  end(): Promise<void> | void;
}

export interface WebXRSessionStartResult {
  readonly status: "active" | "unsupported" | "failed";
  readonly session?: WebXRSessionLike;
  readonly referenceSpace?: unknown;
  readonly referenceSpaceType?: string;
  readonly evidence: WebXREvidence[];
}

export interface WebXRSessionController {
  readonly state: WebXRSessionState;
  readonly input: WebXRInputState;
  readonly session: WebXRSessionLike | null;
  readonly referenceSpace: unknown | null;
  readonly referenceSpaceType: string | null;
  start(): Promise<WebXRSessionStartResult>;
  end(): Promise<void>;
  updateInput(frame: unknown): WebXRInputState;
  onStateChange(listener: (state: WebXRSessionState) => void): () => void;
}

const EMPTY_INPUT: WebXRInputState = { sources: [], evidence: [] };

function globalNavigatorLike(): WebXRSessionControllerOptions["navigator"] | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as unknown as WebXRSessionControllerOptions["navigator"]);
}

export function createWebXRSessionController(options: WebXRSessionControllerOptions): WebXRSessionController {
  let state: WebXRSessionState = "idle";
  let activeSession: WebXRSessionLike | null = null;
  let activeReferenceSpace: unknown | null = null;
  let activeReferenceSpaceType: string | null = null;
  let input: WebXRInputState = EMPTY_INPUT;
  const tracker: WebXRInputTracker = createWebXRInputTracker();
  const listeners = new Set<(state: WebXRSessionState) => void>();
  const originalOrbitControlsEnabled = options.orbitControls?.enabled ?? true;
  const navigatorLike = options.navigator ?? globalNavigatorLike();

  function setState(nextState: WebXRSessionState): void {
    state = nextState;
    for (const listener of listeners) {
      listener(nextState);
    }
  }

  const handleSelectStart = (event: { readonly inputSource?: unknown }): void => tracker.handleSelectStart(event);
  const handleSelectEnd = (event: { readonly inputSource?: unknown }): void => tracker.handleSelectEnd(event);
  const handleSqueezeStart = (event: { readonly inputSource?: unknown }): void => tracker.handleSqueezeStart(event);
  const handleSqueezeEnd = (event: { readonly inputSource?: unknown }): void => tracker.handleSqueezeEnd(event);
  const handleSelect = (event: { readonly inputSource?: unknown }): void => {
    options.onSelect?.(event, input);
  };
  const handleEnded = (): void => {
    void cleanupAfterEnd(false);
  };

  function addSessionListeners(session: WebXRSessionLike): void {
    session.addEventListener("selectstart", handleSelectStart);
    session.addEventListener("selectend", handleSelectEnd);
    session.addEventListener("squeezestart", handleSqueezeStart);
    session.addEventListener("squeezeend", handleSqueezeEnd);
    session.addEventListener("select", handleSelect);
    session.addEventListener("end", handleEnded);
  }

  function removeSessionListeners(session: WebXRSessionLike): void {
    session.removeEventListener("selectstart", handleSelectStart);
    session.removeEventListener("selectend", handleSelectEnd);
    session.removeEventListener("squeezestart", handleSqueezeStart);
    session.removeEventListener("squeezeend", handleSqueezeEnd);
    session.removeEventListener("select", handleSelect);
    session.removeEventListener("end", handleEnded);
  }

  async function requestReferenceSpace(
    session: WebXRSessionLike,
    preference: readonly string[],
    evidence: WebXREvidence[],
  ): Promise<{ readonly referenceSpace: unknown; readonly referenceSpaceType: string } | null> {
    let localFloorFailed = false;
    for (const referenceSpaceType of preference) {
      try {
        const referenceSpace = await session.requestReferenceSpace(referenceSpaceType);
        if (referenceSpaceType === "local" && localFloorFailed) {
          evidence.push(createWebXREvidence(
            "reference-space-local-fallback",
            "degraded",
            "local-floor is unavailable; Alice is using local reference space.",
          ));
        }
        return { referenceSpace, referenceSpaceType };
      } catch (error) {
        if (referenceSpaceType === "local-floor") {
          localFloorFailed = true;
        }
        options.logger?.warn?.(`Alice WebXR reference space ${referenceSpaceType} unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    evidence.push(createWebXREvidence(
      "reference-space-unavailable",
      "failed",
      "Neither local-floor nor local reference space could be created.",
    ));
    return null;
  }

  async function cleanupAfterEnd(callEnd: boolean): Promise<void> {
    const session = activeSession;
    if (session) {
      removeSessionListeners(session);
      if (callEnd) {
        await session.end();
      }
    }
    activeSession = null;
    activeReferenceSpace = null;
    activeReferenceSpaceType = null;
    input = EMPTY_INPUT;
    tracker.clear();
    await options.renderer.xr.setSession(null);
    options.renderer.xr.enabled = false;
    if (options.orbitControls) {
      options.orbitControls.enabled = originalOrbitControlsEnabled;
    }
    setState("ended");
  }

  return {
    get state(): WebXRSessionState {
      return state;
    },
    get input(): WebXRInputState {
      return input;
    },
    get session(): WebXRSessionLike | null {
      return activeSession;
    },
    get referenceSpace(): unknown | null {
      return activeReferenceSpace;
    },
    get referenceSpaceType(): string | null {
      return activeReferenceSpaceType;
    },
    onStateChange(listener: (state: WebXRSessionState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start(): Promise<WebXRSessionStartResult> {
      const evidence: WebXREvidence[] = [];
      if (!navigatorLike?.xr?.requestSession) {
        evidence.push(createWebXREvidence(
          "webxr-unavailable",
          "unsupported",
          "This browser does not expose navigator.xr.requestSession.",
        ));
        setState("unsupported");
        return { status: "unsupported", evidence };
      }

      if (navigatorLike.xr.isSessionSupported && !await navigatorLike.xr.isSessionSupported("immersive-vr")) {
        evidence.push(createWebXREvidence(
          "immersive-vr-unsupported",
          "unsupported",
          "The browser reports that immersive-vr sessions are unsupported.",
        ));
        setState("unsupported");
        return { status: "unsupported", evidence };
      }

      setState("starting");
      try {
        const session = await navigatorLike.xr.requestSession("immersive-vr");
        const referenceSpaceResult = await requestReferenceSpace(session, options.referenceSpacePreference ?? ["local-floor", "local"], evidence);
        if (!referenceSpaceResult) {
          activeSession = session;
          await cleanupAfterEnd(true);
          setState("failed");
          return { status: "failed", evidence };
        }

        activeSession = session;
        activeReferenceSpace = referenceSpaceResult.referenceSpace;
        activeReferenceSpaceType = referenceSpaceResult.referenceSpaceType;
        addSessionListeners(session);
        options.renderer.xr.enabled = true;
        await options.renderer.xr.setSession(session);
        if (options.orbitControls) {
          options.orbitControls.enabled = false;
        }
        input = normalizeWebXRInput(session, undefined, referenceSpaceResult.referenceSpace, tracker.snapshot());
        setState("active");
        return {
          status: "active",
          session,
          referenceSpace: referenceSpaceResult.referenceSpace,
          referenceSpaceType: referenceSpaceResult.referenceSpaceType,
          evidence,
        };
      } catch (error) {
        options.logger?.error?.(`Alice WebXR session startup failed: ${error instanceof Error ? error.message : String(error)}`);
        options.renderer.xr.enabled = false;
        if (options.orbitControls) {
          options.orbitControls.enabled = originalOrbitControlsEnabled;
        }
        evidence.push(createWebXREvidence(
          "session-request-failed",
          "failed",
          "The browser rejected the immersive VR session request.",
          error instanceof Error ? error.message : String(error),
        ));
        setState("failed");
        return { status: "failed", evidence };
      }
    },
    async end(): Promise<void> {
      await cleanupAfterEnd(Boolean(activeSession));
    },
    updateInput(frame: unknown): WebXRInputState {
      if (!activeSession || !activeReferenceSpace) {
        input = EMPTY_INPUT;
        return input;
      }
      input = normalizeWebXRInput(activeSession, frame as Parameters<typeof normalizeWebXRInput>[1], activeReferenceSpace, tracker.snapshot());
      return input;
    },
  };
}
