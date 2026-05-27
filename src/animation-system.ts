export type InterpolationMode = "step" | "linear" | "cubic";
export type AnimationValue = number | Record<string, number>;

export interface Keyframe<T extends AnimationValue> {
  timeMs: number;
  value: T;
  interpolation?: InterpolationMode;
}

export interface AnimationTransition {
  from: string;
  to: string;
  durationMs: number;
}

function isPoseValue(value: AnimationValue): value is Record<string, number> {
  return typeof value === "object" && value !== null;
}

function cloneValue<T extends AnimationValue>(value: T): T {
  if (isPoseValue(value)) {
    return { ...(value as Record<string, number>) } as T;
  }
  return value;
}

function blendScalar(from: number, to: number, weight: number): number {
  return from + ((to - from) * weight);
}

function smoothStep(weight: number): number {
  return weight * weight * (3 - (2 * weight));
}

function blendValue<T extends AnimationValue>(from: T, to: T, weight: number): T {
  if (!isPoseValue(from) && !isPoseValue(to)) {
    return blendScalar(from, to, weight) as T;
  }
  const keys = new Set<string>([
    ...Object.keys(isPoseValue(from) ? from : {}),
    ...Object.keys(isPoseValue(to) ? to : {}),
  ]);
  const blended: Record<string, number> = {};
  keys.forEach((key) => {
    const fromValue = isPoseValue(from) ? (from[key] ?? 0) : 0;
    const toValue = isPoseValue(to) ? (to[key] ?? 0) : 0;
    blended[key] = blendScalar(fromValue, toValue, weight);
  });
  return blended as T;
}

function addValue<T extends AnimationValue>(base: T, delta: T, weight: number, mask?: ReadonlySet<string>): T {
  if (!isPoseValue(base) && !isPoseValue(delta)) {
    const baseNumber = base as number;
    const deltaNumber = delta as number;
    return (baseNumber + (deltaNumber * weight)) as T;
  }
  const result: Record<string, number> = isPoseValue(base) ? { ...base } : {};
  if (isPoseValue(delta)) {
    Object.entries(delta).forEach(([key, value]) => {
      if (!mask || mask.has(key)) {
        result[key] = (result[key] ?? 0) + (value * weight);
      }
    });
  }
  return result as T;
}

function blendMaskedValue<T extends AnimationValue>(
  base: T,
  overlay: T,
  weight: number,
  mask?: ReadonlySet<string>,
): T {
  if (!isPoseValue(base) && !isPoseValue(overlay)) {
    return blendValue(base, overlay, weight);
  }
  const result: Record<string, number> = isPoseValue(base) ? { ...base } : {};
  if (isPoseValue(overlay)) {
    Object.entries(overlay).forEach(([key, value]) => {
      if (!mask || mask.has(key)) {
        result[key] = blendScalar(result[key] ?? 0, value, weight);
      }
    });
  }
  return result as T;
}

export class AnimationEvent {
  constructor(
    readonly name: string,
    readonly timeMs: number,
    readonly payload: unknown = null,
  ) {}

  firesBetween(previousTimeMs: number, currentTimeMs: number): boolean {
    return previousTimeMs < this.timeMs && currentTimeMs >= this.timeMs;
  }
}

export class AnimationClip<T extends AnimationValue> {
  readonly durationMs: number;
  private readonly keyframes: Keyframe<T>[];

  constructor(
    readonly name: string,
    keyframes: readonly Keyframe<T>[],
    readonly defaultInterpolation: InterpolationMode = "linear",
    readonly events: readonly AnimationEvent[] = [],
  ) {
    if (keyframes.length === 0) {
      throw new Error("animation clip requires at least one keyframe");
    }
    this.keyframes = [...keyframes].sort((left, right) => left.timeMs - right.timeMs);
    this.durationMs = this.keyframes[this.keyframes.length - 1]!.timeMs;
  }

  sample(timeMs: number): T {
    if (timeMs <= this.keyframes[0]!.timeMs) {
      return cloneValue(this.keyframes[0]!.value);
    }
    if (timeMs >= this.durationMs) {
      return cloneValue(this.keyframes[this.keyframes.length - 1]!.value);
    }
    for (let index = 1; index < this.keyframes.length; index += 1) {
      const current = this.keyframes[index]!;
      const previous = this.keyframes[index - 1]!;
      if (timeMs <= current.timeMs) {
        const span = current.timeMs - previous.timeMs;
        const rawWeight = span === 0 ? 1 : (timeMs - previous.timeMs) / span;
        const interpolation = current.interpolation ?? this.defaultInterpolation;
        if (interpolation === "step") {
          return cloneValue(previous.value);
        }
        const weight = interpolation === "cubic" ? smoothStep(rawWeight) : rawWeight;
        return blendValue(previous.value, current.value, weight);
      }
    }
    return cloneValue(this.keyframes[this.keyframes.length - 1]!.value);
  }

  eventsBetween(previousTimeMs: number, currentTimeMs: number): AnimationEvent[] {
    return this.events.filter((event) => event.firesBetween(previousTimeMs, currentTimeMs));
  }
}

export class AnimationLayer<T extends AnimationValue> {
  readonly mask: ReadonlySet<string> | null;

  constructor(
    readonly name: string,
    readonly mode: "additive" | "override",
    readonly weight = 1,
    mask: readonly string[] = [],
  ) {
    this.mask = mask.length > 0 ? new Set(mask) : null;
  }

  apply(base: T, layerValue: T): T {
    return this.mode === "additive"
      ? addValue(base, layerValue, this.weight, this.mask ?? undefined)
      : blendMaskedValue(base, layerValue, this.weight, this.mask ?? undefined);
  }
}

export class AnimationMixer<T extends AnimationValue> {
  private readonly clips = new Map<string, { clip: AnimationClip<T>; weight: number }>();

  addClip(id: string, clip: AnimationClip<T>, weight = 1): void {
    this.clips.set(id, { clip, weight });
  }

  setWeight(id: string, weight: number): void {
    const entry = this.clips.get(id);
    if (!entry) {
      throw new Error(`animation clip "${id}" is not registered`);
    }
    entry.weight = weight;
  }

  evaluate(timeMs: number): T {
    const entries = [...this.clips.values()].filter((entry) => entry.weight > 0);
    if (entries.length === 0) {
      throw new Error("animation mixer requires at least one weighted clip");
    }
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    const first = entries[0]!;
    let result = cloneValue(first.clip.sample(timeMs));
    let accumulated = first.weight / totalWeight;
    for (let index = 1; index < entries.length; index += 1) {
      const entry = entries[index]!;
      const normalized = entry.weight / totalWeight;
      const localWeight = normalized / (accumulated + normalized);
      result = blendValue(result, entry.clip.sample(timeMs), localWeight);
      accumulated += normalized;
    }
    return result;
  }
}

export class CrossFade<T extends AnimationValue> {
  constructor(readonly durationMs: number) {}

  weights(elapsedMs: number): { from: number; to: number; complete: boolean } {
    if (this.durationMs <= 0) {
      return { from: 0, to: 1, complete: true };
    }
    const clamped = Math.min(Math.max(elapsedMs / this.durationMs, 0), 1);
    return {
      from: 1 - clamped,
      to: clamped,
      complete: clamped === 1,
    };
  }

  blend(from: T, to: T, elapsedMs: number): T {
    return blendValue(from, to, this.weights(elapsedMs).to);
  }
}

export class AnimationController<T extends AnimationValue> {
  private readonly states = new Map<string, AnimationClip<T>>();
  private readonly transitions = new Map<string, AnimationTransition>();
  private currentStateName: string | null = null;
  private currentTimeMs = 0;
  private crossFade:
    | {
        fromState: string;
        fromTimeMs: number;
        elapsedMs: number;
        fade: CrossFade<T>;
      }
    | null = null;

  addState(name: string, clip: AnimationClip<T>): void {
    this.states.set(name, clip);
    if (this.currentStateName === null) {
      this.currentStateName = name;
      this.currentTimeMs = 0;
    }
  }

  addTransition(from: string, to: string, durationMs: number): void {
    this.transitions.set(`${from}->${to}`, { from, to, durationMs });
  }

  getCurrentState(): string | null {
    return this.currentStateName;
  }

  setState(name: string): void {
    this.requireState(name);
    this.currentStateName = name;
    this.currentTimeMs = 0;
    this.crossFade = null;
  }

  requestState(name: string): void {
    this.requireState(name);
    if (this.currentStateName === name) {
      return;
    }
    if (!this.currentStateName) {
      this.setState(name);
      return;
    }
    const transition = this.transitions.get(`${this.currentStateName}->${name}`);
    if (!transition) {
      this.setState(name);
      return;
    }
    this.crossFade = {
      fromState: this.currentStateName,
      fromTimeMs: this.currentTimeMs,
      elapsedMs: 0,
      fade: new CrossFade<T>(transition.durationMs),
    };
    this.currentStateName = name;
    this.currentTimeMs = 0;
  }

  advance(deltaMs: number): T {
    if (!this.currentStateName) {
      throw new Error("animation controller has no active state");
    }
    this.currentTimeMs += Math.max(deltaMs, 0);
    const currentClip = this.requireState(this.currentStateName);
    const currentSample = currentClip.sample(this.currentTimeMs);
    if (!this.crossFade) {
      return currentSample;
    }
    this.crossFade.elapsedMs += Math.max(deltaMs, 0);
    this.crossFade.fromTimeMs += Math.max(deltaMs, 0);
    const fromClip = this.requireState(this.crossFade.fromState);
    const blended = this.crossFade.fade.blend(
      fromClip.sample(this.crossFade.fromTimeMs),
      currentSample,
      this.crossFade.elapsedMs,
    );
    if (this.crossFade.fade.weights(this.crossFade.elapsedMs).complete) {
      this.crossFade = null;
    }
    return blended;
  }

  private requireState(name: string): AnimationClip<T> {
    const clip = this.states.get(name);
    if (!clip) {
      throw new Error(`animation state "${name}" does not exist`);
    }
    return clip;
  }
}

export class Retargeting {
  constructor(
    private readonly boneMap: Record<string, string>,
    private readonly scale = 1,
  ) {}

  retargetPose(sourcePose: Record<string, number>): Record<string, number> {
    const targetPose: Record<string, number> = {};
    Object.entries(this.boneMap).forEach(([sourceBone, targetBone]) => {
      targetPose[targetBone] = (sourcePose[sourceBone] ?? 0) * this.scale;
    });
    return targetPose;
  }
}
