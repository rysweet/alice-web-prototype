/** Canonical joint hierarchies for procedural model categories. */

import type { ModelJointDefinition } from "../model-resources/definitions.js";
import type { EntityCategory } from "./types.js";

// ── Canonical joint definitions (from story-resources.ts) ──────────

function joint(name: string, parentName: string | null): ModelJointDefinition {
  return { name, parentName };
}

const BIPED_JOINTS: readonly ModelJointDefinition[] = [
  joint("ROOT", null),
  joint("PELVIS_LOWER_BODY", "ROOT"),
  joint("LEFT_HIP", "PELVIS_LOWER_BODY"),
  joint("LEFT_KNEE", "LEFT_HIP"),
  joint("LEFT_ANKLE", "LEFT_KNEE"),
  joint("LEFT_FOOT", "LEFT_ANKLE"),
  joint("RIGHT_HIP", "PELVIS_LOWER_BODY"),
  joint("RIGHT_KNEE", "RIGHT_HIP"),
  joint("RIGHT_ANKLE", "RIGHT_KNEE"),
  joint("RIGHT_FOOT", "RIGHT_ANKLE"),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("SPINE_UPPER", "SPINE_MIDDLE"),
  joint("NECK", "SPINE_UPPER"),
  joint("HEAD", "NECK"),
  joint("MOUTH", "HEAD"),
  joint("LEFT_EYE", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("RIGHT_CLAVICLE", "SPINE_UPPER"),
  joint("RIGHT_SHOULDER", "RIGHT_CLAVICLE"),
  joint("RIGHT_ELBOW", "RIGHT_SHOULDER"),
  joint("RIGHT_WRIST", "RIGHT_ELBOW"),
  joint("RIGHT_HAND", "RIGHT_WRIST"),
  joint("RIGHT_THUMB", "RIGHT_HAND"),
  joint("RIGHT_THUMB_KNUCKLE", "RIGHT_THUMB"),
  joint("RIGHT_INDEX_FINGER", "RIGHT_HAND"),
  joint("RIGHT_INDEX_FINGER_KNUCKLE", "RIGHT_INDEX_FINGER"),
  joint("RIGHT_MIDDLE_FINGER", "RIGHT_HAND"),
  joint("RIGHT_MIDDLE_FINGER_KNUCKLE", "RIGHT_MIDDLE_FINGER"),
  joint("RIGHT_PINKY_FINGER", "RIGHT_HAND"),
  joint("RIGHT_PINKY_FINGER_KNUCKLE", "RIGHT_PINKY_FINGER"),
  joint("LEFT_CLAVICLE", "SPINE_UPPER"),
  joint("LEFT_SHOULDER", "LEFT_CLAVICLE"),
  joint("LEFT_ELBOW", "LEFT_SHOULDER"),
  joint("LEFT_WRIST", "LEFT_ELBOW"),
  joint("LEFT_HAND", "LEFT_WRIST"),
  joint("LEFT_THUMB", "LEFT_HAND"),
  joint("LEFT_THUMB_KNUCKLE", "LEFT_THUMB"),
  joint("LEFT_INDEX_FINGER", "LEFT_HAND"),
  joint("LEFT_INDEX_FINGER_KNUCKLE", "LEFT_INDEX_FINGER"),
  joint("LEFT_MIDDLE_FINGER", "LEFT_HAND"),
  joint("LEFT_MIDDLE_FINGER_KNUCKLE", "LEFT_MIDDLE_FINGER"),
  joint("LEFT_PINKY_FINGER", "LEFT_HAND"),
  joint("LEFT_PINKY_FINGER_KNUCKLE", "LEFT_PINKY_FINGER"),
];

const QUADRUPED_JOINTS: readonly ModelJointDefinition[] = [
  joint("ROOT", null),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("SPINE_UPPER", "SPINE_MIDDLE"),
  joint("NECK", "SPINE_UPPER"),
  joint("HEAD", "NECK"),
  joint("LEFT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("LEFT_EAR", "HEAD"),
  joint("MOUTH", "HEAD"),
  joint("RIGHT_EAR", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("FRONT_LEFT_CLAVICLE", "SPINE_UPPER"),
  joint("FRONT_LEFT_SHOULDER", "FRONT_LEFT_CLAVICLE"),
  joint("FRONT_LEFT_KNEE", "FRONT_LEFT_SHOULDER"),
  joint("FRONT_LEFT_ANKLE", "FRONT_LEFT_KNEE"),
  joint("FRONT_LEFT_FOOT", "FRONT_LEFT_ANKLE"),
  joint("FRONT_LEFT_TOE", "FRONT_LEFT_FOOT"),
  joint("FRONT_RIGHT_CLAVICLE", "SPINE_UPPER"),
  joint("FRONT_RIGHT_SHOULDER", "FRONT_RIGHT_CLAVICLE"),
  joint("FRONT_RIGHT_KNEE", "FRONT_RIGHT_SHOULDER"),
  joint("FRONT_RIGHT_ANKLE", "FRONT_RIGHT_KNEE"),
  joint("FRONT_RIGHT_FOOT", "FRONT_RIGHT_ANKLE"),
  joint("FRONT_RIGHT_TOE", "FRONT_RIGHT_FOOT"),
  joint("PELVIS_LOWER_BODY", "ROOT"),
  joint("TAIL_0", "PELVIS_LOWER_BODY"),
  joint("TAIL_1", "TAIL_0"),
  joint("TAIL_2", "TAIL_1"),
  joint("TAIL_3", "TAIL_2"),
  joint("BACK_LEFT_HIP", "PELVIS_LOWER_BODY"),
  joint("BACK_LEFT_KNEE", "BACK_LEFT_HIP"),
  joint("BACK_LEFT_HOCK", "BACK_LEFT_KNEE"),
  joint("BACK_LEFT_ANKLE", "BACK_LEFT_HOCK"),
  joint("BACK_LEFT_FOOT", "BACK_LEFT_ANKLE"),
  joint("BACK_LEFT_TOE", "BACK_LEFT_FOOT"),
  joint("BACK_RIGHT_HIP", "PELVIS_LOWER_BODY"),
  joint("BACK_RIGHT_KNEE", "BACK_RIGHT_HIP"),
  joint("BACK_RIGHT_HOCK", "BACK_RIGHT_KNEE"),
  joint("BACK_RIGHT_ANKLE", "BACK_RIGHT_HOCK"),
  joint("BACK_RIGHT_FOOT", "BACK_RIGHT_ANKLE"),
  joint("BACK_RIGHT_TOE", "BACK_RIGHT_FOOT"),
];

const FLYER_JOINTS: readonly ModelJointDefinition[] = [
  joint("ROOT", null),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("SPINE_UPPER", "SPINE_MIDDLE"),
  joint("NECK_0", "SPINE_UPPER"),
  joint("NECK_1", "NECK_0"),
  joint("HEAD", "NECK_1"),
  joint("MOUTH", "HEAD"),
  joint("LOWER_LIP", "MOUTH"),
  joint("LEFT_EYE", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("LEFT_WING_SHOULDER", "SPINE_UPPER"),
  joint("LEFT_WING_ELBOW", "LEFT_WING_SHOULDER"),
  joint("LEFT_WING_WRIST", "LEFT_WING_ELBOW"),
  joint("LEFT_WING_TIP", "LEFT_WING_WRIST"),
  joint("RIGHT_WING_SHOULDER", "SPINE_UPPER"),
  joint("RIGHT_WING_ELBOW", "RIGHT_WING_SHOULDER"),
  joint("RIGHT_WING_WRIST", "RIGHT_WING_ELBOW"),
  joint("RIGHT_WING_TIP", "RIGHT_WING_WRIST"),
  joint("PELVIS_LOWER_BODY", "ROOT"),
  joint("TAIL_0", "PELVIS_LOWER_BODY"),
  joint("TAIL_1", "TAIL_0"),
  joint("TAIL_2", "TAIL_1"),
  joint("LEFT_HIP", "PELVIS_LOWER_BODY"),
  joint("LEFT_KNEE", "LEFT_HIP"),
  joint("LEFT_ANKLE", "LEFT_KNEE"),
  joint("LEFT_FOOT", "LEFT_ANKLE"),
  joint("RIGHT_HIP", "PELVIS_LOWER_BODY"),
  joint("RIGHT_KNEE", "RIGHT_HIP"),
  joint("RIGHT_ANKLE", "RIGHT_KNEE"),
  joint("RIGHT_FOOT", "RIGHT_ANKLE"),
];

const SWIMMER_JOINTS: readonly ModelJointDefinition[] = [
  joint("ROOT", null),
  joint("NECK", "ROOT"),
  joint("HEAD", "NECK"),
  joint("MOUTH", "HEAD"),
  joint("LEFT_EYE", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("FRONT_LEFT_FIN", "NECK"),
  joint("FRONT_RIGHT_FIN", "NECK"),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("TAIL", "SPINE_MIDDLE"),
];

const SLITHERER_JOINTS: readonly ModelJointDefinition[] = [
  joint("ROOT", null),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("SPINE_UPPER", "SPINE_MIDDLE"),
  joint("NECK", "SPINE_UPPER"),
  joint("HEAD", "NECK"),
  joint("MOUTH", "HEAD"),
  joint("LEFT_EYE", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("TAIL_0", "ROOT"),
];

const PROP_JOINTS: readonly ModelJointDefinition[] = [
  joint("ROOT", null),
];

const VEHICLE_JOINTS: readonly ModelJointDefinition[] = [
  joint("ROOT", null),
  joint("BACK_WHEELS", "ROOT"),
  joint("FRONT_RIGHT_WHEEL", "ROOT"),
  joint("FRONT_LEFT_WHEEL", "ROOT"),
];

/** Returns the canonical joint hierarchy for a given entity category. */
export function getCanonicalJoints(category: EntityCategory): readonly ModelJointDefinition[] {
  switch (category) {
    case "BIPED": return BIPED_JOINTS;
    case "QUADRUPED": return QUADRUPED_JOINTS;
    case "FLYER": return FLYER_JOINTS;
    case "SWIMMER": return SWIMMER_JOINTS;
    case "SLITHERER": return SLITHERER_JOINTS;
    case "PROP": return PROP_JOINTS;
    case "VEHICLE": return VEHICLE_JOINTS;
  }
}
