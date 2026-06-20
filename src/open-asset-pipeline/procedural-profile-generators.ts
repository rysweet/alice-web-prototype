/** Profile-driven procedural geometry dispatcher. */

import type { ModelGeometryData } from "../model-resources/definitions.js";
import type { ModelProfile } from "./model-profiles.js";
import {
  generateBipedFromProfile,
  generateFlyerFromProfile,
  generateQuadrupedFromProfile,
  generateSlithererFromProfile,
  generateSwimmerFromProfile,
} from "./procedural-character-profile-generators.js";
import {
  generatePropFromProfile,
  generateVehicleFromProfile,
} from "./procedural-object-profile-generators.js";

export function generateFromProfile(p: ModelProfile, scale: number): ModelGeometryData {
  switch (p.category) {
    case "BIPED": return generateBipedFromProfile(p, scale);
    case "QUADRUPED": return generateQuadrupedFromProfile(p, scale);
    case "FLYER": return generateFlyerFromProfile(p, scale);
    case "SWIMMER": return generateSwimmerFromProfile(p, scale);
    case "SLITHERER": return generateSlithererFromProfile(p, scale);
    case "PROP": return generatePropFromProfile(p, scale);
    case "VEHICLE": return generateVehicleFromProfile(p, scale);
  }
}
