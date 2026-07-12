/**
 * Pure domain layer: graph logic with no React, no IO, and no imports from the
 * sharing, storage, or ui layers. Types are derived from the schema layer,
 * which remains the single source of truth for every data shape.
 */
export { nodeIdentityKey } from "./identity";
export { MAX_UNDO_DEPTH, pushHistory } from "./history";
export {
  EXPANSION_ANGLE_STEP,
  EXPANSION_RADIUS,
  cascadePosition,
  placeAround,
} from "./layout";
export { applyDelta, type GraphDelta } from "./merge";
export { emptyDocument } from "./empty";
export {
  childCount,
  descendantIds,
  indexNodesById,
  isHidden,
  visibleAncestor,
  wouldCreateCycle,
} from "./hierarchy";
export {
  GraphOperationError,
  applyOperation,
  type GraphOperation,
} from "./operations";
export {
  alignNodes,
  distributeNodes,
  type AlignEdge,
  type DistributeAxis,
  type PositionedNode,
} from "./align";
export { connectedNodeIds } from "./reachability";
export { findSchemaDrift, type DriftEntry } from "./schema-drift";
