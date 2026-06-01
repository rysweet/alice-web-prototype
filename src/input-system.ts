export interface InputVector {
  readonly x: number;
  readonly y: number;
}

export interface ModifierState {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

export interface TouchPoint extends InputVector {
  readonly id: number;
}

export interface GestureResult {
  readonly type: "pinch" | "rotate" | "swipe";
  readonly value: number;
  readonly direction?: "left" | "right" | "up" | "down";
}

function distance(left: InputVector, right: InputVector): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function angle(left: InputVector, right: InputVector): number {
  return Math.atan2(right.y - left.y, right.x - left.x);
}

function defaultModifiers(): ModifierState {
  return { shift: false, ctrl: false, alt: false, meta: false };
}

export class MouseState {
  position: InputVector = { x: 0, y: 0 };
  wheelDelta = 0;
  private readonly buttons = new Set<number>();

  move(x: number, y: number): this {
    this.position = { x, y };
    return this;
  }

  press(button: number): this {
    this.buttons.add(button);
    return this;
  }

  release(button: number): this {
    this.buttons.delete(button);
    return this;
  }

  scroll(delta: number): this {
    this.wheelDelta += delta;
    return this;
  }

  isPressed(button: number): boolean {
    return this.buttons.has(button);
  }

  snapshot(): { position: InputVector; buttons: number[]; wheelDelta: number } {
    return {
      position: { ...this.position },
      buttons: [...this.buttons].sort((left, right) => left - right),
      wheelDelta: this.wheelDelta,
    };
  }
}

export class KeyboardState {
  modifiers: ModifierState = defaultModifiers();
  private readonly pressed = new Set<string>();

  keyDown(key: string, modifiers: Partial<ModifierState> = {}): this {
    this.pressed.add(key);
    this.modifiers = { ...defaultModifiers(), ...modifiers };
    return this;
  }

  keyUp(key: string, modifiers: Partial<ModifierState> = {}): this {
    this.pressed.delete(key);
    this.modifiers = { ...defaultModifiers(), ...modifiers };
    return this;
  }

  isPressed(key: string): boolean {
    return this.pressed.has(key);
  }

  snapshot(): { pressed: string[]; modifiers: ModifierState } {
    return {
      pressed: [...this.pressed].sort(),
      modifiers: { ...this.modifiers },
    };
  }
}

export class TouchState {
  private readonly points = new Map<number, TouchPoint>();

  begin(point: TouchPoint): this {
    this.points.set(point.id, { ...point });
    return this;
  }

  update(point: TouchPoint): this {
    this.points.set(point.id, { ...point });
    return this;
  }

  end(id: number): this {
    this.points.delete(id);
    return this;
  }

  list(): TouchPoint[] {
    return [...this.points.values()].sort((left, right) => left.id - right.id);
  }

  centroid(): InputVector {
    const points = this.list();
    if (points.length === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }
}

export type InputEvent =
  | { readonly type: "mousemove"; readonly x: number; readonly y: number }
  | { readonly type: "mousedown"; readonly button: number }
  | { readonly type: "mouseup"; readonly button: number }
  | { readonly type: "wheel"; readonly delta: number }
  | { readonly type: "keydown"; readonly key: string; readonly modifiers?: Partial<ModifierState> }
  | { readonly type: "keyup"; readonly key: string; readonly modifiers?: Partial<ModifierState> }
  | { readonly type: "touchstart"; readonly point: TouchPoint }
  | { readonly type: "touchmove"; readonly point: TouchPoint }
  | { readonly type: "touchend"; readonly id: number }
  | { readonly type: "gesture"; readonly gesture: GestureResult };

export class InputBinding {
  constructor(
    readonly action: string,
    private readonly matcher: (event: InputEvent, manager: InputManager) => boolean,
  ) {}

  matches(event: InputEvent, manager: InputManager): boolean {
    return this.matcher(event, manager);
  }

  static key(action: string, key: string, modifiers: Partial<ModifierState> = {}): InputBinding {
    return new InputBinding(action, (event, manager) => event.type === "keydown"
      && event.key === key
      && Object.entries(modifiers).every(([name, value]) => manager.keyboard.modifiers[name as keyof ModifierState] === value));
  }

  static mouse(action: string, button: number): InputBinding {
    return new InputBinding(action, (event) => event.type === "mousedown" && event.button === button);
  }

  static gesture(action: string, type: GestureResult["type"]): InputBinding {
    return new InputBinding(action, (event) => event.type === "gesture" && event.gesture.type === type);
  }
}

export class GestureRecognizer {
  recognizePinch(previous: readonly TouchPoint[], current: readonly TouchPoint[]): number | null {
    if (previous.length !== 2 || current.length !== 2) {
      return null;
    }
    const previousDistance = distance(previous[0], previous[1]);
    const currentDistance = distance(current[0], current[1]);
    return previousDistance === 0 ? null : currentDistance / previousDistance;
  }

  recognizeRotate(previous: readonly TouchPoint[], current: readonly TouchPoint[]): number | null {
    if (previous.length !== 2 || current.length !== 2) {
      return null;
    }
    return angle(current[0], current[1]) - angle(previous[0], previous[1]);
  }

  recognizeSwipe(start: InputVector, end: InputVector, threshold = 24): GestureResult | null {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude < threshold) {
      return null;
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { type: "swipe", value: magnitude, direction: dx >= 0 ? "right" : "left" };
    }
    return { type: "swipe", value: magnitude, direction: dy >= 0 ? "down" : "up" };
  }
}

export interface UserInputHandler {
  getBooleanFromUser(message: string): boolean;
  getStringFromUser(message: string): string;
  getIntegerFromUser(message: string): number;
  getDoubleFromUser(message: string): number;
}

export class InputManager {
  static inputHandler: UserInputHandler | null = null;

  static getBooleanFromUser(message: string): boolean {
    return InputManager.inputHandler?.getBooleanFromUser(message) ?? false;
  }

  static getStringFromUser(message: string): string {
    return InputManager.inputHandler?.getStringFromUser(message) ?? "";
  }

  static getIntegerFromUser(message: string): number {
    return InputManager.inputHandler?.getIntegerFromUser(message) ?? 0;
  }

  static getDoubleFromUser(message: string): number {
    return InputManager.inputHandler?.getDoubleFromUser(message) ?? 0;
  }

  readonly mouse = new MouseState();
  readonly keyboard = new KeyboardState();
  readonly touch = new TouchState();
  readonly gestures = new GestureRecognizer();
  private readonly bindings: InputBinding[] = [];
  private lastSwipeStart: InputVector | null = null;

  bind(binding: InputBinding): this {
    this.bindings.push(binding);
    return this;
  }

  dispatch(event: InputEvent): string[] {
    switch (event.type) {
      case "mousemove":
        this.mouse.move(event.x, event.y);
        break;
      case "mousedown":
        this.mouse.press(event.button);
        this.lastSwipeStart = { ...this.mouse.position };
        break;
      case "mouseup":
        this.mouse.release(event.button);
        break;
      case "wheel":
        this.mouse.scroll(event.delta);
        break;
      case "keydown":
        this.keyboard.keyDown(event.key, event.modifiers);
        break;
      case "keyup":
        this.keyboard.keyUp(event.key, event.modifiers);
        break;
      case "touchstart":
        this.touch.begin(event.point);
        break;
      case "touchmove":
        this.touch.update(event.point);
        break;
      case "touchend":
        this.touch.end(event.id);
        break;
      case "gesture":
        break;
      default: {
        const unhandledEvent = event as never;
        throw new Error(`Unhandled input event: ${JSON.stringify(unhandledEvent)}`);
      }
    }
    return this.bindings.filter((binding) => binding.matches(event, this)).map((binding) => binding.action);
  }

  synthesizeSwipe(end: InputVector): GestureResult | null {
    if (!this.lastSwipeStart) {
      return null;
    }
    return this.gestures.recognizeSwipe(this.lastSwipeStart, end);
  }
}
