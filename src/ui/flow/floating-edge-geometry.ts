/**
 * Thin UI-layer adapter between the domain's coarse per-edge `Side`/offset
 * assignment (`src/domain/edge-ports.ts`) and React Flow's pixel-space
 * `Position` enum and `getBezierPath` inputs. Pure arithmetic only — no
 * decision logic of its own; which side and which slot an edge uses is
 * decided once, document-wide, by `computeEdgePorts` in the domain layer.
 * `FloatingEdge.tsx` is the only caller.
 */
import { Position } from "@xyflow/react";

import type { Side } from "@/domain";

/** A node's absolute top-left position plus its measured on-canvas size —
 *  what `useInternalNode` supplies via `internals.positionAbsolute` and
 *  `measured.width`/`measured.height`. */
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Converts a domain `Side` to React Flow's `Position` enum. An exhaustive
 * switch with one branch per `Side` literal and no `default` — adding a
 * fifth `Side` value without updating this function becomes a compile
 * error (TypeScript can no longer prove every code path returns), rather
 * than silently falling back to some default position.
 */
export function sideToPosition(side: Side): Position {
  switch (side) {
    case "top":
      return Position.Top;
    case "bottom":
      return Position.Bottom;
    case "left":
      return Position.Left;
    case "right":
      return Position.Right;
  }
}

/**
 * The point at fraction `offset` (0..1) along `side` of `rect`, in absolute
 * canvas coordinates. For the top/bottom sides the offset moves along the
 * rect's width; for left/right it moves along the rect's height. The
 * perpendicular coordinate is pinned to that side. No decision logic — just
 * arithmetic over the live rect; `offset`'s meaning (0 nearest which corner)
 * is decided by `computeEdgePorts`, not here.
 */
export function pointOnSide(rect: Rect, side: Position, offset: number): { x: number; y: number } {
  switch (side) {
    case Position.Top:
      return { x: rect.x + offset * rect.width, y: rect.y };
    case Position.Bottom:
      return { x: rect.x + offset * rect.width, y: rect.y + rect.height };
    case Position.Left:
      return { x: rect.x, y: rect.y + offset * rect.height };
    case Position.Right:
      return { x: rect.x + rect.width, y: rect.y + offset * rect.height };
  }
}
