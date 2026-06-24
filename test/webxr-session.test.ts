// test/webxr-session.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createWebXRSessionController,
  type WebXREvidenceCode,
  type WebXRSessionControllerOptions,
} from "../src/webxr-session.js";

type FakeXRSession = {
  inputSources: unknown[];
  requestReferenceSpace: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

function makeRenderer(): WebXRSessionControllerOptions["renderer"] {
  return {
    xr: {
      enabled: false,
      setSession: vi.fn(async () => undefined),
    },
  } as unknown as WebXRSessionControllerOptions["renderer"];
}

function makeSession(referenceSpaceSupport: Record<string, boolean>): FakeXRSession {
  return {
    inputSources: [],
    requestReferenceSpace: vi.fn(async (type: string) => {
      if (!referenceSpaceSupport[type]) {
        throw new Error(`${type} unsupported`);
      }
      return { type };
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    end: vi.fn(async () => undefined),
  };
}

function makeOptions(
  session: FakeXRSession,
  overrides: Partial<WebXRSessionControllerOptions> = {},
): WebXRSessionControllerOptions {
  const renderer = makeRenderer();
  return {
    renderer,
    scene: { add: vi.fn(), remove: vi.fn() } as unknown as WebXRSessionControllerOptions["scene"],
    camera: {} as unknown as WebXRSessionControllerOptions["camera"],
    userRig: {
      position: { x: 0, y: 1.6, z: 0 },
      add: vi.fn(),
      remove: vi.fn(),
    } as unknown as WebXRSessionControllerOptions["userRig"],
    orbitControls: {
      enabled: true,
      update: vi.fn(),
    } as unknown as WebXRSessionControllerOptions["orbitControls"],
    navigator: {
      xr: {
        isSessionSupported: vi.fn(async () => true),
        requestSession: vi.fn(async () => session),
      },
    },
    referenceSpacePreference: ["local-floor", "local"],
    ...overrides,
  };
}

function codes(evidence: { code: WebXREvidenceCode }[]): WebXREvidenceCode[] {
  return evidence.map((item) => item.code);
}

describe("createWebXRSessionController", () => {
  it("does not request immersive VR until start is called from user intent", () => {
    const session = makeSession({ "local-floor": true, local: true });
    const options = makeOptions(session);

    const controller = createWebXRSessionController(options);

    expect(controller.state).toBe("idle");
    expect(options.navigator.xr.requestSession).not.toHaveBeenCalled();
  });

  it("starts an immersive session, enables renderer XR, disables desktop controls, and reports active state", async () => {
    const session = makeSession({ "local-floor": true, local: true });
    const options = makeOptions(session);
    const controller = createWebXRSessionController(options);
    const stateChanges: string[] = [];
    controller.onStateChange((state) => stateChanges.push(state));

    const result = await controller.start();

    expect(options.navigator.xr.requestSession).toHaveBeenCalledWith("immersive-vr");
    expect(session.requestReferenceSpace).toHaveBeenCalledWith("local-floor");
    expect(result.status).toBe("active");
    expect(controller.state).toBe("active");
    expect(result.referenceSpace).toEqual({ type: "local-floor" });
    expect(result.referenceSpaceType).toBe("local-floor");
    expect(controller.referenceSpaceType).toBe("local-floor");
    expect(options.renderer.xr.enabled).toBe(true);
    expect(options.renderer.xr.setSession).toHaveBeenCalledWith(session);
    expect(options.orbitControls.enabled).toBe(false);
    expect(stateChanges).toEqual(["starting", "active"]);
  });

  it("falls back from local-floor to local with explicit degraded evidence", async () => {
    const session = makeSession({ "local-floor": false, local: true });
    const controller = createWebXRSessionController(makeOptions(session));

    const result = await controller.start();

    expect(result.status).toBe("active");
    expect(result.referenceSpace).toEqual({ type: "local" });
    expect(result.referenceSpaceType).toBe("local");
    expect(codes(result.evidence)).toContain("reference-space-local-fallback");
  });

  it("fails visibly when requestSession rejects", async () => {
    const session = makeSession({ "local-floor": true, local: true });
    const options = makeOptions(session, {
      navigator: {
        xr: {
          isSessionSupported: vi.fn(async () => true),
          requestSession: vi.fn(async () => {
            throw new Error("permission denied");
          }),
        },
      },
    });
    const controller = createWebXRSessionController(options);

    const result = await controller.start();

    expect(result.status).toBe("failed");
    expect(controller.state).toBe("failed");
    expect(codes(result.evidence)).toContain("session-request-failed");
    expect(options.renderer.xr.setSession).not.toHaveBeenCalled();
    expect(options.orbitControls.enabled).toBe(true);
  });

  it("cleans up session, input state, renderer XR, and OrbitControls when ended", async () => {
    const session = makeSession({ "local-floor": true, local: true });
    const options = makeOptions(session);
    const controller = createWebXRSessionController(options);

    await controller.start();
    await controller.end();

    expect(session.end).toHaveBeenCalled();
    expect(options.renderer.xr.setSession).toHaveBeenLastCalledWith(null);
    expect(options.renderer.xr.enabled).toBe(false);
    expect(options.orbitControls.enabled).toBe(true);
    expect(controller.input.sources).toEqual([]);
    expect(controller.referenceSpaceType).toBeNull();
    expect(controller.state).toBe("ended");
  });
});
