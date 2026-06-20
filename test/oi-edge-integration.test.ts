// Outside-in scenario 2: Edge cases & cross-module integration
import { describe, it, expect, vi } from "vitest";
import { AudioPlayer, type AudioResource } from "../src/audio.js";
import { SceneManager } from "../src/scene-manager.js";
import { parseTweedle } from "../src/tweedle-parser.js";
import { generateTweedle, generateExpression } from "../src/tweedle-codegen.js";
import type { AliceProject } from "../src/a3p-parser.js";
import type { Expression } from "../src/tweedle-parser.js";

function makeProject(name: string): AliceProject {
  return {
    version: "3.6",
    projectName: name,
    sceneObjects: [],
    methods: [],
  };
}

describe("Outside-In Scenario 2: Edge cases & integration", () => {
  describe("AudioPlayer edge cases", () => {
    it("double play is idempotent", () => {
      const player = new AudioPlayer();
      const res: AudioResource = { id: "x", name: "a.wav", buffer: new ArrayBuffer(1), duration: 1, format: "wav" };
      player.load(res);
      player.play();
      player.play();
      expect(player.state).toBe("playing");
    });

    it("pause when stopped is no-op", () => {
      const player = new AudioPlayer();
      player.pause();
      expect(player.state).toBe("stopped");
    });

    it("stop when already stopped is no-op", () => {
      const player = new AudioPlayer();
      player.stop();
      expect(player.state).toBe("stopped");
    });

    it("event callbacks fire in order", () => {
      const player = new AudioPlayer();
      const events: string[] = [];
      player.on("load", () => events.push("load"));
      player.on("play", () => events.push("play"));
      player.on("pause", () => events.push("pause"));
      player.on("stop", () => events.push("stop"));
      const res: AudioResource = { id: "x", name: "a.mp3", buffer: new ArrayBuffer(1), duration: 1, format: "mp3" };
      player.load(res);
      player.play();
      player.pause();
      player.play();
      player.stop();
      expect(events).toEqual(["load", "play", "pause", "play", "stop"]);
    });

    it("off removes specific callback", () => {
      const player = new AudioPlayer();
      const events: string[] = [];
      const cb = () => events.push("fired");
      player.on("play", cb);
      player.off("play", cb);
      const res: AudioResource = { id: "x", name: "a.mp3", buffer: new ArrayBuffer(1), duration: 1, format: "mp3" };
      player.load(res);
      player.play();
      expect(events).toEqual([]);
    });
  });

  describe("Tweedle new constructs end-to-end (parse → codegen roundtrip)", () => {
    it("while loop roundtrips through parse and codegen", () => {
      const ast = parseTweedle(`class X { void m() { while (this.active) { this.step(); } } }`);
      const stmt = ast.methods[0].body[0];
      expect(stmt.type).toBe("WhileLoop");
      const code = generateTweedle(ast);
      expect(code).toContain("while");
    });

    it("try/catch roundtrips", () => {
      const ast = parseTweedle(`class X { void m() { try { this.risky(); } catch (e Exception) { this.handle(); } } }`);
      const stmt = ast.methods[0].body[0];
      expect(stmt.type).toBe("TryCatch");
      const code = generateTweedle(ast);
      expect(code).toContain("try");
      expect(code).toContain("catch");
    });

    it("switch/case roundtrips", () => {
      const ast = parseTweedle(`class X { void m() { switch (this.x) { case 1: { this.one(); } default: { this.other(); } } } }`);
      const stmt = ast.methods[0].body[0];
      expect(stmt.type).toBe("SwitchCase");
      const code = generateTweedle(ast);
      expect(code).toContain("switch");
      expect(code).toContain("case");
    });

    it("array literal roundtrips via generateExpression", () => {
      const expr: Expression = {
        type: "ArrayLiteral",
        elements: [
          { type: "Literal", value: 1, literalType: "number" },
          { type: "Literal", value: 2, literalType: "number" },
        ],
      } as Expression;
      const code = generateExpression(expr);
      expect(code).toBe("{1, 2}");
    });

    it("doTogether block roundtrips", () => {
      const ast = parseTweedle(`class X { void m() { doTogether { this.up(); this.right(); } } }`);
      const stmt = ast.methods[0].body[0];
      expect(stmt.type).toBe("DoTogether");
      const code = generateTweedle(ast);
      expect(code).toContain("doTogether");
    });

    it("string concatenation roundtrips", () => {
      const ast = parseTweedle(`class X { void m() { String s <- "hello" .. " world"; } }`);
      const stmt = ast.methods[0].body[0];
      expect(stmt.type).toBe("LocalVariableDeclaration");
      const code = generateTweedle(ast);
      expect(code).toContain("..");
    });
  });

  describe("SceneManager transition edge cases", () => {
    it("setActive throws for non-existent scene", () => {
      const mgr = new SceneManager();
      expect(() => mgr.setActive("a")).toThrow('does not exist');
    });

    it("offTransition removes callback", () => {
      const mgr = new SceneManager();
      mgr.addScene("a", makeProject("A"));
      mgr.addScene("b", makeProject("B"));
      const cb = vi.fn();
      mgr.onTransition(cb);
      mgr.offTransition(cb);
      mgr.setActive("b");
      expect(cb).not.toHaveBeenCalled();
      expect(mgr.activeSceneName).toBe("b");
    });
  });
});
