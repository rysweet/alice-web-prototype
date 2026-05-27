import { DEFAULT_STYLE, PropertyAnimation, lerpScalar, lerpVec3, nlerp, type AnimationStyleLike } from "./animation";
import { SCamera, SThing } from "./story-api";
import { cloneOrientation, clonePosition, type Orientation, type Position } from "./story-api/expanded-types";
import { quaternionFromAxisAngle, rotateVector } from "./story-api/expanded-math";

export type ProjectionMode = "perspective" | "orthographic";

export class PointOfView {
  constructor(
    readonly position: Position,
    readonly orientation: Orientation,
    readonly fieldOfView: number,
  ) {}

  static capture(camera: SCamera): PointOfView {
    return new PointOfView(clonePosition(camera.position), cloneOrientation(camera.orientation), camera.getFieldOfView());
  }
}

export class CameraMarker extends PointOfView {
  constructor(
    readonly name: string,
    position: Position,
    orientation: Orientation,
    fieldOfView: number,
  ) {
    super(position, orientation, fieldOfView);
  }

  static fromCamera(name: string, camera: SCamera): CameraMarker {
    const pointOfView = PointOfView.capture(camera);
    return new CameraMarker(name, pointOfView.position, pointOfView.orientation, pointOfView.fieldOfView);
  }
}

export class CameraInterpolation {
  readonly #positionAnimation: PropertyAnimation<Position>;
  readonly #orientationAnimation: PropertyAnimation<Orientation>;
  readonly #fieldOfViewAnimation: PropertyAnimation<number>;

  constructor(
    readonly camera: SCamera,
    readonly from: PointOfView,
    readonly to: PointOfView,
    readonly durationMs: number,
    readonly easing: AnimationStyleLike = DEFAULT_STYLE,
  ) {
    const positionProperty = camera.imp.getProperty<Position>("position")!;
    const orientationProperty = camera.imp.getProperty<Orientation>("orientation")!;
    const fieldOfViewProperty = camera.imp.getProperty<number>("verticalViewingAngle")!;
    camera.position = from.position;
    camera.orientation = from.orientation;
    camera.setFieldOfView(from.fieldOfView);
    this.#positionAnimation = new PropertyAnimation<Position>({
      from: from.position,
      to: to.position,
      durationMs,
      easing,
      interpolate: lerpVec3,
      setValue: (value) => {
        positionProperty.setValue(value);
      },
    });
    this.#orientationAnimation = new PropertyAnimation<Orientation>({
      from: from.orientation,
      to: to.orientation,
      durationMs,
      easing,
      interpolate: nlerp,
      setValue: (value) => {
        orientationProperty.setValue(value);
      },
    });
    this.#fieldOfViewAnimation = new PropertyAnimation<number>({
      from: from.fieldOfView,
      to: to.fieldOfView,
      durationMs,
      easing,
      interpolate: lerpScalar,
      setValue: (value) => {
        fieldOfViewProperty.setValue(value);
        camera.horizontalViewingAngle = value;
      },
    });
  }

  get isComplete(): boolean {
    return this.#positionAnimation.isComplete && this.#orientationAnimation.isComplete && this.#fieldOfViewAnimation.isComplete;
  }

  update(deltaMs: number): PointOfView {
    this.#positionAnimation.update(deltaMs);
    this.#orientationAnimation.update(deltaMs);
    this.#fieldOfViewAnimation.update(deltaMs);
    return PointOfView.capture(this.camera);
  }

  reset(): void {
    this.#positionAnimation.reset();
    this.#orientationAnimation.reset();
    this.#fieldOfViewAnimation.reset();
  }
}

export class CameraImplementation {
  readonly #markers = new Map<string, CameraMarker>();
  #projectionMode: ProjectionMode = "perspective";
  #orthographicWidth = 10;
  #orthographicHeight = 10;

  constructor(readonly camera: SCamera) {}

  get projectionMode(): ProjectionMode {
    return this.#projectionMode;
  }

  setProjectionMode(mode: ProjectionMode): void {
    this.#projectionMode = mode;
  }

  setOrthographicExtents(width: number, height: number): void {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new TypeError("orthographic extents must be positive finite numbers");
    }
    this.#orthographicWidth = width;
    this.#orthographicHeight = height;
  }

  get orthographicExtents(): { width: number; height: number } {
    return { width: this.#orthographicWidth, height: this.#orthographicHeight };
  }

  capturePointOfView(): PointOfView {
    return PointOfView.capture(this.camera);
  }

  applyPointOfView(pointOfView: PointOfView): void {
    this.camera.position = pointOfView.position;
    this.camera.orientation = pointOfView.orientation;
    this.camera.setFieldOfView(pointOfView.fieldOfView);
  }

  saveMarker(name: string): CameraMarker {
    const marker = CameraMarker.fromCamera(name, this.camera);
    this.#markers.set(name, marker);
    return marker;
  }

  getMarker(name: string): CameraMarker | undefined {
    return this.#markers.get(name);
  }

  listMarkers(): CameraMarker[] {
    return [...this.#markers.values()];
  }
}

type PositionedThing = SThing & { position: Position };

export class CameraNavigation {
  constructor(readonly implementation: CameraImplementation) {}

  get camera(): SCamera {
    return this.implementation.camera;
  }

  orbit(target: PositionedThing, revolutions: number, radius = this.distanceTo(target)): PointOfView {
    const center = target.position;
    const offset = {
      x: this.camera.position.x - center.x,
      y: this.camera.position.y - center.y,
      z: this.camera.position.z - center.z,
    };
    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : Math.max(Math.hypot(offset.x, offset.y, offset.z), 1);
    const rotation = quaternionFromAxisAngle(0, 1, 0, revolutions * Math.PI * 2);
    const rotated = rotateVector(rotation, {
      x: offset.x === 0 && offset.y === 0 && offset.z === 0 ? 0 : offset.x,
      y: offset.y,
      z: offset.x === 0 && offset.y === 0 && offset.z === 0 ? safeRadius : offset.z,
    });
    this.camera.position = {
      x: center.x + rotated.x,
      y: center.y + rotated.y,
      z: center.z + rotated.z,
    };
    this.camera.pointAt(target);
    return this.implementation.capturePointOfView();
  }

  pan(delta: Position): PointOfView {
    this.camera.position = {
      x: this.camera.position.x + delta.x,
      y: this.camera.position.y + delta.y,
      z: this.camera.position.z + delta.z,
    };
    return this.implementation.capturePointOfView();
  }

  zoom(deltaFieldOfView: number): PointOfView {
    const next = Math.max(0.05, this.camera.getFieldOfView() - deltaFieldOfView);
    this.camera.setFieldOfView(next);
    return this.implementation.capturePointOfView();
  }

  flyThrough(marker: CameraMarker, durationMs: number, easing: AnimationStyleLike = DEFAULT_STYLE): CameraInterpolation {
    return new CameraInterpolation(this.camera, this.implementation.capturePointOfView(), marker, durationMs, easing);
  }

  private distanceTo(target: PositionedThing): number {
    const dx = this.camera.position.x - target.position.x;
    const dy = this.camera.position.y - target.position.y;
    const dz = this.camera.position.z - target.position.z;
    return Math.hypot(dx, dy, dz);
  }
}

export class ViewpointManager {
  readonly #markers = new Map<string, CameraMarker>();
  readonly #order: string[] = [];
  #index = -1;

  constructor(readonly implementation: CameraImplementation) {}

  save(name: string): CameraMarker {
    const marker = this.implementation.saveMarker(name);
    if (!this.#markers.has(name)) {
      this.#order.push(name);
    }
    this.#markers.set(name, marker);
    return marker;
  }

  add(marker: CameraMarker): void {
    if (!this.#markers.has(marker.name)) {
      this.#order.push(marker.name);
    }
    this.#markers.set(marker.name, marker);
  }

  get(name: string): CameraMarker | undefined {
    return this.#markers.get(name);
  }

  list(): CameraMarker[] {
    return this.#order.map((name) => this.#markers.get(name)!).filter(Boolean);
  }

  cycle(step = 1): CameraMarker | null {
    if (this.#order.length === 0) {
      return null;
    }
    if (this.#index < 0) {
      this.#index = 0;
    } else {
      this.#index = (this.#index + step + this.#order.length) % this.#order.length;
    }
    const marker = this.#markers.get(this.#order[this.#index]!)!;
    this.implementation.applyPointOfView(marker);
    return marker;
  }
}
