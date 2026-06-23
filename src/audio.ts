// ═══════════════════════════════════════════════════════════════════════════
// audio.ts — DOM-free audio state machine for the Alice web prototype
//
// Provides AudioPlayer (play/pause/stop with event callbacks),
// SoundResourceManager, SoundGroup, and loadAudioFromA3P.
// ═══════════════════════════════════════════════════════════════════════════

import JSZip from "jszip";
import { assertNoDuplicateZipEntries } from "./zip-entry-validation.js";
import type { Vec3 } from "./story-api/types";

export type AudioDecodeStatus = "decoded" | "decode-unavailable" | "decode-failed";
export type AudioRuntimeMode = "web-audio" | "simulation";

/** Minimal decoded buffer contract used by Web Audio and tests. */
export interface AudioBufferLike {
  duration: number;
}

/** DOM-free audio resource descriptor. */
export interface AudioResource {
  id: string;
  name: string;
  buffer: ArrayBuffer;
  duration: number;
  format: string;
  decodedBuffer?: AudioBufferLike;
  decodeStatus?: AudioDecodeStatus;
  decodeError?: string;
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

export type AudioDecoder = (buffer: ArrayBuffer) => Promise<AudioBufferLike> | AudioBufferLike;

export interface LoadAudioOptions {
  /**
   * Decode bytes with this function. In browsers, pass
   * `audioContext.decodeAudioData.bind(audioContext)` or inject a fake decoder
   * in tests.
   */
  decodeAudioData?: AudioDecoder;
  /** AudioContext-like object used for decoding when decodeAudioData is absent. */
  audioContext?: AudioContextLike;
  /** Set false to explicitly skip decoding and mark the resource metadata-only. */
  decode?: boolean;
  /** Throw when a supplied decoder fails instead of returning decode-failed metadata. */
  requireDecode?: boolean;
}

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
  options: LoadAudioOptions = {},
): Promise<AudioResource> {
  assertNoDuplicateZipEntries(data);
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
  const decoded = await decodeAudioBuffer(buffer, options);
  return {
    id: resourcePath,
    name,
    buffer,
    duration: decoded.buffer?.duration ?? 0,
    format,
    decodedBuffer: decoded.buffer,
    decodeStatus: decoded.status,
    decodeError: decoded.error,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Web Audio API interfaces plus explicit simulation fallback
// ═══════════════════════════════════════════════════════════════════════════

export interface AudioDestinationNodeLike {
  channelCount: number;
}

export interface AudioNodeLike {
  connect(dest: AudioDestinationNodeLike | AudioNodeLike): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: { value: number };
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  onended?: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  sampleRate: number;
  currentTime: number;
  state: string;
  destination: AudioDestinationNodeLike;
  createGain(): GainNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  decodeAudioData?(audioData: ArrayBuffer): Promise<AudioBufferLike>;
  resume?(): Promise<void>;
}

/** @deprecated Use AudioDestinationNodeLike. Simulation mode is explicit via WebAudioPlayer.runtimeMode. */
export type StubAudioDestinationNode = AudioDestinationNodeLike;
/** @deprecated Use GainNodeLike. Simulation mode is explicit via WebAudioPlayer.runtimeMode. */
export type StubGainNode = GainNodeLike;
/** @deprecated Use AudioBufferSourceNodeLike. Simulation mode is explicit via WebAudioPlayer.runtimeMode. */
export type StubAudioBufferSourceNode = AudioBufferSourceNodeLike;
/** @deprecated Use AudioContextLike. Simulation mode is explicit via WebAudioPlayer.runtimeMode. */
export type StubAudioContext = AudioContextLike;

export interface WebAudioPlayerOptions {
  audioContext?: AudioContextLike;
  runtimeMode?: AudioRuntimeMode;
}

interface DecodeResult {
  buffer?: AudioBufferLike;
  status: AudioDecodeStatus;
  error?: string;
}

function resolveDecoder(options: LoadAudioOptions): AudioDecoder | undefined {
  if (options.decode === false) {
    return undefined;
  }
  if (options.decodeAudioData) {
    return options.decodeAudioData;
  }
  if (options.audioContext?.decodeAudioData) {
    return options.audioContext.decodeAudioData.bind(options.audioContext);
  }
  return undefined;
}

async function decodeAudioBuffer(buffer: ArrayBuffer, options: LoadAudioOptions): Promise<DecodeResult> {
  const decoder = resolveDecoder(options);
  if (!decoder) {
    return { status: "decode-unavailable" };
  }
  try {
    const decoded = await decoder(buffer.slice(0));
    if (!Number.isFinite(decoded.duration)) {
      return { buffer: { duration: 0 }, status: "decoded" };
    }
    return { buffer: decoded, status: "decoded" };
  } catch (error) {
    if (options.requireDecode) {
      throw error;
    }
    return {
      status: "decode-failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createSimulationAudioContext(): AudioContextLike {
  const connect = (_dest: AudioDestinationNodeLike | AudioNodeLike): void => {};
  return {
    sampleRate: 44100,
    currentTime: 0,
    state: "simulation",
    destination: { channelCount: 2 },
    createGain: (): GainNodeLike => ({
      gain: { value: 1 },
      connect,
    }),
    createBufferSource: (): AudioBufferSourceNodeLike => ({
      buffer: null,
      loop: false,
      connect,
      start() {},
      stop() {},
    }),
  };
}

function createBrowserAudioContext(): AudioContextLike | null {
  const BrowserAudioContext = globalThis.AudioContext
    ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!BrowserAudioContext) {
    return null;
  }
  try {
    return new BrowserAudioContext() as AudioContextLike;
  } catch {
    return null;
  }
}

export class WebAudioPlayer {
  readonly player: AudioPlayer;
  readonly audioContext: AudioContextLike;
  readonly gainNode: GainNodeLike;
  readonly runtimeMode: AudioRuntimeMode;
  readonly canOutputAudio: boolean;
  private sourceNode: AudioBufferSourceNodeLike | null = null;

  constructor(options: WebAudioPlayerOptions = {}) {
    this.player = new AudioPlayer();
    const browserContext = options.runtimeMode === "simulation"
      ? null
      : options.audioContext ?? createBrowserAudioContext();
    if (options.runtimeMode === "web-audio" && !browserContext) {
      throw new Error("WebAudioPlayer requested web-audio mode, but AudioContext is unavailable");
    }
    this.runtimeMode = browserContext ? "web-audio" : "simulation";
    this.canOutputAudio = this.runtimeMode === "web-audio";
    this.audioContext = browserContext ?? createSimulationAudioContext();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
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
    this.stopSource();
    this.player.load(resource);
  }

  loadFromManager(manager: SoundResourceManager, resourceId: string): void {
    const resource = manager.get(resourceId);
    if (!resource) {
      throw new Error(`Audio resource not found: ${resourceId}`);
    }
    this.load(resource);
  }

  play(): void {
    if (this.player.state === "playing") {
      return;
    }
    if (this.runtimeMode === "web-audio") {
      const resource = this.player.resource;
      if (!resource) {
        this.player.play();
        return;
      }
      if (!resource.decodedBuffer) {
        throw new Error(
          `Cannot output audio: resource '${resource.id}' is not decoded (decodeStatus: ${resource.decodeStatus ?? "unknown"})`,
        );
      }
      const source = this.audioContext.createBufferSource();
      source.buffer = resource.decodedBuffer;
      source.connect(this.gainNode);
      source.onended = () => {
        if (this.sourceNode !== source) {
          return;
        }
        this.sourceNode = null;
        this.player.stop();
      };
      source.start();
      this.sourceNode = source;
    }
    this.player.play();
  }

  pause(): void {
    this.stopSource();
    this.player.pause();
  }

  stop(): void {
    this.stopSource();
    this.player.stop();
  }

  connect(destination?: AudioDestinationNodeLike): void {
    this.gainNode.connect(destination ?? this.audioContext.destination);
  }

  on(event: AudioEventType, callback: AudioEventCallback): void {
    this.player.on(event, callback);
  }

  off(event: AudioEventType, callback: AudioEventCallback): void {
    this.player.off(event, callback);
  }

  private stopSource(): void {
    if (!this.sourceNode) {
      return;
    }
    this.sourceNode.onended = null;
    try {
      this.sourceNode.stop();
    } finally {
      this.sourceNode = null;
    }
  }
}
