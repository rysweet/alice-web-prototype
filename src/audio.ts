// ═══════════════════════════════════════════════════════════════════════════
// audio.ts — DOM-free audio state machine for the Alice web prototype
//
// Provides AudioPlayer (play/pause/stop with event callbacks),
// SoundResourceManager, SoundGroup, and loadAudioFromA3P.
// ═══════════════════════════════════════════════════════════════════════════

import JSZip from "jszip";
import type { Vec3 } from "./story-api/types";

/** DOM-free audio resource descriptor. */
export interface AudioResource {
  id: string;
  name: string;
  buffer: ArrayBuffer;
  duration: number;
  format: string;
}

export interface SpatialAudioOptions {
  sourcePosition?: Vec3;
  listenerPosition?: Vec3;
  maxDistance?: number;
  rolloff?: number;
}

export interface SpatialAudioMix {
  volume: number;
  pan: number;
  distance: number;
}

export type AudioPlayerState = "stopped" | "playing" | "paused";
export type AudioEventType = "play" | "pause" | "stop" | "load";
export type AudioEventCallback = () => void;

const ZERO_VEC3: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
}

function assertVec3(value: Vec3, label: string): void {
  assertFiniteNumber(value.x, `${label}.x`);
  assertFiniteNumber(value.y, `${label}.y`);
  assertFiniteNumber(value.z, `${label}.z`);
}

function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class SoundResourceManager {
  private readonly resources = new Map<string, AudioResource>();

  get size(): number {
    return this.resources.size;
  }

  register(resource: AudioResource): void {
    this.resources.set(resource.id, resource);
  }

  registerAll(resources: Iterable<AudioResource>): void {
    for (const resource of resources) {
      this.register(resource);
    }
  }

  get(id: string): AudioResource | undefined {
    return this.resources.get(id);
  }

  has(id: string): boolean {
    return this.resources.has(id);
  }

  remove(id: string): boolean {
    return this.resources.delete(id);
  }

  clear(): void {
    this.resources.clear();
  }

  list(): AudioResource[] {
    return Array.from(this.resources.values());
  }
}

export class SoundGroup {
  private readonly players = new Set<AudioPlayer>();
  private _volume = 1.0;
  private _pan = 0;
  private _muted = false;

  constructor(readonly id: string) {}

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = clamp(value, 0, 1);
  }

  get pan(): number {
    return this._pan;
  }

  set pan(value: number) {
    this._pan = clamp(value, -1, 1);
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
  }

  addPlayer(player: AudioPlayer): void {
    if (player.group === this) {
      return;
    }
    player.group?.removePlayer(player);
    this.players.add(player);
    player.attachGroup(this);
  }

  removePlayer(player: AudioPlayer): void {
    if (this.players.delete(player)) {
      player.attachGroup(null);
    }
  }

  hasPlayer(player: AudioPlayer): boolean {
    return this.players.has(player);
  }

  listPlayers(): AudioPlayer[] {
    return Array.from(this.players);
  }

  pauseAll(): void {
    for (const player of this.players) {
      player.pause();
    }
  }

  stopAll(): void {
    for (const player of this.players) {
      player.stop();
    }
  }
}

export class AudioPlayer {
  private _state: AudioPlayerState = "stopped";
  private _volume = 1.0;
  private _pan = 0;
  private _resource: AudioResource | null = null;
  private _group: SoundGroup | null = null;
  private _spatialEnabled = false;
  private _sourcePosition: Vec3 = ZERO_VEC3;
  private _listenerPosition: Vec3 = ZERO_VEC3;
  private _maxDistance = 10;
  private _rolloff = 1;
  private readonly listeners = new Map<AudioEventType, AudioEventCallback[]>();

  get state(): AudioPlayerState {
    return this._state;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = clamp(value, 0, 1);
  }

  get pan(): number {
    return this._pan;
  }

  set pan(value: number) {
    this._pan = clamp(value, -1, 1);
  }

  get effectiveVolume(): number {
    const groupVolume = this._group?.volume ?? 1;
    const groupMuted = this._group?.muted ?? false;
    const spatialMix = this.getSpatialMix();
    return groupMuted ? 0 : clamp(this._volume * groupVolume * spatialMix.volume, 0, 1);
  }

  get effectivePan(): number {
    const groupPan = this._group?.pan ?? 0;
    return clamp(this._pan + groupPan + this.getSpatialMix().pan, -1, 1);
  }

  get group(): SoundGroup | null {
    return this._group;
  }

  get resource(): AudioResource | null {
    return this._resource;
  }

  get spatialEnabled(): boolean {
    return this._spatialEnabled;
  }

  load(res: AudioResource): void {
    this._state = "stopped";
    this._resource = res;
    this.emit("load");
  }

  loadFromManager(manager: SoundResourceManager, resourceId: string): void {
    const resource = manager.get(resourceId);
    if (!resource) {
      throw new Error(`Audio resource not found: ${resourceId}`);
    }
    this.load(resource);
  }

  play(): void {
    if (this._resource === null) {
      throw new Error("Cannot play: no audio resource loaded");
    }
    if (this._state === "playing") return;
    this._state = "playing";
    this.emit("play");
  }

  pause(): void {
    if (this._state !== "playing") return;
    this._state = "paused";
    this.emit("pause");
  }

  stop(): void {
    if (this._state === "stopped") return;
    this._state = "stopped";
    this.emit("stop");
  }

  configureSpatialAudio(options: SpatialAudioOptions = {}): void {
    if (options.sourcePosition) {
      assertVec3(options.sourcePosition, "sourcePosition");
      this._sourcePosition = options.sourcePosition;
    }
    if (options.listenerPosition) {
      assertVec3(options.listenerPosition, "listenerPosition");
      this._listenerPosition = options.listenerPosition;
    }
    if (options.maxDistance !== undefined) {
      assertFiniteNumber(options.maxDistance, "maxDistance");
      this._maxDistance = Math.max(0, options.maxDistance);
    }
    if (options.rolloff !== undefined) {
      assertFiniteNumber(options.rolloff, "rolloff");
      this._rolloff = Math.max(0, options.rolloff);
    }
    this._spatialEnabled = true;
  }

  disableSpatialAudio(): void {
    this._spatialEnabled = false;
  }

  setSourcePosition(position: Vec3): void {
    assertVec3(position, "sourcePosition");
    this._sourcePosition = position;
    this._spatialEnabled = true;
  }

  setListenerPosition(position: Vec3): void {
    assertVec3(position, "listenerPosition");
    this._listenerPosition = position;
    this._spatialEnabled = true;
  }

  getSpatialMix(): SpatialAudioMix {
    if (!this._spatialEnabled) {
      return { volume: 1, pan: 0, distance: 0 };
    }
    const actualDistance = distance(this._sourcePosition, this._listenerPosition);
    const maxDistance = Math.max(this._maxDistance, 0);
    const distanceRatio = maxDistance === 0 ? 1 : clamp(actualDistance / maxDistance, 0, 1);
    const dryVolume = 1 - distanceRatio;
    const volume = this._rolloff <= 0 ? dryVolume : Math.pow(dryVolume, this._rolloff);
    const pan = maxDistance === 0
      ? 0
      : clamp((this._sourcePosition.x - this._listenerPosition.x) / maxDistance, -1, 1);
    return {
      volume,
      pan,
      distance: actualDistance,
    };
  }

  on(event: AudioEventType, callback: AudioEventCallback): void {
    const cbs = this.listeners.get(event) ?? [];
    cbs.push(callback);
    this.listeners.set(event, cbs);
  }

  off(event: AudioEventType, callback: AudioEventCallback): void {
    const cbs = this.listeners.get(event);
    if (!cbs) return;
    const idx = cbs.indexOf(callback);
    if (idx !== -1) cbs.splice(idx, 1);
  }

  attachGroup(group: SoundGroup | null): void {
    this._group = group;
  }

  private emit(event: AudioEventType): void {
    const cbs = this.listeners.get(event);
    if (!cbs) return;
    for (const cb of cbs) {
      cb();
    }
  }
}

/**
 * Extract an audio resource from an .a3p ZIP archive.
 * Throws if the resource path does not exist in the archive.
 */
export async function loadAudioFromA3P(
  data: ArrayBuffer | Uint8Array,
  resourcePath: string,
): Promise<AudioResource> {
  const zip = await JSZip.loadAsync(data);
  const entry = zip.file(resourcePath);
  if (!entry) {
    throw new Error(`Audio resource not found in .a3p archive: ${resourcePath}`);
  }
  const buffer = await entry.async("arraybuffer");
  const lastSlash = resourcePath.lastIndexOf("/");
  const name = lastSlash !== -1 ? resourcePath.slice(lastSlash + 1) : resourcePath;
  const lastDot = name.lastIndexOf(".");
  const format = lastDot !== -1 ? name.slice(lastDot + 1) : "unknown";
  return {
    id: resourcePath,
    name,
    buffer,
    duration: 0,
    format,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Stub Web Audio API interfaces for DOM-free testing and parity
// ═══════════════════════════════════════════════════════════════════════════

export interface StubAudioDestinationNode {
  channelCount: number;
}

export interface StubGainNode {
  gain: { value: number };
  connect(dest: StubAudioDestinationNode | StubGainNode): void;
}

export interface StubAudioBufferSourceNode {
  buffer: ArrayBuffer | null;
  loop: boolean;
  connect(dest: StubGainNode): void;
  start(): void;
  stop(): void;
}

export interface StubAudioContext {
  sampleRate: number;
  currentTime: number;
  state: string;
  destination: StubAudioDestinationNode;
  createGain(): StubGainNode;
  createBufferSource(): StubAudioBufferSourceNode;
}

export class WebAudioPlayer {
  readonly player: AudioPlayer;
  readonly audioContext: StubAudioContext;
  readonly gainNode: StubGainNode;

  constructor() {
    this.player = new AudioPlayer();
    this.gainNode = {
      gain: { value: 1 },
      connect(_dest: StubAudioDestinationNode | StubGainNode) {},
    };
    this.audioContext = {
      sampleRate: 44100,
      currentTime: 0,
      state: "running",
      destination: { channelCount: 2 },
      createGain: (): StubGainNode => ({
        gain: { value: 1 },
        connect(_dest: StubAudioDestinationNode | StubGainNode) {},
      }),
      createBufferSource: (): StubAudioBufferSourceNode => ({
        buffer: null,
        loop: false,
        connect(_dest: StubGainNode) {},
        start() {},
        stop() {},
      }),
    };
  }

  get state(): AudioPlayerState {
    return this.player.state;
  }

  get volume(): number {
    return this.player.volume;
  }

  get pan(): number {
    return this.player.pan;
  }

  set pan(value: number) {
    this.player.pan = value;
  }

  get resource(): AudioResource | null {
    return this.player.resource;
  }

  setVolume(value: number): void {
    this.player.volume = clamp(value, 0, 1);
    this.gainNode.gain.value = this.player.volume;
  }

  load(resource: AudioResource): void {
    this.player.load(resource);
  }

  loadFromManager(manager: SoundResourceManager, resourceId: string): void {
    this.player.loadFromManager(manager, resourceId);
  }

  play(): void {
    this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  stop(): void {
    this.player.stop();
  }

  connect(destination?: StubAudioDestinationNode): void {
    this.gainNode.connect(destination ?? this.audioContext.destination);
  }

  on(event: AudioEventType, callback: AudioEventCallback): void {
    this.player.on(event, callback);
  }

  off(event: AudioEventType, callback: AudioEventCallback): void {
    this.player.off(event, callback);
  }
}
