import { describe, it, expect, vi } from "vitest";
import {
  AudioPlayer,
  SoundResourceManager,
  type AudioResource,
  WebAudioPlayer,
  type StubAudioContext,
  type StubGainNode,
  type StubAudioBufferSourceNode,
  type StubAudioDestinationNode,
} from "../src/audio.js";

// ═══════════════════════════════════════════════════════════════════════════
// WebAudioPlayer — TDD tests (written before implementation)
//
// WebAudioPlayer composes (wraps) AudioPlayer, adding stub Web Audio API
// interfaces: StubAudioContext, StubGainNode, StubAudioBufferSourceNode,
// StubAudioDestinationNode. It delegates play/pause/stop/volume to the
// inner AudioPlayer and exposes audioContext for graph wiring.
// ═══════════════════════════════════════════════════════════════════════════

function makeResource(overrides?: Partial<AudioResource>): AudioResource {
  return {
    id: "snd-001",
    name: "test-sound",
    buffer: new ArrayBuffer(1024),
    duration: 3.0,
    format: "wav",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stub interface types
// ---------------------------------------------------------------------------

describe("WebAudioPlayer — stub interfaces are exported", () => {
  it("exports StubAudioContext interface (compile-time check)", () => {
    const ctx: StubAudioContext = {
      sampleRate: 44100,
      currentTime: 0,
      state: "running",
      destination: { channelCount: 2 } as StubAudioDestinationNode,
      createGain(): StubGainNode {
        return {
          gain: { value: 1 },
          connect(_dest: StubAudioDestinationNode | StubGainNode) {},
        };
      },
      createBufferSource(): StubAudioBufferSourceNode {
        return {
          buffer: null,
          loop: false,
          connect(_dest: StubGainNode) {},
          start() {},
          stop() {},
        };
      },
    };
    expect(ctx.sampleRate).toBe(44100);
  });

  it("exports StubAudioDestinationNode interface", () => {
    const dest: StubAudioDestinationNode = { channelCount: 2 };
    expect(dest.channelCount).toBe(2);
  });

  it("exports StubGainNode interface", () => {
    const gain: StubGainNode = {
      gain: { value: 0.5 },
      connect(_dest: StubAudioDestinationNode | StubGainNode) {},
    };
    expect(gain.gain.value).toBe(0.5);
  });

  it("exports StubAudioBufferSourceNode interface", () => {
    const src: StubAudioBufferSourceNode = {
      buffer: null,
      loop: false,
      connect(_dest: StubGainNode) {},
      start() {},
      stop() {},
    };
    expect(src.buffer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WebAudioPlayer construction
// ---------------------------------------------------------------------------

describe("WebAudioPlayer — construction", () => {
  it("exports WebAudioPlayer as a class", () => {
    expect(WebAudioPlayer).toBeDefined();
    expect(typeof WebAudioPlayer).toBe("function");
  });

  it("constructs with no arguments", () => {
    const wap = new WebAudioPlayer();
    expect(wap).toBeInstanceOf(WebAudioPlayer);
  });

  it("wraps an inner AudioPlayer", () => {
    const wap = new WebAudioPlayer();
    expect(wap.player).toBeInstanceOf(AudioPlayer);
  });

  it("exposes audioContext as StubAudioContext", () => {
    const wap = new WebAudioPlayer();
    const ctx = wap.audioContext;
    expect(ctx).toBeDefined();
    expect(ctx.sampleRate).toBe(44100);
    expect(ctx.state).toBe("running");
    expect(typeof ctx.currentTime).toBe("number");
    expect(ctx.destination).toBeDefined();
    expect(ctx.destination.channelCount).toBe(2);
  });

  it("exposes gainNode as StubGainNode", () => {
    const wap = new WebAudioPlayer();
    const gain = wap.gainNode;
    expect(gain).toBeDefined();
    expect(gain.gain.value).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// WebAudioPlayer — state delegation
// ---------------------------------------------------------------------------

describe("WebAudioPlayer — state delegation", () => {
  it("starts in stopped state", () => {
    const wap = new WebAudioPlayer();
    expect(wap.state).toBe("stopped");
  });

  it("play() transitions to playing (requires loaded resource)", () => {
    const wap = new WebAudioPlayer();
    wap.load(makeResource());
    wap.play();
    expect(wap.state).toBe("playing");
  });

  it("pause() transitions to paused", () => {
    const wap = new WebAudioPlayer();
    wap.load(makeResource());
    wap.play();
    wap.pause();
    expect(wap.state).toBe("paused");
  });

  it("stop() transitions to stopped", () => {
    const wap = new WebAudioPlayer();
    wap.load(makeResource());
    wap.play();
    wap.stop();
    expect(wap.state).toBe("stopped");
  });

  it("play without resource throws", () => {
    const wap = new WebAudioPlayer();
    expect(() => wap.play()).toThrow("no audio resource loaded");
  });
});

// ---------------------------------------------------------------------------
// WebAudioPlayer — volume
// ---------------------------------------------------------------------------

describe("WebAudioPlayer — volume", () => {
  it("initial volume is 1.0", () => {
    const wap = new WebAudioPlayer();
    expect(wap.volume).toBe(1);
  });

  it("setVolume clamps to [0, 1]", () => {
    const wap = new WebAudioPlayer();
    wap.setVolume(0.5);
    expect(wap.volume).toBe(0.5);

    wap.setVolume(-1);
    expect(wap.volume).toBe(0);

    wap.setVolume(2);
    expect(wap.volume).toBe(1);
  });

  it("setVolume updates the gain node value", () => {
    const wap = new WebAudioPlayer();
    wap.setVolume(0.3);
    expect(wap.gainNode.gain.value).toBeCloseTo(0.3, 5);
  });
});

// ---------------------------------------------------------------------------
// WebAudioPlayer — load
// ---------------------------------------------------------------------------

describe("WebAudioPlayer — load", () => {
  it("load() accepts an AudioResource and delegates to inner player", () => {
    const wap = new WebAudioPlayer();
    const res = makeResource();
    wap.load(res);
    expect(wap.resource).toBe(res);
  });

  it("loadFromManager() resolves resource by id", () => {
    const wap = new WebAudioPlayer();
    const manager = new SoundResourceManager();
    const res = makeResource({ id: "effect-1" });
    manager.register(res);
    wap.loadFromManager(manager, "effect-1");
    expect(wap.resource).toBe(res);
  });

  it("loadFromManager() throws for unknown resource id", () => {
    const wap = new WebAudioPlayer();
    const manager = new SoundResourceManager();
    expect(() => wap.loadFromManager(manager, "nonexistent")).toThrow(
      "Audio resource not found",
    );
  });
});

// ---------------------------------------------------------------------------
// WebAudioPlayer — connect (Web Audio graph stub)
// ---------------------------------------------------------------------------

describe("WebAudioPlayer — connect", () => {
  it("connect() wires gain to destination (no-throw stub)", () => {
    const wap = new WebAudioPlayer();
    expect(() => wap.connect()).not.toThrow();
  });

  it("connect(destination) accepts a custom StubAudioDestinationNode", () => {
    const wap = new WebAudioPlayer();
    const customDest: StubAudioDestinationNode = { channelCount: 6 };
    expect(() => wap.connect(customDest)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// WebAudioPlayer — event forwarding
// ---------------------------------------------------------------------------

describe("WebAudioPlayer — events", () => {
  it("on/off delegates to inner player events", () => {
    const wap = new WebAudioPlayer();
    const cb = vi.fn();
    wap.on("play", cb);
    wap.load(makeResource());
    wap.play();
    expect(cb).toHaveBeenCalledTimes(1);

    wap.off("play", cb);
    wap.stop();
    wap.play();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("load event fires when resource is loaded", () => {
    const wap = new WebAudioPlayer();
    const cb = vi.fn();
    wap.on("load", cb);
    wap.load(makeResource());
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// WebAudioPlayer — resource property
// ---------------------------------------------------------------------------

describe("WebAudioPlayer — resource", () => {
  it("resource is null before any load", () => {
    const wap = new WebAudioPlayer();
    expect(wap.resource).toBeNull();
  });

  it("resource reflects the loaded resource", () => {
    const wap = new WebAudioPlayer();
    const res = makeResource({ id: "abc" });
    wap.load(res);
    expect(wap.resource?.id).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// WebAudioPlayer — pan delegation
// ---------------------------------------------------------------------------

describe("WebAudioPlayer — pan", () => {
  it("pan defaults to 0", () => {
    const wap = new WebAudioPlayer();
    expect(wap.pan).toBe(0);
  });

  it("pan setter clamps to [-1, 1]", () => {
    const wap = new WebAudioPlayer();
    wap.pan = 0.75;
    expect(wap.pan).toBe(0.75);

    wap.pan = -5;
    expect(wap.pan).toBe(-1);

    wap.pan = 5;
    expect(wap.pan).toBe(1);
  });
});
