import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import {
  AudioPlayer,
  type AudioResource,
  type AudioBufferLike,
  type AudioPlayerState,
  type AudioEventCallback,
  loadAudioFromA3P,
} from "../src/audio.js";

// ═══════════════════════════════════════════════════════════════════════════
// AudioPlayer & AudioResource — TDD tests (written before implementation)
//
// Tests cover: AudioResource type, AudioPlayer state machine,
//              play/pause/stop, volume, event callbacks,
//              loadAudioFromA3P integration
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResource(overrides?: Partial<AudioResource>): AudioResource {
  return {
    id: "audio-001",
    name: "test-sound",
    buffer: new ArrayBuffer(1024),
    duration: 5.0,
    format: "wav",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AudioResource type
// ---------------------------------------------------------------------------

describe("AudioResource – structure", () => {
  it("has required fields: id, name, buffer, duration, format", () => {
    const res = makeResource();
    expect(res.id).toBe("audio-001");
    expect(res.name).toBe("test-sound");
    expect(res.buffer).toBeInstanceOf(ArrayBuffer);
    expect(res.duration).toBe(5.0);
    expect(res.format).toBe("wav");
  });

  it("can report explicit decode status for truthful runtime behavior", () => {
    const decodedBuffer: AudioBufferLike = { duration: 2.25 };
    const res = makeResource({
      duration: decodedBuffer.duration,
      decodedBuffer,
      decodeStatus: "decoded",
    });
    expect(res.decodeStatus).toBe("decoded");
    expect(res.decodedBuffer).toBe(decodedBuffer);
  });
});

// ---------------------------------------------------------------------------
// AudioPlayer construction
// ---------------------------------------------------------------------------

describe("AudioPlayer – construction", () => {
  it("exports AudioPlayer as a class", () => {
    expect(AudioPlayer).toBeDefined();
    expect(typeof AudioPlayer).toBe("function");
  });

  it("starts in stopped state", () => {
    const player = new AudioPlayer();
    expect(player.state).toBe("stopped");
  });

  it("starts with volume 1.0", () => {
    const player = new AudioPlayer();
    expect(player.volume).toBe(1.0);
  });

  it("starts with no resource loaded", () => {
    const player = new AudioPlayer();
    expect(player.resource).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AudioPlayer – load
// ---------------------------------------------------------------------------

describe("AudioPlayer – load", () => {
  it("loads a resource", () => {
    const player = new AudioPlayer();
    const res = makeResource();
    player.load(res);
    expect(player.resource).toBe(res);
  });

  it("loading a new resource stops current playback", () => {
    const player = new AudioPlayer();
    player.load(makeResource({ id: "a" }));
    player.play();
    expect(player.state).toBe("playing");

    player.load(makeResource({ id: "b" }));
    expect(player.state).toBe("stopped");
    expect(player.resource!.id).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// AudioPlayer – play/pause/stop state machine
// ---------------------------------------------------------------------------

describe("AudioPlayer – state machine", () => {
  let player: AudioPlayer;

  beforeEach(() => {
    player = new AudioPlayer();
    player.load(makeResource());
  });

  it("play() transitions from stopped to playing", () => {
    player.play();
    expect(player.state).toBe("playing");
  });

  it("play() on playing is a no-op (stays playing)", () => {
    player.play();
    player.play();
    expect(player.state).toBe("playing");
  });

  it("pause() transitions from playing to paused", () => {
    player.play();
    player.pause();
    expect(player.state).toBe("paused");
  });

  it("pause() on stopped is a no-op", () => {
    player.pause();
    expect(player.state).toBe("stopped");
  });

  it("pause() on paused is a no-op", () => {
    player.play();
    player.pause();
    player.pause();
    expect(player.state).toBe("paused");
  });

  it("play() resumes from paused to playing", () => {
    player.play();
    player.pause();
    player.play();
    expect(player.state).toBe("playing");
  });

  it("stop() transitions from playing to stopped", () => {
    player.play();
    player.stop();
    expect(player.state).toBe("stopped");
  });

  it("stop() transitions from paused to stopped", () => {
    player.play();
    player.pause();
    player.stop();
    expect(player.state).toBe("stopped");
  });

  it("stop() on stopped is a no-op", () => {
    player.stop();
    expect(player.state).toBe("stopped");
  });

  it("play() without loaded resource throws", () => {
    const emptyPlayer = new AudioPlayer();
    expect(() => emptyPlayer.play()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AudioPlayer – volume
// ---------------------------------------------------------------------------

describe("AudioPlayer – volume", () => {
  it("sets volume within range", () => {
    const player = new AudioPlayer();
    player.volume = 0.5;
    expect(player.volume).toBe(0.5);
  });

  it("clamps volume to 0 (floor)", () => {
    const player = new AudioPlayer();
    player.volume = -0.5;
    expect(player.volume).toBe(0);
  });

  it("clamps volume to 1 (ceiling)", () => {
    const player = new AudioPlayer();
    player.volume = 1.5;
    expect(player.volume).toBe(1);
  });

  it("volume of exactly 0 is allowed", () => {
    const player = new AudioPlayer();
    player.volume = 0;
    expect(player.volume).toBe(0);
  });

  it("volume of exactly 1 is allowed", () => {
    const player = new AudioPlayer();
    player.volume = 1;
    expect(player.volume).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AudioPlayer – event callbacks
// ---------------------------------------------------------------------------

describe("AudioPlayer – events", () => {
  let player: AudioPlayer;

  beforeEach(() => {
    player = new AudioPlayer();
    player.load(makeResource());
  });

  it("fires 'play' event on play()", () => {
    const cb = vi.fn();
    player.on("play", cb);
    player.play();
    expect(cb).toHaveBeenCalledOnce();
  });

  it("fires 'pause' event on pause()", () => {
    const cb = vi.fn();
    player.on("pause", cb);
    player.play();
    player.pause();
    expect(cb).toHaveBeenCalledOnce();
  });

  it("fires 'stop' event on stop()", () => {
    const cb = vi.fn();
    player.on("stop", cb);
    player.play();
    player.stop();
    expect(cb).toHaveBeenCalledOnce();
  });

  it("does not fire 'pause' event when already stopped", () => {
    const cb = vi.fn();
    player.on("pause", cb);
    player.pause(); // no-op
    expect(cb).not.toHaveBeenCalled();
  });

  it("does not fire 'play' event when already playing", () => {
    const cb = vi.fn();
    player.on("play", cb);
    player.play();
    player.play(); // no-op
    expect(cb).toHaveBeenCalledOnce(); // only from first play()
  });

  it("fires 'load' event when loading a resource", () => {
    const freshPlayer = new AudioPlayer();
    const cb = vi.fn();
    freshPlayer.on("load", cb);
    freshPlayer.load(makeResource());
    expect(cb).toHaveBeenCalledOnce();
  });

  it("off() removes an event callback", () => {
    const cb = vi.fn();
    player.on("play", cb);
    player.off("play", cb);
    player.play();
    expect(cb).not.toHaveBeenCalled();
  });

  it("supports multiple callbacks for same event", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    player.on("play", cb1);
    player.on("play", cb2);
    player.play();
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// loadAudioFromA3P
// ---------------------------------------------------------------------------

describe("loadAudioFromA3P", () => {
  it("exports loadAudioFromA3P as a function", () => {
    expect(typeof loadAudioFromA3P).toBe("function");
  });

  it("throws when resource path does not exist in zip", async () => {
    // Create a minimal zip-like ArrayBuffer (empty / invalid)
    const emptyBuffer = new ArrayBuffer(0);
    await expect(
      loadAudioFromA3P(emptyBuffer, "nonexistent/audio.wav"),
    ).rejects.toThrow();
  });

  it("uses an injected decoder to populate duration and decodedBuffer", async () => {
    const zip = new JSZip();
    zip.file("resources/audio/tone.wav", new Uint8Array([1, 2, 3, 4]));
    const archive = await zip.generateAsync({ type: "arraybuffer" });
    const decodedBuffer: AudioBufferLike = { duration: 1.75 };

    const resource = await loadAudioFromA3P(archive, "resources/audio/tone.wav", {
      decodeAudioData: vi.fn(async () => decodedBuffer),
    });

    expect(resource.duration).toBe(1.75);
    expect(resource.decodedBuffer).toBe(decodedBuffer);
    expect(resource.decodeStatus).toBe("decoded");
  });

  it("marks extracted resources metadata-only when decoding is unavailable", async () => {
    const zip = new JSZip();
    zip.file("resources/audio/tone.wav", new Uint8Array([1, 2, 3, 4]));
    const archive = await zip.generateAsync({ type: "arraybuffer" });

    const resource = await loadAudioFromA3P(archive, "resources/audio/tone.wav", {
      decode: false,
    });

    expect(resource.duration).toBe(0);
    expect(resource.decodedBuffer).toBeUndefined();
    expect(resource.decodeStatus).toBe("decode-unavailable");
  });
});
