// ═══════════════════════════════════════════════════════════════════════════
// scene-manager.ts — Multi-scene orchestration for the Alice web prototype
//
// Manages multiple Three.js scenes built from Alice projects, tracks the
// active scene, and fires transition callbacks on scene switches.
// ═══════════════════════════════════════════════════════════════════════════

import type { AliceProject } from "./a3p-parser.js";
import { buildScene, type SceneBuildOptions, type SceneBuildResult } from "./scene-builder.js";

export type SceneTransitionCallback = (fromScene: string, toScene: string) => void;

export class SceneManager {
  private readonly scenes = new Map<string, SceneBuildResult>();
  private activeName: string | null = null;
  private readonly transitionCallbacks: SceneTransitionCallback[] = [];

  get sceneNames(): string[] {
    return [...this.scenes.keys()];
  }

  get activeSceneName(): string | null {
    return this.activeName;
  }

  get sceneCount(): number {
    return this.scenes.size;
  }

  addScene(name: string, project: AliceProject, options?: SceneBuildOptions): void {
    if (this.scenes.has(name)) {
      throw new Error(`Scene "${name}" already exists`);
    }
    const result = buildScene(project, options);
    this.scenes.set(name, result);
    if (this.activeName === null) {
      this.activeName = name;
    }
  }

  removeScene(name: string): boolean {
    if (!this.scenes.has(name)) return false;
    this.scenes.delete(name);
    if (this.activeName === name) {
      this.activeName = null;
    }
    return true;
  }

  getScene(name: string): SceneBuildResult | null {
    return this.scenes.get(name) ?? null;
  }

  getActiveScene(): SceneBuildResult | null {
    if (this.activeName === null) return null;
    return this.scenes.get(this.activeName) ?? null;
  }

  setActive(name: string): void {
    if (!this.scenes.has(name)) {
      throw new Error(`Scene "${name}" does not exist`);
    }
    if (this.activeName === name) return;
    const fromName = this.activeName!;
    this.activeName = name;
    for (const cb of this.transitionCallbacks) {
      cb(fromName, name);
    }
  }

  onTransition(callback: SceneTransitionCallback): void {
    this.transitionCallbacks.push(callback);
  }

  offTransition(callback: SceneTransitionCallback): void {
    const idx = this.transitionCallbacks.indexOf(callback);
    if (idx !== -1) {
      this.transitionCallbacks.splice(idx, 1);
    }
  }
}
