import { describe, expect, it, beforeEach } from 'vitest';
import {
  AdapterFactory, BoxAdapter, SphereAdapter, CylinderAdapter,
  DiscAdapter, TorusAdapter, VisualAdapter, AmbientLightAdapter,
  DirectionalLightAdapter, SpotLightAdapter, CameraAdapter,
  SceneAdapter, DEFAULT_APPEARANCE, RenderAdapter,
} from '../src/renderer-adapters';
import type { SceneGraphNode } from '../src/renderer-adapters';

function node(id: string, type: string): SceneGraphNode {
  return { id, type };
}

class TrackingAdapter extends RenderAdapter {
  disposeCalls = 0;

  update() { this.markClean(); }
  dispose() { this.disposeCalls += 1; }
}

describe('AdapterFactory', () => {
  beforeEach(() => { AdapterFactory.forgetAll(); });

  it('registers and creates adapters', () => {
    AdapterFactory.register('box', BoxAdapter);
    const adapter = AdapterFactory.create(node('b1', 'box'));
    expect(adapter).toBeInstanceOf(BoxAdapter);
    expect(AdapterFactory.instanceCount).toBe(1);
  });

  it('returns null for unknown types', () => {
    expect(AdapterFactory.create(node('x', 'unknown'))).toBeNull();
  });

  it('retrieves by id', () => {
    AdapterFactory.register('box', BoxAdapter);
    AdapterFactory.create(node('b1', 'box'));
    expect(AdapterFactory.get('b1')).toBeInstanceOf(BoxAdapter);
    expect(AdapterFactory.get('missing')).toBeNull();
  });

  it('disposes and forgets', () => {
    AdapterFactory.register('box', BoxAdapter);
    AdapterFactory.create(node('b1', 'box'));
    AdapterFactory.dispose('b1');
    expect(AdapterFactory.instanceCount).toBe(0);
  });

  it('calls adapter dispose before deleting the instance', () => {
    AdapterFactory.register('tracking-dispose', TrackingAdapter);
    const adapter = AdapterFactory.create(node('tracked', 'tracking-dispose')) as TrackingAdapter;
    AdapterFactory.dispose('tracked');
    expect(adapter.disposeCalls).toBe(1);
    expect(AdapterFactory.get('tracked')).toBeNull();
  });

  it('forgetAll clears everything', () => {
    AdapterFactory.register('box', BoxAdapter);
    AdapterFactory.create(node('a', 'box'));
    AdapterFactory.create(node('b', 'box'));
    AdapterFactory.forgetAll();
    expect(AdapterFactory.instanceCount).toBe(0);
  });

  it('forgetAll disposes each tracked adapter', () => {
    AdapterFactory.register('tracking-forget-all', TrackingAdapter);
    const first = AdapterFactory.create(node('first', 'tracking-forget-all')) as TrackingAdapter;
    const second = AdapterFactory.create(node('second', 'tracking-forget-all')) as TrackingAdapter;
    AdapterFactory.forgetAll();
    expect(first.disposeCalls).toBe(1);
    expect(second.disposeCalls).toBe(1);
    expect(AdapterFactory.instanceCount).toBe(0);
  });
});

describe('resource-free adapter disposal', () => {
  const adapters = [
    ['BoxAdapter', BoxAdapter, 'box'],
    ['SphereAdapter', SphereAdapter, 'sphere'],
    ['CylinderAdapter', CylinderAdapter, 'cylinder'],
    ['DiscAdapter', DiscAdapter, 'disc'],
    ['TorusAdapter', TorusAdapter, 'torus'],
    ['AmbientLightAdapter', AmbientLightAdapter, 'ambient'],
    ['DirectionalLightAdapter', DirectionalLightAdapter, 'directional'],
    ['SpotLightAdapter', SpotLightAdapter, 'spot'],
    ['CameraAdapter', CameraAdapter, 'camera'],
  ] as const;

  it.each(adapters)('%s declares that dispose has no render resources to release', (_name, Adapter, type) => {
    const adapter = new Adapter(node(`resource-free-${type}`, type));
    expect(adapter.ownsDisposableResources).toBe(false);
    expect(() => adapter.dispose()).not.toThrow();
  });
});

describe('BoxAdapter', () => {
  it('computes volume', () => {
    const box = new BoxAdapter(node('b', 'box'));
    box.params = { width: 2, height: 3, depth: 4 };
    expect(box.volume).toBe(24);
  });
  it('computes surface area', () => {
    const box = new BoxAdapter(node('b', 'box'));
    box.params = { width: 1, height: 1, depth: 1 };
    expect(box.surfaceArea).toBe(6);
  });
  it('tracks dirty state', () => {
    const box = new BoxAdapter(node('b', 'box'));
    expect(box.isDirty).toBe(true);
    box.update();
    expect(box.isDirty).toBe(false);
    box.markDirty();
    expect(box.isDirty).toBe(true);
  });
});

describe('SphereAdapter', () => {
  it('computes volume', () => {
    const sphere = new SphereAdapter(node('s', 'sphere'));
    sphere.params.radius = 1;
    expect(sphere.volume).toBeCloseTo(4.189, 2);
  });
  it('computes surface area', () => {
    const sphere = new SphereAdapter(node('s', 'sphere'));
    sphere.params.radius = 1;
    expect(sphere.surfaceArea).toBeCloseTo(12.566, 2);
  });
  it('computes vertex count', () => {
    const sphere = new SphereAdapter(node('s', 'sphere'));
    sphere.params = { radius: 1, widthSegments: 8, heightSegments: 4 };
    expect(sphere.vertexCount).toBe(45);
  });
});

describe('CylinderAdapter', () => {
  it('computes volume for equal radii', () => {
    const cyl = new CylinderAdapter(node('c', 'cylinder'));
    cyl.params = { radiusTop: 1, radiusBottom: 1, height: 2, segments: 32 };
    expect(cyl.volume).toBeCloseTo(Math.PI * 2, 2);
  });
  it('computes volume for cone', () => {
    const cyl = new CylinderAdapter(node('c', 'cylinder'));
    cyl.params = { radiusTop: 0, radiusBottom: 1, height: 3, segments: 32 };
    expect(cyl.volume).toBeCloseTo(Math.PI, 2);
  });
});

describe('DiscAdapter', () => {
  it('computes area', () => {
    const disc = new DiscAdapter(node('d', 'disc'));
    disc.params = { innerRadius: 0, outerRadius: 1, segments: 32 };
    expect(disc.area).toBeCloseTo(Math.PI, 2);
  });
  it('computes ring area', () => {
    const disc = new DiscAdapter(node('d', 'disc'));
    disc.params = { innerRadius: 0.5, outerRadius: 1, segments: 32 };
    expect(disc.area).toBeCloseTo(Math.PI * 0.75, 2);
  });
});

describe('TorusAdapter', () => {
  it('computes volume', () => {
    const torus = new TorusAdapter(node('t', 'torus'));
    torus.params = { radius: 2, tube: 0.5, radialSegments: 16, tubularSegments: 48 };
    expect(torus.volume).toBeCloseTo(2 * Math.PI ** 2 * 2 * 0.25, 2);
  });
  it('computes surface area', () => {
    const torus = new TorusAdapter(node('t', 'torus'));
    torus.params = { radius: 2, tube: 0.5, radialSegments: 16, tubularSegments: 48 };
    expect(torus.surfaceArea).toBeCloseTo(4 * Math.PI ** 2 * 2 * 0.5, 2);
  });
});

describe('VisualAdapter', () => {
  it('has default appearance', () => {
    const vis = new VisualAdapter(node('v', 'visual'));
    expect(vis.appearance.opacity).toBe(1);
    expect(vis.isTransparent).toBe(false);
  });
  it('detects transparency', () => {
    const vis = new VisualAdapter(node('v', 'visual'));
    vis.appearance.opacity = 0.5;
    expect(vis.isTransparent).toBe(true);
  });
  it('detects emissive', () => {
    const vis = new VisualAdapter(node('v', 'visual'));
    expect(vis.isEmissive).toBe(false);
    vis.appearance.emissiveColor = { r: 1, g: 0, b: 0 };
    expect(vis.isEmissive).toBe(true);
  });
  it('updates geometry adapter', () => {
    const vis = new VisualAdapter(node('v', 'visual'));
    const geo = new BoxAdapter(node('b', 'box'));
    vis.geometryAdapter = geo;
    expect(geo.isDirty).toBe(true);
    vis.update();
    expect(geo.isDirty).toBe(false);
  });
  it('disposes and releases geometry adapter', () => {
    const vis = new VisualAdapter(node('v', 'visual'));
    const geo = new TrackingAdapter(node('b', 'tracking'));
    vis.geometryAdapter = geo;
    vis.dispose();
    expect(geo.disposeCalls).toBe(1);
    expect(vis.geometryAdapter).toBeNull();
  });
});

describe('Light adapters', () => {
  it('ambient has intensity', () => {
    const light = new AmbientLightAdapter(node('a', 'ambient'));
    expect(light.params.intensity).toBe(0.5);
  });
  it('directional has direction', () => {
    const light = new DirectionalLightAdapter(node('d', 'directional'));
    expect(light.params.direction.y).toBe(-1);
  });
  it('spot computes cone radius', () => {
    const light = new SpotLightAdapter(node('s', 'spot'));
    light.params.angle = Math.PI / 4;
    light.params.distance = 10;
    expect(light.coneRadius).toBeCloseTo(10, 0);
  });
});

describe('CameraAdapter', () => {
  it('produces 16-element projection matrix', () => {
    const cam = new CameraAdapter(node('c', 'camera'));
    expect(cam.projectionMatrix).toHaveLength(16);
  });
  it('screenToRay produces normalized direction', () => {
    const cam = new CameraAdapter(node('c', 'camera'));
    const ray = cam.screenToRay(0.5, 0.5);
    const len = Math.sqrt(ray.direction.x ** 2 + ray.direction.y ** 2 + ray.direction.z ** 2);
    expect(len).toBeCloseTo(1, 5);
  });
  it('center ray points forward', () => {
    const cam = new CameraAdapter(node('c', 'camera'));
    const ray = cam.screenToRay(0.5, 0.5);
    expect(ray.direction.z).toBeLessThan(0);
    expect(Math.abs(ray.direction.x)).toBeLessThan(0.01);
  });
});

describe('SceneAdapter', () => {
  it('manages children', () => {
    const scene = new SceneAdapter(node('s', 'scene'));
    const box = new BoxAdapter(node('b', 'box'));
    scene.addChild(box);
    expect(scene.childCount).toBe(1);
    scene.removeChild(box);
    expect(scene.childCount).toBe(0);
  });
  it('updates dirty children', () => {
    const scene = new SceneAdapter(node('s', 'scene'));
    const box = new BoxAdapter(node('b', 'box'));
    scene.addChild(box);
    expect(box.isDirty).toBe(true);
    scene.update();
    expect(box.isDirty).toBe(false);
  });
  it('dispose clears children', () => {
    const scene = new SceneAdapter(node('s', 'scene'));
    const first = new TrackingAdapter(node('a', 'tracking'));
    const second = new TrackingAdapter(node('b', 'tracking'));
    scene.addChild(first);
    scene.addChild(second);
    scene.dispose();
    expect(first.disposeCalls).toBe(1);
    expect(second.disposeCalls).toBe(1);
    expect(scene.childCount).toBe(0);
  });
});
