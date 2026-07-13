/**
 * The single React Flow edge component every graphle edge renders through
 * (`FLOW_EDGE_TYPE`, see `to-flow.ts`). Unlike React Flow's built-in default
 * edge, which attaches to whichever fixed `Handle` a node happens to expose,
 * this reads the edge's precomputed `ports` assignment (which side of each
 * endpoint node it attaches to, and its offset fraction along that side —
 * `src/domain/edge-ports.ts`) and combines it with each endpoint's *live*
 * measured position (`useInternalNode`) to compute the actual attachment
 * point every render. The edge therefore continuously repositions as either
 * endpoint moves, rather than staying pinned to a stale handle.
 *
 * Styling (colour, dash pattern, label) is a straight passthrough of the
 * props React Flow already computed from `edgeToFlow`'s `style`/`label` —
 * this component owns geometry only, not presentation.
 */
import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from "@xyflow/react";

import { pointOnSide, sideToPosition, type Rect } from "./floating-edge-geometry";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, type GraphFlowEdge } from "./to-flow";

/** An endpoint node's live absolute rect, falling back to the same
 *  unmeasured-node footprint `GraphCanvas`'s auto-layout uses (see
 *  `DEFAULT_NODE_WIDTH`/`DEFAULT_NODE_HEIGHT` in `to-flow.ts`) — a
 *  legitimate "not yet measured" default, not a masked absence: React Flow
 *  hasn't laid the node out yet, so there is no real size to report. */
function rectOf(
  internalNode: NonNullable<ReturnType<typeof useInternalNode>>,
  defaultWidth: number,
  defaultHeight: number,
): Rect {
  const { positionAbsolute } = internalNode.internals;
  return {
    x: positionAbsolute.x,
    y: positionAbsolute.y,
    width: internalNode.measured.width ?? defaultWidth,
    height: internalNode.measured.height ?? defaultHeight,
  };
}

export function FloatingEdge({
  id,
  source,
  target,
  data,
  style,
  label,
  markerEnd,
}: EdgeProps<GraphFlowEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  // Genuine first-render race: React Flow hasn't measured/registered one or
  // both endpoints yet (the brief window right after a node is added, before
  // its first paint). There is nothing to draw a path between until both
  // exist — the next render, once React Flow supplies them, renders normally.
  if (sourceNode === undefined || targetNode === undefined) return null;
  // React Flow's `Edge.data` is typed `EdgeData | undefined` for edges in
  // general (some callers never set it); `edgeToFlow` always sets it for
  // every graphle edge, so this satisfies strict typing rather than
  // guarding a genuine absence — mirrors `computeEdgePorts`'s identical
  // strict-typing-only check in `src/domain/edge-ports.ts`.
  if (data === undefined) return null;
  const { ports } = data;

  const sourceRect = rectOf(sourceNode, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT);
  const targetRect = rectOf(targetNode, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT);

  const sourcePosition = sideToPosition(ports.sourceSide);
  const targetPosition = sideToPosition(ports.targetSide);
  const sourcePoint = pointOnSide(sourceRect, sourcePosition, ports.sourceOffset);
  const targetPoint = pointOnSide(targetRect, targetPosition, ports.targetOffset);

  const [path] = getBezierPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    sourcePosition,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      {...(markerEnd !== undefined ? { markerEnd } : {})}
      {...(style !== undefined ? { style } : {})}
      {...(label !== undefined ? { label } : {})}
    />
  );
}
