// ═══════════════════════════════════════════════════════════════════════════
// audio.ts — DOM-free audio state machine for the Alice web prototype
//
// Provides AudioPlayer (play/pause/stop with event callbacks),
// AudioResource (data type for loaded audio), and loadAudioFromA3P
// (extracts audio resources from .a3p ZIP archives).
// ═══════════════════════════════════════════════════════════════════════════

import JSZip from "jszip";

/** DOM-free audio resource descriptor. */
export interface AudioResource {
  id: string;
  name: string;
  buffer: ArrayBuffer;
  duration: number;
  format: string;
}

export type AudioPlayerState = "stopped" | "playing" | "paused";
export type AudioEventType = "play" | "pause" | "stop" | "load";
export type AudioEventCallback = () => void;

export class AudioPlayer {
  private _state: AudioPlayerState = "stopped";
  private _volume = 1.0;
  private _resource: AudioResource | null = null;
  private readonly listeners = new Map<AudioEventType, AudioEventCallback[]>();

  get state(): AudioPlayerState {
    return this._state;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
  }

  get resource(): AudioResource | null {
    return this._resource;
  }

  load(res: AudioResource): void {
    if (this._state !== "stopped") {
      this._state = "stopped";
    }
    this._resource = res;
    this.emit("load");
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
  const name = resourcePath.split("/").pop() ?? resourcePath;
  const format = name.split(".").pop() ?? "unknown";
  return {
    id: resourcePath,
    name,
    buffer,
    duration: 0, // actual duration requires codec decoding
    format,
  };
}
