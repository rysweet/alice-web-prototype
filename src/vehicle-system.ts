import {
  SCamera,
  SThing,
  type Orientation,
  type Position,
} from "./story-api";

const ZERO_POSITION: Position = { x: 0, y: 0, z: 0 };
const IDENTITY_ORIENTATION: Orientation = { x: 0, y: 0, z: 0, w: 1 };

function clonePosition(position: Position): Position {
  return { x: position.x, y: position.y, z: position.z };
}

function cloneOrientation(orientation: Orientation): Orientation {
  return { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w };
}

export interface VehicleTransform {
  readonly positionInVehicleSpace: Position;
  readonly orientationInVehicleSpace: Orientation;
  readonly absolutePosition: Position;
  readonly absoluteOrientation: Orientation;
}

export function setVehicle(child: SThing, vehicle: SThing | null): void {
  child.imp.setVehicle(vehicle?.imp ?? null);
}

export function getVehicle(entity: SThing): SThing | null {
  return (entity.imp.vehicle?.owner as SThing | undefined) ?? null;
}

export function getPositionInVehicleSpace(entity: SThing): Position {
  return clonePosition(entity.imp.getProperty<Position>("position")?.value ?? ZERO_POSITION);
}

export function setPositionInVehicleSpace(entity: SThing, position: Position): void {
  entity.imp.getProperty<Position>("position")?.setValue(position);
}

export function getOrientationInVehicleSpace(entity: SThing): Orientation {
  return cloneOrientation(entity.imp.getProperty<Orientation>("orientation")?.value ?? IDENTITY_ORIENTATION);
}

export function setOrientationInVehicleSpace(entity: SThing, orientation: Orientation): void {
  entity.imp.getProperty<Orientation>("orientation")?.setValue(orientation);
}

export function resolveVehicleChain(entity: SThing): SThing[] {
  const chain: SThing[] = [entity];
  let current = getVehicle(entity);
  while (current) {
    chain.unshift(current);
    current = getVehicle(current);
  }
  return chain;
}

export function getVehicleRoot(entity: SThing): SThing {
  const chain = resolveVehicleChain(entity);
  return chain[0];
}

export function getVehicleTransform(entity: SThing): VehicleTransform {
  return {
    positionInVehicleSpace: getPositionInVehicleSpace(entity),
    orientationInVehicleSpace: getOrientationInVehicleSpace(entity),
    absolutePosition: clonePosition(entity.imp.getAbsolutePosition()),
    absoluteOrientation: cloneOrientation(entity.imp.getAbsoluteOrientation()),
  };
}

export function resolveNestedVehicleTransform(entity: SThing): VehicleTransform[] {
  return resolveVehicleChain(entity).map(getVehicleTransform);
}

export class CameraVehicle {
  constructor(
    readonly camera: SCamera,
    readonly followOffset: Position = { x: 0, y: 2, z: 6 },
  ) {}

  attachTo(vehicle: SThing): void {
    setVehicle(this.camera, vehicle);
    setPositionInVehicleSpace(this.camera, this.followOffset);
  }

  follow(vehicle: SThing): VehicleTransform {
    this.attachTo(vehicle);
    this.camera.pointAt(vehicle);
    return getVehicleTransform(this.camera);
  }

  getChain(): SThing[] {
    return resolveVehicleChain(this.camera);
  }
}
