/**
 * Pure domain layer: graph logic with no React, no IO, and no imports from the
 * sharing, storage, or ui layers. Types are derived from the schema layer,
 * which remains the single source of truth for every data shape.
 */
export { nodeIdentityKey } from "./identity";
export { EXPANSION_ANGLE_STEP, EXPANSION_RADIUS, placeAround } from "./layout";
export { applyDelta, type GraphDelta } from "./merge";
export { emptyDocument } from "./empty";
export {
  GraphOperationError,
  applyOperation,
  type GraphOperation,
} from "./operations";
