export interface ManagedCanvas {
  width: number;
  height: number;
  style?: {
    width?: string;
    height?: string;
  };
  getContext?: (type: string, attributes?: Record<string, unknown>) => unknown;
  addEventListener?: (type: string, listener: (event?: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event?: unknown) => void) => void;
}

export interface CanvasContainer {
  appendChild?: (child: ManagedCanvas) => void;
}

export interface BrowserRuntime {
  setCanvas?: (canvas: ManagedCanvas) => void;
  resize?: (width: number, height: number) => void;
  dispatchInput?: (event: AliceTouchEvent) => void;
  onMount?: () => void;
}

export interface BrowserWindowLike {
  readonly devicePixelRatio?: number;
  readonly ResizeObserver?: ResizeObserverConstructorLike;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
  setTimeout?: (callback: FrameRequestCallback, delay: number) => number;
  clearTimeout?: (handle: number) => void;
}

export interface BrowserDocumentLike {
  readonly fullscreenElement?: unknown;
  readonly webkitFullscreenElement?: unknown;
  exitFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
  createElement?: (tagName: string) => ManagedCanvas;
}

export interface FullscreenElementLike {
  readonly id?: string;
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export interface BrowserClipboardLike {
  writeText?: (text: string) => Promise<void>;
  readText?: () => Promise<string>;
}

export interface ResizeObserverEntryLike {
  readonly target: unknown;
  readonly contentRect: {
    readonly width: number;
    readonly height: number;
  };
}

export interface NativeResizeObserverLike {
  observe(target: unknown): void;
  disconnect(): void;
}

export interface ResizeObserverConstructorLike {
  new (callback: (entries: ResizeObserverEntryLike[]) => void): NativeResizeObserverLike;
}

export interface AliceTouchPoint {
  readonly identifier: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly force?: number;
}

export interface AliceTouchEvent {
  readonly identifier: number;
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly phase: TouchPhase;
  readonly targetId: string | null;
  readonly touchCount: number;
}

export type TouchPhase = "start" | "move" | "end" | "cancel";

export interface TouchEventLike {
  readonly type?: string;
  readonly target?: { readonly id?: string } | null;
  readonly touches?: readonly AliceTouchPoint[];
  readonly changedTouches?: readonly AliceTouchPoint[];
}

export interface CanvasManagerOptions {
  readonly canvas?: ManagedCanvas;
  readonly canvasFactory?: () => ManagedCanvas;
  readonly devicePixelRatio?: number | (() => number);
  readonly initialWidth?: number;
  readonly initialHeight?: number;
}

export interface CanvasSize {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly devicePixelRatio: number;
}

export class CanvasManager {
  private readonly canvas: ManagedCanvas;
  private readonly devicePixelRatioProvider: () => number;
  private logicalWidth = 0;
  private logicalHeight = 0;

  constructor(options: CanvasManagerOptions = {}) {
    this.canvas = options.canvas ?? options.canvasFactory?.() ?? { width: 0, height: 0, style: {} };
    if (typeof options.devicePixelRatio === "function") {
      this.devicePixelRatioProvider = options.devicePixelRatio;
    } else {
      const devicePixelRatio = options.devicePixelRatio ?? 1;
      this.devicePixelRatioProvider = () => devicePixelRatio;
    }

    if (options.initialWidth !== undefined || options.initialHeight !== undefined) {
      this.resize(options.initialWidth ?? 0, options.initialHeight ?? 0);
    }
  }

  getCanvas(): ManagedCanvas {
    return this.canvas;
  }

  getSize(): CanvasSize {
    return {
      logicalWidth: this.logicalWidth,
      logicalHeight: this.logicalHeight,
      pixelWidth: this.canvas.width,
      pixelHeight: this.canvas.height,
      devicePixelRatio: this.currentDevicePixelRatio,
    };
  }

  resize(width: number, height: number): CanvasSize {
    this.logicalWidth = Math.max(0, Math.round(width));
    this.logicalHeight = Math.max(0, Math.round(height));
    const devicePixelRatio = this.currentDevicePixelRatio;

    this.canvas.width = Math.round(this.logicalWidth * devicePixelRatio);
    this.canvas.height = Math.round(this.logicalHeight * devicePixelRatio);
    if (this.canvas.style) {
      this.canvas.style.width = `${this.logicalWidth}px`;
      this.canvas.style.height = `${this.logicalHeight}px`;
    }

    return this.getSize();
  }

  private get currentDevicePixelRatio(): number {
    const value = this.devicePixelRatioProvider();
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
}

export interface WebGLContextOptions {
  readonly contextNames?: readonly string[];
  readonly contextAttributes?: Record<string, unknown>;
}

export class WebGLContext {
  private readonly contextNames: readonly string[];
  private readonly contextAttributes?: Record<string, unknown>;
  private activeContext: unknown = null;
  private activeContextName: string | null = null;
  private contextLost = false;
  private eventsBound = false;

  constructor(
    private readonly canvas: ManagedCanvas,
    options: WebGLContextOptions = {},
  ) {
    this.contextNames = options.contextNames ?? ["webgl2", "webgl", "experimental-webgl"];
    this.contextAttributes = options.contextAttributes;
  }

  initialize(): unknown | null {
    this.bindLifecycleEvents();
    for (const contextName of this.contextNames) {
      const context = this.canvas.getContext?.(contextName, this.contextAttributes);
      if (context != null) {
        this.activeContext = context;
        this.activeContextName = contextName;
        this.contextLost = false;
        return context;
      }
    }
    this.activeContext = null;
    this.activeContextName = null;
    return null;
  }

  get context(): unknown | null {
    return this.activeContext;
  }

  get contextName(): string | null {
    return this.activeContextName;
  }

  get isFallback(): boolean {
    return this.activeContextName !== null && this.activeContextName !== this.contextNames[0];
  }

  get isLost(): boolean {
    return this.contextLost;
  }

  dispose(): void {
    if (this.eventsBound && this.canvas.removeEventListener) {
      this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    }

    this.activeContext = null;
    this.activeContextName = null;
    this.contextLost = false;
    this.eventsBound = false;
  }

  private bindLifecycleEvents(): void {
    if (this.eventsBound || !this.canvas.addEventListener) {
      return;
    }

    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    this.eventsBound = true;
  }

  private readonly handleContextLost = (event?: unknown): void => {
    const eventRecord = event as { preventDefault?: () => void } | undefined;
    eventRecord?.preventDefault?.();
    this.contextLost = true;
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
  };
}

export interface ResizeObservation {
  readonly target: unknown;
  readonly width: number;
  readonly height: number;
}

export interface ResizeObserverOptions {
  readonly observerFactory?: ResizeObserverConstructorLike;
  readonly windowObject?: BrowserWindowLike;
}

export class ResizeObserver {
  private readonly windowObject: BrowserWindowLike | undefined;
  private readonly observerFactory: ResizeObserverConstructorLike | undefined;
  private nativeObserver: NativeResizeObserverLike | null = null;
  private observedTarget: unknown = null;
  private fallbackListenerInstalled = false;

  constructor(
    private readonly callback: (observation: ResizeObservation) => void,
    options: ResizeObserverOptions = {},
  ) {
    this.windowObject = options.windowObject;
    this.observerFactory = options.observerFactory ?? options.windowObject?.ResizeObserver;
  }

  observe(target: unknown): void {
    this.observedTarget = target;
    if (this.observerFactory) {
      this.nativeObserver?.disconnect();
      this.nativeObserver = new this.observerFactory((entries) => {
        for (const entry of entries) {
          this.callback({
            target: entry.target,
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      });
      this.nativeObserver.observe(target);
      return;
    }

    if (!this.fallbackListenerInstalled) {
      this.windowObject?.addEventListener?.("resize", this.emitCurrentObservation);
      this.fallbackListenerInstalled = true;
    }
    this.emitCurrentObservation();
  }

  disconnect(): void {
    this.nativeObserver?.disconnect();
    this.nativeObserver = null;
    if (this.fallbackListenerInstalled) {
      this.windowObject?.removeEventListener?.("resize", this.emitCurrentObservation);
      this.fallbackListenerInstalled = false;
    }
    this.observedTarget = null;
  }

  trigger(target: unknown = this.observedTarget): void {
    if (target == null) {
      return;
    }
    this.callback(this.measure(target));
  }

  private readonly emitCurrentObservation = (): void => {
    if (this.observedTarget != null) {
      this.callback(this.measure(this.observedTarget));
    }
  };

  private measure(target: unknown): ResizeObservation {
    const record = target as {
      getBoundingClientRect?: () => { width: number; height: number };
      clientWidth?: number;
      clientHeight?: number;
      width?: number;
      height?: number;
    };
    const rect = record.getBoundingClientRect?.();
    return {
      target,
      width: rect?.width ?? record.clientWidth ?? record.width ?? 0,
      height: rect?.height ?? record.clientHeight ?? record.height ?? 0,
    };
  }
}

export class FullscreenManager {
  constructor(private readonly documentObject?: BrowserDocumentLike) {}

  isSupported(element: FullscreenElementLike): boolean {
    return typeof element.requestFullscreen === "function"
      || typeof element.webkitRequestFullscreen === "function";
  }

  isFullscreen(): boolean {
    return Boolean(this.documentObject?.fullscreenElement ?? this.documentObject?.webkitFullscreenElement);
  }

  async enter(element: FullscreenElementLike): Promise<void> {
    const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
    if (!request) {
      throw new Error("Fullscreen is not supported for this element.");
    }
    await request.call(element);
  }

  async exit(): Promise<void> {
    const exit = this.documentObject?.exitFullscreen ?? this.documentObject?.webkitExitFullscreen;
    if (!exit) {
      throw new Error("Fullscreen exit is not supported in this document.");
    }
    await exit.call(this.documentObject);
  }

  async toggle(element: FullscreenElementLike): Promise<void> {
    if (this.isFullscreen()) {
      await this.exit();
      return;
    }
    await this.enter(element);
  }
}

export interface TouchAdapterOptions {
  readonly scale?: number;
  readonly dispatcher?: (event: AliceTouchEvent) => void;
}

export class TouchAdapter {
  private readonly scale: number;

  constructor(private readonly options: TouchAdapterOptions = {}) {
    this.scale = options.scale ?? 1;
  }

  convert(event: TouchEventLike, phase = inferTouchPhase(event.type)): AliceTouchEvent[] {
    const touches = toArray(event.changedTouches ?? event.touches);
    const touchCount = toArray(event.touches).length || touches.length;
    const targetId = event.target?.id ?? null;

    return touches.map((touch) => ({
      identifier: touch.identifier,
      x: touch.clientX * this.scale,
      y: touch.clientY * this.scale,
      pressure: touch.force ?? 1,
      phase,
      targetId,
      touchCount,
    }));
  }

  dispatch(event: TouchEventLike, phase = inferTouchPhase(event.type)): AliceTouchEvent[] {
    const converted = this.convert(event, phase);
    for (const touch of converted) {
      this.options.dispatcher?.(touch);
    }
    return converted;
  }
}

export interface ClipboardAdapterOptions {
  readonly clipboard?: BrowserClipboardLike | null;
  readonly initialText?: string;
}

export class ClipboardAdapter {
  private fallbackText: string;

  constructor(private readonly options: ClipboardAdapterOptions = {}) {
    this.fallbackText = options.initialText ?? "";
  }

  get isSupported(): boolean {
    return typeof this.options.clipboard?.writeText === "function"
      && typeof this.options.clipboard?.readText === "function";
  }

  async writeText(text: string): Promise<void> {
    this.fallbackText = text;
    await this.options.clipboard?.writeText?.(text);
  }

  async readText(): Promise<string> {
    const clipboardText = await this.options.clipboard?.readText?.();
    return clipboardText ?? this.fallbackText;
  }

  async writeJson(value: unknown): Promise<void> {
    await this.writeText(JSON.stringify(value));
  }

  async readJson<T>(): Promise<T | null> {
    const text = await this.readText();
    if (!text) {
      return null;
    }
    return JSON.parse(text) as T;
  }
}

export interface BrowserAdapterOptions {
  readonly runtime?: BrowserRuntime;
  readonly windowObject?: BrowserWindowLike;
  readonly documentObject?: BrowserDocumentLike;
  readonly canvasManager?: CanvasManager;
  readonly touchAdapter?: TouchAdapter;
  readonly clipboardAdapter?: ClipboardAdapter;
}

export class BrowserAdapter {
  private readonly canvasManager: CanvasManager;
  private readonly touchAdapter: TouchAdapter;
  private readonly clipboardAdapter: ClipboardAdapter;

  constructor(private readonly options: BrowserAdapterOptions = {}) {
    this.canvasManager = options.canvasManager ?? new CanvasManager({
      canvasFactory: () => options.documentObject?.createElement?.("canvas") ?? { width: 0, height: 0, style: {} },
      devicePixelRatio: () => options.windowObject?.devicePixelRatio ?? 1,
    });
    this.touchAdapter = options.touchAdapter ?? new TouchAdapter({
      dispatcher: (event) => this.options.runtime?.dispatchInput?.(event),
    });
    this.clipboardAdapter = options.clipboardAdapter ?? new ClipboardAdapter();
  }

  isBrowserEnvironment(): boolean {
    return Boolean(this.options.documentObject && this.options.windowObject);
  }

  mount(container: CanvasContainer, width: number, height: number): ManagedCanvas {
    const canvas = this.canvasManager.getCanvas();
    this.canvasManager.resize(width, height);
    container.appendChild?.(canvas);
    this.options.runtime?.setCanvas?.(canvas);
    this.options.runtime?.resize?.(width, height);
    this.options.runtime?.onMount?.();
    return canvas;
  }

  resize(width: number, height: number): CanvasSize {
    const size = this.canvasManager.resize(width, height);
    this.options.runtime?.resize?.(width, height);
    return size;
  }

  requestFrame(callback: FrameRequestCallback): number {
    if (this.options.windowObject?.requestAnimationFrame) {
      return this.options.windowObject.requestAnimationFrame(callback);
    }
    return this.options.windowObject?.setTimeout?.(callback, 16) ?? 0;
  }

  cancelFrame(handle: number): void {
    if (this.options.windowObject?.cancelAnimationFrame) {
      this.options.windowObject.cancelAnimationFrame(handle);
      return;
    }
    this.options.windowObject?.clearTimeout?.(handle);
  }

  dispatchTouchEvent(event: TouchEventLike, phase?: TouchPhase): AliceTouchEvent[] {
    return this.touchAdapter.dispatch(event, phase);
  }

  async copyText(text: string): Promise<void> {
    await this.clipboardAdapter.writeText(text);
  }

  async readClipboardText(): Promise<string> {
    return this.clipboardAdapter.readText();
  }
}

function inferTouchPhase(type: string | undefined): TouchPhase {
  if (type?.includes("start")) {
    return "start";
  }
  if (type?.includes("move")) {
    return "move";
  }
  if (type?.includes("cancel")) {
    return "cancel";
  }
  return "end";
}

function toArray<T>(value: readonly T[] | undefined): T[] {
  return value ? [...value] : [];
}
