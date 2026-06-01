import { describe, it, expect } from "vitest";
import {
  SayOutLoudAnimation,
  type SpeechUtterance,
} from "../src/entity-animation.js";
import type { AnimationClipState } from "../src/animation/core.js";

// ═══════════════════════════════════════════════════════════════════════════
// SayOutLoudAnimation — TDD tests (written before implementation)
//
// SayOutLoudAnimation implements AnimationClip for browser-TTS parity.
// It stubs SpeechSynthesisUtterance via the SpeechUtterance interface.
// Duration is estimated as (text.length / (rate * 5)) * 1000 ms.
// The utterance is created immediately on construction ("apply on construct").
// It does NOT delegate to ImmediateAnimation — it accumulates deltaMs itself.
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// SpeechUtterance interface
// ---------------------------------------------------------------------------

describe("SpeechUtterance — stub interface", () => {
  it("exports SpeechUtterance interface (compile-time check)", () => {
    const utterance: SpeechUtterance = {
      text: "Hello world",
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
    };
    expect(utterance.text).toBe("Hello world");
    expect(utterance.rate).toBe(1.0);
    expect(utterance.pitch).toBe(1.0);
    expect(utterance.volume).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// SayOutLoudAnimation — construction
// ---------------------------------------------------------------------------

describe("SayOutLoudAnimation — construction", () => {
  it("exports SayOutLoudAnimation as a class", () => {
    expect(SayOutLoudAnimation).toBeDefined();
    expect(typeof SayOutLoudAnimation).toBe("function");
  });

  it("constructs with required text", () => {
    const anim = new SayOutLoudAnimation({ text: "Hello" });
    expect(anim).toBeInstanceOf(SayOutLoudAnimation);
  });

  it("exposes the utterance created at construction time", () => {
    const anim = new SayOutLoudAnimation({ text: "Test utterance" });
    expect(anim.utterance).toBeDefined();
    expect(anim.utterance.text).toBe("Test utterance");
  });

  it("utterance is created immediately on construction (not lazily on update)", () => {
    const anim = new SayOutLoudAnimation({ text: "Immediate" });
    // Before any update, utterance should already exist
    expect(anim.utterance.text).toBe("Immediate");
  });
});

// ---------------------------------------------------------------------------
// SayOutLoudAnimation — duration estimation
// ---------------------------------------------------------------------------

describe("SayOutLoudAnimation — duration estimation", () => {
  it("calculates duration as (text.length / (rate * 5)) * 1000 ms at rate 1.0", () => {
    // "Hello" = 5 chars, rate 1.0 → (5 / (1.0 * 5)) * 1000 = 1000 ms
    const anim = new SayOutLoudAnimation({ text: "Hello" });
    expect(anim.durationMs).toBe(1000);
  });

  it("duration scales inversely with rate", () => {
    // "Hello World!" = 12 chars, rate 2.0 → (12 / (2.0 * 5)) * 1000 = 1200 ms
    const anim = new SayOutLoudAnimation({ text: "Hello World!", rate: 2.0 });
    expect(anim.durationMs).toBe(1200);
  });

  it("default rate is 1.0 when not specified", () => {
    const anim = new SayOutLoudAnimation({ text: "ABCDE" });
    // 5 chars at rate 1.0 → 1000 ms
    expect(anim.durationMs).toBe(1000);
    expect(anim.utterance.rate).toBe(1.0);
  });

  it("empty text produces 0ms duration", () => {
    const anim = new SayOutLoudAnimation({ text: "" });
    expect(anim.durationMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SayOutLoudAnimation — utterance options
// ---------------------------------------------------------------------------

describe("SayOutLoudAnimation — utterance options", () => {
  it("defaults: rate 1.0, pitch 1.0, volume 1.0", () => {
    const anim = new SayOutLoudAnimation({ text: "Default" });
    expect(anim.utterance.rate).toBe(1.0);
    expect(anim.utterance.pitch).toBe(1.0);
    expect(anim.utterance.volume).toBe(1.0);
  });

  it("accepts custom rate, pitch, volume", () => {
    const anim = new SayOutLoudAnimation({
      text: "Custom",
      rate: 1.5,
      pitch: 0.8,
      volume: 0.6,
    });
    expect(anim.utterance.rate).toBe(1.5);
    expect(anim.utterance.pitch).toBe(0.8);
    expect(anim.utterance.volume).toBe(0.6);
  });

  it("clamps volume to [0, 1]", () => {
    const high = new SayOutLoudAnimation({ text: "X", volume: 5 });
    expect(high.utterance.volume).toBe(1);

    const low = new SayOutLoudAnimation({ text: "X", volume: -3 });
    expect(low.utterance.volume).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SayOutLoudAnimation — validation
// ---------------------------------------------------------------------------

describe("SayOutLoudAnimation — validation", () => {
  it("throws on rate <= 0", () => {
    expect(() => new SayOutLoudAnimation({ text: "Bad", rate: 0 })).toThrow();
    expect(() => new SayOutLoudAnimation({ text: "Bad", rate: -1 })).toThrow();
  });

  it("throws on pitch <= 0", () => {
    expect(() => new SayOutLoudAnimation({ text: "Bad", pitch: 0 })).toThrow();
    expect(() => new SayOutLoudAnimation({ text: "Bad", pitch: -0.5 })).toThrow();
  });

  it("throws on non-finite rate", () => {
    expect(() => new SayOutLoudAnimation({ text: "Bad", rate: NaN })).toThrow();
    expect(() => new SayOutLoudAnimation({ text: "Bad", rate: Infinity })).toThrow();
  });

  it("throws on non-finite pitch", () => {
    expect(() => new SayOutLoudAnimation({ text: "Bad", pitch: NaN })).toThrow();
    expect(() => new SayOutLoudAnimation({ text: "Bad", pitch: Infinity })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SayOutLoudAnimation — AnimationClip interface
// ---------------------------------------------------------------------------

describe("SayOutLoudAnimation — AnimationClip update lifecycle", () => {
  it("starts not complete", () => {
    const anim = new SayOutLoudAnimation({ text: "Hello" });
    expect(anim.complete).toBe(false);
    expect(anim.isComplete).toBe(false);
    expect(anim.progress).toBe(0);
    expect(anim.elapsedMs).toBe(0);
  });

  it("accumulates deltaMs across update calls", () => {
    // "Hello" = 5 chars, rate 1.0 → 1000ms
    const anim = new SayOutLoudAnimation({ text: "Hello" });

    const state1 = anim.update(300);
    expect(state1.elapsedMs).toBe(300);
    expect(state1.durationMs).toBe(1000);
    expect(state1.progress).toBeCloseTo(0.3, 5);
    expect(state1.complete).toBe(false);

    const state2 = anim.update(400);
    expect(state2.elapsedMs).toBe(700);
    expect(state2.progress).toBeCloseTo(0.7, 5);
    expect(state2.complete).toBe(false);
  });

  it("completes when accumulated time reaches durationMs", () => {
    const anim = new SayOutLoudAnimation({ text: "Hello" }); // 1000ms
    anim.update(500);
    const state = anim.update(500);
    expect(state.complete).toBe(true);
    expect(state.progress).toBe(1);
    expect(anim.complete).toBe(true);
    expect(anim.isComplete).toBe(true);
  });

  it("completes when accumulated time exceeds durationMs", () => {
    const anim = new SayOutLoudAnimation({ text: "Hello" }); // 1000ms
    const state = anim.update(2000);
    expect(state.complete).toBe(true);
    expect(state.progress).toBe(1);
    expect(state.elapsedMs).toBe(1000); // capped at durationMs
  });

  it("empty text completes immediately", () => {
    const anim = new SayOutLoudAnimation({ text: "" });
    expect(anim.durationMs).toBe(0);
    expect(anim.complete).toBe(true);
    expect(anim.progress).toBe(1);
  });

  it("update() returns AnimationClipState shape", () => {
    const anim = new SayOutLoudAnimation({ text: "Hello" });
    const state: AnimationClipState = anim.update(100);
    expect(state).toHaveProperty("elapsedMs");
    expect(state).toHaveProperty("durationMs");
    expect(state).toHaveProperty("progress");
    expect(state).toHaveProperty("complete");
  });

  it("negative deltaMs is treated as zero (no backward movement)", () => {
    const anim = new SayOutLoudAnimation({ text: "Hello" }); // 1000ms
    anim.update(500);
    const state = anim.update(-200);
    expect(state.elapsedMs).toBe(500); // unchanged
  });
});

// ---------------------------------------------------------------------------
// SayOutLoudAnimation — reset
// ---------------------------------------------------------------------------

describe("SayOutLoudAnimation — reset", () => {
  it("reset() returns animation to initial state", () => {
    const anim = new SayOutLoudAnimation({ text: "Hello" });
    anim.update(1000); // complete
    expect(anim.complete).toBe(true);

    anim.reset();
    expect(anim.complete).toBe(false);
    expect(anim.elapsedMs).toBe(0);
    expect(anim.progress).toBe(0);
  });

  it("reset() allows replay", () => {
    const anim = new SayOutLoudAnimation({ text: "Hello" });
    anim.update(1000);
    anim.reset();
    const state = anim.update(500);
    expect(state.elapsedMs).toBe(500);
    expect(state.complete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SayOutLoudAnimation — text property
// ---------------------------------------------------------------------------

describe("SayOutLoudAnimation — text property", () => {
  it("exposes the original text", () => {
    const anim = new SayOutLoudAnimation({ text: "The quick brown fox" });
    expect(anim.text).toBe("The quick brown fox");
  });
});
