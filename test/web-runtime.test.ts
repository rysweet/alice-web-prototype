import { describe, expect, it, vi } from "vitest";
import {
  BrowserAdapter,
  CanvasManager,
  ClipboardAdapter,
  FullscreenManager,
  ResizeObserver as BrowserResizeObserver,
  TouchAdapter,
  WebGLContext,
  type ManagedCanvas,
} from "../src/web-runtime.js";

describe("web-runtime", () => {
  it("manages canvas sizing with device pixel ratio awareness", () => {
    const canvas: ManagedCanvas = { width: 0, height: 0, style: {} };
    const manager = new CanvasManager({ canvas, devicePixelRatio: 2 });

    const size = manager.resize(320, 180);

    expect(size).toEqual({
      logicalWidth: 320,
      logicalHeight: 180,
      pixelWidth: 640,
      pixelHeight: 360,
      devicePixelRatio: 2,
    });
    expect(canvas.style).toEqual({ width: "320px", height: "180px" });
  });

  it("adapts runtime mounting, resizing, touch dispatch, and clipboard access for the browser", async () => {
    const appended: ManagedCanvas[] = [];
    const runtimeEvents: unknown[] = [];
    const animationCallbacks: Array<(time: number) => void> = [];
    let timeoutHandle = 0;
    const clipboard = new ClipboardAdapter({ initialText: "starter" });
    const browserAdapter = new BrowserAdapter({
      canvasManager: new CanvasManager({
        canvasFactory: () => ({ width: 0, height: 0, style: {} }),
        devicePixelRatio: 1.5,
      }),
      runtime: {
        setCanvas: (canvas) => runtimeEvents.push(["canvas", canvas.width, canvas.height]),
        resize: (width, height) => runtimeEvents.push(["resize", width, height]),
        dispatchInput: (event) => runtimeEvents.push(["touch", event.identifier, event.phase]),
        onMount: () => runtimeEvents.push(["mounted"]),
      },
      clipboardAdapter: clipboard,
      windowObject: {
        devicePixelRatio: 1.5,
        setTimeout: (callback) => {
          animationCallbacks.push(callback);
          timeoutHandle += 1;
          return timeoutHandle;
        },
        clearTimeout: vi.fn(),
      },
      documentObject: {
        createElement: () => ({ width: 0, height: 0, style: {} }),
      },
    });

    const canvas = browserAdapter.mount({ appendChild: (child) => appended.push(child) }, 200, 100);
    const resized = browserAdapter.resize(150, 90);
    const touches = browserAdapter.dispatchTouchEvent({
      type: "touchstart",
      target: { id: "viewport" },
      touches: [{ identifier: 7, clientX: 4, clientY: 6, force: 0.5 }],
      changedTouches: [{ identifier: 7, clientX: 4, clientY: 6, force: 0.5 }],
    });
    const frameHandle = browserAdapter.requestFrame((timestamp) => runtimeEvents.push(["frame", timestamp]));
    animationCallbacks[0]?.(16);
    await browserAdapter.copyText("copied");

    expect(browserAdapter.isBrowserEnvironment()).toBe(true);
    expect(appended).toHaveLength(1);
    expect(resized.pixelWidth).toBe(225);
    expect(touches).toEqual([
      {
        identifier: 7,
        x: 4,
        y: 6,
        pressure: 0.5,
        phase: "start",
        targetId: "viewport",
        touchCount: 1,
      },
    ]);
    expect(frameHandle).toBe(1);
    expect(await browserAdapter.readClipboardText()).toBe("copied");
    expect(runtimeEvents).toEqual([
      ["canvas", 300, 150],
      ["resize", 200, 100],
      ["mounted"],
      ["resize", 150, 90],
      ["touch", 7, "start"],
      ["frame", 16],
    ]);
  });

  it("initializes WebGL contexts with fallback and tracks context lifecycle events", () => {
    const listeners = new Map<string, (event?: unknown) => void>();
    const canvas: ManagedCanvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: (name: string) => name === "webgl" ? { name } : null,
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
    };
    const context = new WebGLContext(canvas);

    const initialized = context.initialize();
    listeners.get("webglcontextlost")?.({ preventDefault: vi.fn() });
    expect(context.isLost).toBe(true);
    listeners.get("webglcontextrestored")?.();

    expect(initialized).toEqual({ name: "webgl" });
    expect(context.contextName).toBe("webgl");
    expect(context.isFallback).toBe(true);
    expect(context.isLost).toBe(false);
  });

  it("observes size changes through fallback resize handling", () => {
    const observations: Array<{ width: number; height: number }> = [];
    let resizeListener: (() => void) | undefined;
    const observer = new BrowserResizeObserver(
      (observation) => observations.push({ width: observation.width, height: observation.height }),
      {
        windowObject: {
          addEventListener: (_type, listener) => {
            resizeListener = listener;
          },
          removeEventListener: vi.fn(),
        },
      },
    );
    const target = {
      getBoundingClientRect: () => ({ width: 640, height: 360 }),
    };

    observer.observe(target);
    resizeListener?.();
    observer.trigger(target);
    observer.disconnect();

    expect(observations).toEqual([
      { width: 640, height: 360 },
      { width: 640, height: 360 },
      { width: 640, height: 360 },
    ]);
  });

  it("disconnects the previous native resize observer before re-observing", () => {
    const nativeObservers: Array<{
      observe: (target: unknown) => void;
      disconnect: () => void;
    }> = [];
    class NativeResizeObserver {
      readonly observe = vi.fn((_target: unknown) => undefined);
      readonly disconnect = vi.fn(() => undefined);

      constructor(
        _callback: (entries: Array<{ target: unknown; contentRect: { width: number; height: number } }>) => void,
      ) {
        nativeObservers.push(this);
      }
    }
    const observer = new BrowserResizeObserver(() => undefined, {
      observerFactory: NativeResizeObserver,
    });
    const firstTarget = { id: "first" };
    const secondTarget = { id: "second" };

    observer.observe(firstTarget);
    observer.observe(secondTarget);

    expect(nativeObservers).toHaveLength(2);
    expect(nativeObservers[0]?.observe).toHaveBeenCalledWith(firstTarget);
    expect(nativeObservers[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(nativeObservers[1]?.observe).toHaveBeenCalledWith(secondTarget);
    expect(nativeObservers[1]?.disconnect).not.toHaveBeenCalled();
  });

  it("enters, exits, and toggles fullscreen state", async () => {
    const enter = vi.fn(async () => undefined);
    const exit = vi.fn(async () => undefined);
    const documentObject = { fullscreenElement: null as unknown, exitFullscreen: exit };
    const manager = new FullscreenManager(documentObject);
    const element = { requestFullscreen: enter };

    await manager.enter(element);
    expect(manager.isSupported(element)).toBe(true);

    documentObject.fullscreenElement = element;
    expect(manager.isFullscreen()).toBe(true);
    await manager.toggle(element);
    documentObject.fullscreenElement = null;
    await manager.toggle(element);

    expect(enter).toHaveBeenCalledTimes(2);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("converts touch points into Alice runtime events and dispatches them", () => {
    const received: Array<{ identifier: number; x: number; phase: string }> = [];
    const adapter = new TouchAdapter({
      scale: 2,
      dispatcher: (event) => received.push({ identifier: event.identifier, x: event.x, phase: event.phase }),
    });

    const converted = adapter.dispatch({
      type: "touchmove",
      target: { id: "scene" },
      touches: [
        { identifier: 1, clientX: 10, clientY: 12, force: 0.75 },
        { identifier: 2, clientX: 30, clientY: 16 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 10, clientY: 12, force: 0.75 },
        { identifier: 2, clientX: 30, clientY: 16 },
      ],
    });

    expect(converted[0]).toEqual({
      identifier: 1,
      x: 20,
      y: 24,
      pressure: 0.75,
      phase: "move",
      targetId: "scene",
      touchCount: 2,
    });
    expect(received).toEqual([
      { identifier: 1, x: 20, phase: "move" },
      { identifier: 2, x: 60, phase: "move" },
    ]);
  });

  it("uses the clipboard API when present and falls back to in-memory storage otherwise", async () => {
    const clipboardApi = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => "from-browser"),
    };
    const browserClipboard = new ClipboardAdapter({ clipboard: clipboardApi });
    const fallbackClipboard = new ClipboardAdapter();
    const structuredClipboard = new ClipboardAdapter();

    await browserClipboard.writeJson({ feature: "web-runtime" });
    await fallbackClipboard.writeText("offline-copy");
    await structuredClipboard.writeJson({ feature: "web-runtime" });

    expect(browserClipboard.isSupported).toBe(true);
    expect(clipboardApi.writeText).toHaveBeenCalledWith('{"feature":"web-runtime"}');
    expect(await browserClipboard.readText()).toBe("from-browser");
    expect(await fallbackClipboard.readText()).toBe("offline-copy");
    expect(await structuredClipboard.readJson<{ feature: string }>()).toEqual({ feature: "web-runtime" });
  });
});
