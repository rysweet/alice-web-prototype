import {
  type BoundingBox,
  type Position,
  SCamera,
  SThing,
  boundingBoxesIntersect,
  cloneBoundingBox,
  getEntityBoundingBox,
} from "./story-api";
import {
  distanceBetween,
  normalizeVec3,
  quaternionConjugate,
  rotateVector,
  subtractVec3,
} from "./story-api/expanded-math";

type PositionedThing = SThing & { position: Position };

function positionOf(entity: SThing): Position {
  if ("position" in entity) {
    return { ...(entity as PositionedThing).position };
  }
  const bounds = getEntityBoundingBox(entity);
  if (bounds) {
    return {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    };
  }
  return { x: 0, y: 0, z: 0 };
}

export class DistanceQuery {
  between(left: SThing, right: SThing): number {
    return distanceBetween(positionOf(left), positionOf(right));
  }
}

export class DirectionQuery {
  fromAToB(left: SThing, right: SThing): Position {
    return normalizeVec3(subtractVec3(positionOf(right), positionOf(left)));
  }
}

export class IsAboveQuery {
  evaluate(candidate: SThing, reference: SThing): boolean {
    return positionOf(candidate).y > positionOf(reference).y;
  }
}

export class IsBelowQuery {
  evaluate(candidate: SThing, reference: SThing): boolean {
    return positionOf(candidate).y < positionOf(reference).y;
  }
}

export class IsInFrontOfQuery {
  evaluate(candidate: SThing, reference: SThing): boolean {
    return positionOf(candidate).z < positionOf(reference).z;
  }
}

export class IsBehindQuery {
  evaluate(candidate: SThing, reference: SThing): boolean {
    return positionOf(candidate).z > positionOf(reference).z;
  }
}

export class IsWithinThresholdQuery {
  evaluate(left: SThing, right: SThing, threshold: number): boolean {
    return distanceBetween(positionOf(left), positionOf(right)) <= threshold;
  }
}

export class BoundingBoxQuery {
  worldBounds(entity: SThing): BoundingBox | null {
    const bounds = getEntityBoundingBox(entity);
    return bounds ? cloneBoundingBox(bounds) : null;
  }
}

export class CollisionQuery {
  evaluate(left: SThing, right: SThing): boolean {
    const leftBounds = getEntityBoundingBox(left);
    const rightBounds = getEntityBoundingBox(right);
    return leftBounds !== null && rightBounds !== null && boundingBoxesIntersect(leftBounds, rightBounds);
  }
}

export class VisibilityQuery {
  visibleFrom(camera: SCamera, entity: SThing): boolean {
    if (!entity.isShowing) {
      return false;
    }
    const cameraPosition = positionOf(camera);
    const entityPosition = positionOf(entity);
    const worldDirection = subtractVec3(entityPosition, cameraPosition);
    const distance = distanceBetween(cameraPosition, entityPosition);
    if (distance < camera.nearClippingPlaneDistance || distance > camera.farClippingPlaneDistance) {
      return false;
    }
    if (distance === 0) {
      return true;
    }
    const localDirection = rotateVector(
      quaternionConjugate(camera.orientation),
      normalizeVec3(worldDirection),
    );
    if (localDirection.z >= 0) {
      return false;
    }
    const horizontalAngle = Math.atan2(Math.abs(localDirection.x), -localDirection.z);
    const verticalAngle = Math.atan2(Math.abs(localDirection.y), -localDirection.z);
    return horizontalAngle <= camera.horizontalViewingAngle / 2
      && verticalAngle <= camera.verticalViewingAngle / 2;
  }
}
