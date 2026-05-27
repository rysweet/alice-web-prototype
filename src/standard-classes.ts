export const SMoveDirection = Object.freeze({
  LEFT: "LEFT",
  RIGHT: "RIGHT",
  UP: "UP",
  DOWN: "DOWN",
  FORWARD: "FORWARD",
  BACKWARD: "BACKWARD",
} as const);
export type SMoveDirection = (typeof SMoveDirection)[keyof typeof SMoveDirection];

export const SDirection = Object.freeze({
  ...SMoveDirection,
} as const);
export type SDirection = (typeof SDirection)[keyof typeof SDirection];

export const SJointDirection = Object.freeze({
  LEFT: "LEFT",
  RIGHT: "RIGHT",
  UP: "UP",
  DOWN: "DOWN",
  FORWARD: "FORWARD",
  BACKWARD: "BACKWARD",
} as const);
export type SJointDirection = (typeof SJointDirection)[keyof typeof SJointDirection];

export const STurnDirection = Object.freeze({
  LEFT: "LEFT",
  RIGHT: "RIGHT",
} as const);
export type STurnDirection = (typeof STurnDirection)[keyof typeof STurnDirection];

export const SBipedResource = Object.freeze({
  ALICE: "ALICE",
  PERSON: "PERSON",
  HERO: "HERO",
} as const);
export type SBipedResource = (typeof SBipedResource)[keyof typeof SBipedResource];

export const SQuadrupedResource = Object.freeze({
  CAT: "CAT",
  DOG: "DOG",
  HORSE: "HORSE",
} as const);
export type SQuadrupedResource = (typeof SQuadrupedResource)[keyof typeof SQuadrupedResource];

export const SFlyerResource = Object.freeze({
  EAGLE: "EAGLE",
  OWL: "OWL",
  PARROT: "PARROT",
} as const);
export type SFlyerResource = (typeof SFlyerResource)[keyof typeof SFlyerResource];

export const SPropResource = Object.freeze({
  CHAIR: "CHAIR",
  TABLE: "TABLE",
  TREE: "TREE",
} as const);
export type SPropResource = (typeof SPropResource)[keyof typeof SPropResource];

function assertChannel(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${label} must be an integer between 0 and 255`);
  }
}

export class SColor {
  static readonly BLACK = new SColor(0, 0, 0, "BLACK");
  static readonly BLUE = new SColor(0, 0, 255, "BLUE");
  static readonly GREEN = new SColor(0, 255, 0, "GREEN");
  static readonly RED = new SColor(255, 0, 0, "RED");
  static readonly WHITE = new SColor(255, 255, 255, "WHITE");
  static readonly YELLOW = new SColor(255, 255, 0, "YELLOW");

  constructor(
    public readonly red: number,
    public readonly green: number,
    public readonly blue: number,
    public readonly name: string | null = null,
  ) {
    assertChannel(red, "red");
    assertChannel(green, "green");
    assertChannel(blue, "blue");
  }

  static rgb(red: number, green: number, blue: number): SColor {
    return new SColor(red, green, blue);
  }

  toHex(): string {
    return `#${this.red.toString(16).padStart(2, "0")}${this.green.toString(16).padStart(2, "0")}${this.blue.toString(16).padStart(2, "0")}`;
  }

  equals(other: SColor): boolean {
    return this.red === other.red && this.green === other.green && this.blue === other.blue;
  }
}

export type SDurationStyle = "BEGIN_AND_END_GENTLY" | "LINEAR" | "ABRUPT";

export class SDuration {
  constructor(
    public readonly seconds: number,
    public readonly style: SDurationStyle = "BEGIN_AND_END_GENTLY",
  ) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError("seconds must be a non-negative finite number");
    }
  }

  static seconds(value: number, style: SDurationStyle = "BEGIN_AND_END_GENTLY"): SDuration {
    return new SDuration(value, style);
  }

  toMilliseconds(): number {
    return this.seconds * 1000;
  }
}

export type SceneSetupHandler = (scene: SScene) => void;

export class SScene {
  readonly objects: unknown[] = [];

  constructor(private readonly setupHandler: SceneSetupHandler | null = null) {}

  add(object: unknown): this {
    this.objects.push(object);
    return this;
  }

  setup(): void {
    this.setupHandler?.(this);
  }
}

export class SProgram {
  #isRunning = false;

  constructor(public readonly scene: SScene = new SScene()) {}

  start(): void {
    this.scene.setup();
    this.#isRunning = true;
  }

  get isRunning(): boolean {
    return this.#isRunning;
  }
}
