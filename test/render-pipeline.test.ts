import { describe, expect, it } from 'vitest';
import {
  RenderBatch, RenderLayer, FrameStats, RenderLoop,
  isSphereInFrustum, buildFrustumPlanes, distanceToPlane,
  sortBackToFront, sortFrontToBack,
} from '../src/render-pipeline';
import type { Renderable } from '../src/render-pipeline';

function renderable(id: string, layer: RenderLayer, sortOrder = 0): Renderable & { rendered: boolean } {
  return { id, layer, sortOrder, visible: true, rendered: false, render() { this.rendered = true; } };
}

describe('RenderBatch', () => {
  it('sorts by layer then sortOrder', () => {
    const batch = new RenderBatch();
    batch.add(renderable('overlay', RenderLayer.OVERLAY, 0));
    batch.add(renderable('opaque1', RenderLayer.OPAQUE, 2));
    batch.add(renderable('opaque0', RenderLayer.OPAQUE, 1));
    batch.add(renderable('bg', RenderLayer.BACKGROUND, 0));
    const sorted = batch.getSorted();
    expect(sorted.map(s => s.id)).toEqual(['bg', 'opaque0', 'opaque1', 'overlay']);
  });

  it('filters invisible items', () => {
    const batch = new RenderBatch();
    const visible = renderable('a', RenderLayer.OPAQUE);
    const hidden = renderable('b', RenderLayer.OPAQUE);
    hidden.visible = false;
    batch.add(visible);
    batch.add(hidden);
    expect(batch.getSorted()).toHaveLength(1);
  });

  it('getByLayer filters correctly', () => {
    const batch = new RenderBatch();
    batch.add(renderable('a', RenderLayer.OPAQUE));
    batch.add(renderable('b', RenderLayer.TRANSPARENT));
    batch.add(renderable('c', RenderLayer.OPAQUE));
    expect(batch.getByLayer(RenderLayer.OPAQUE)).toHaveLength(2);
    expect(batch.getByLayer(RenderLayer.TRANSPARENT)).toHaveLength(1);
  });

  it('renderAll calls render on each visible item', () => {
    const batch = new RenderBatch();
    const a = renderable('a', RenderLayer.OPAQUE);
    const b = renderable('b', RenderLayer.TRANSPARENT);
    batch.add(a);
    batch.add(b);
    batch.renderAll(0.016);
    expect(a.rendered).toBe(true);
    expect(b.rendered).toBe(true);
  });

  it('remove works', () => {
    const batch = new RenderBatch();
    batch.add(renderable('a', RenderLayer.OPAQUE));
    batch.add(renderable('b', RenderLayer.OPAQUE));
    batch.remove('a');
    expect(batch.count).toBe(1);
  });
});

describe('FrameStats', () => {
  it('tracks draw calls and triangles', () => {
    const stats = new FrameStats();
    stats.beginFrame();
    stats.recordDraw(100);
    stats.recordDraw(200);
    expect(stats.drawCalls).toBe(2);
    expect(stats.triangles).toBe(300);
  });

  it('computes average frame time', () => {
    const stats = new FrameStats();
    stats.endFrame(16);
    stats.endFrame(17);
    stats.endFrame(15);
    expect(stats.averageFrameTime).toBe(16);
  });

  it('computes fps from frame time', () => {
    const stats = new FrameStats();
    stats.endFrame(16.67);
    expect(stats.fps).toBeCloseTo(60, 0);
  });

  it('tracks min/max frame time', () => {
    const stats = new FrameStats();
    stats.endFrame(10);
    stats.endFrame(20);
    stats.endFrame(15);
    expect(stats.minFrameTime).toBe(10);
    expect(stats.maxFrameTime).toBe(20);
  });

  it('detects stability', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 10; i++) stats.endFrame(16.67);
    expect(stats.isStable).toBe(true);
  });

  it('detects instability', () => {
    const stats = new FrameStats();
    stats.endFrame(5);
    stats.endFrame(50);
    stats.endFrame(5);
    stats.endFrame(50);
    expect(stats.isStable).toBe(false);
  });

  it('limits samples', () => {
    const stats = new FrameStats(3);
    stats.endFrame(10);
    stats.endFrame(20);
    stats.endFrame(30);
    stats.endFrame(40);
    expect(stats.averageFrameTime).toBe(30);
  });
});

describe('Frustum culling', () => {
  it('sphere inside frustum is visible', () => {
    const planes = buildFrustumPlanes(60, 16 / 9, 0.1, 1000);
    expect(isSphereInFrustum(planes, { center: { x: 0, y: 0, z: -50 }, radius: 1 })).toBe(true);
  });

  it('sphere behind camera is culled', () => {
    const planes = buildFrustumPlanes(60, 16 / 9, 0.1, 1000);
    expect(isSphereInFrustum(planes, { center: { x: 0, y: 0, z: 50 }, radius: 1 })).toBe(false);
  });

  it('sphere beyond far plane is culled', () => {
    const planes = buildFrustumPlanes(60, 16 / 9, 0.1, 100);
    expect(isSphereInFrustum(planes, { center: { x: 0, y: 0, z: -200 }, radius: 1 })).toBe(false);
  });

  it('distanceToPlane is positive in front', () => {
    const plane = { normal: { x: 0, y: 0, z: 1 }, distance: 0 };
    expect(distanceToPlane(plane, { x: 0, y: 0, z: 5 })).toBe(5);
    expect(distanceToPlane(plane, { x: 0, y: 0, z: -5 })).toBe(-5);
  });
});

describe('Depth sorting', () => {
  it('sortBackToFront puts far objects first', () => {
    const items = [
      { id: 'near', distanceToCamera: 5 },
      { id: 'far', distanceToCamera: 50 },
      { id: 'mid', distanceToCamera: 20 },
    ];
    expect(sortBackToFront(items).map(i => i.id)).toEqual(['far', 'mid', 'near']);
  });

  it('sortFrontToBack puts near objects first', () => {
    const items = [
      { id: 'far', distanceToCamera: 50 },
      { id: 'near', distanceToCamera: 5 },
    ];
    expect(sortFrontToBack(items).map(i => i.id)).toEqual(['near', 'far']);
  });
});

describe('RenderLoop', () => {
  it('starts in stopped state', () => {
    const loop = new RenderLoop();
    expect(loop.state).toBe('stopped');
  });

  it('start transitions to running', () => {
    const loop = new RenderLoop();
    loop.start(() => {});
    expect(loop.state).toBe('running');
  });

  it('pause and resume', () => {
    const loop = new RenderLoop();
    loop.start(() => {});
    loop.pause();
    expect(loop.state).toBe('paused');
    loop.resume();
    expect(loop.state).toBe('running');
  });

  it('tick executes callback at target fps', () => {
    const loop = new RenderLoop(60);
    let called = false;
    loop.start((dt) => { called = true; });
    
    loop.tick(0); // first tick sets baseline
    loop.tick(17); // 17ms later // 17ms > 16.67ms frame interval
    expect(called).toBe(true);
    expect(loop.totalFrames).toBe(1);
  });

  it('tick skips when paused', () => {
    const loop = new RenderLoop(60);
    loop.start(() => {});
    loop.pause();
    expect(loop.tick(100)).toBe(false);
  });

  it('setTargetFps clamps', () => {
    const loop = new RenderLoop();
    loop.setTargetFps(0);
    expect(loop.targetFps).toBe(1);
    loop.setTargetFps(999);
    expect(loop.targetFps).toBe(240);
  });
});
