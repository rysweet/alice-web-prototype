export {
  InstanceProperty,
  PropertyOwnerBase,
  PropertyValidationError,
  type InstancePropertyOptions,
  type PropertyChangeEvent,
  type PropertyClone,
  type PropertyConstraint,
  type PropertyConstraintResult,
  type PropertyEquality,
  type PropertyListener,
  type PropertyNormalize,
  type PropertyOwner,
} from "./project-properties/core.js";
export {
  ListProperty,
  type IndexedListPropertyChangeEvent,
  type IndexedListPropertyListener,
  type ListPropertyOptions,
} from "./project-properties/list-property.js";
export {
  SetProperty,
  type SetPropertyChangeEvent,
  type SetPropertyListener,
  type SetPropertyOptions,
} from "./project-properties/set-property.js";
