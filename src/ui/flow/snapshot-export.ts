/**
 * "Download as image" for the canvas — a PNG or SVG snapshot of the current
 * graph, framed to fit every node exactly as React Flow's own docs recommend:
 * compute a bounding box and a viewport transform with `getNodesBounds`/
 * `getViewportForBounds` (both from `@xyflow/react`), then rasterise the
 * live viewport DOM node at that transform with `html-to-image`.
 *
 * This is deliberately untested (see the module's callers) — it renders real
 * DOM to a canvas via `html-to-image`, the same class of browser-only,
 * canvas-rendering-dependent code as `GraphCanvas.tsx`/`ContextMenu.tsx`,
 * which the project verifies by hand in the browser rather than in Vitest.
 */
import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";

import type { GraphFlowNode } from "./to-flow";

/** Fixed export canvas size (px). Large enough to read comfortably when
 *  opened at 100%, small enough to stay a fast, single-frame capture. */
const EXPORT_WIDTH = 1200;
const EXPORT_HEIGHT = 800;

/** Zoom bounds passed to `getViewportForBounds`: never zoom in past 1:1 scale
 *  once (`maxZoom`) even for a single tiny node, and never shrink a very
 *  large graph below half size (`minZoom`) — beyond that the snapshot stops
 *  being legible. */
const EXPORT_MIN_ZOOM = 0.5;
const EXPORT_MAX_ZOOM = 2;

/** Fractional padding around the graph's bounding box, so nodes at the very
 *  edge aren't cropped flush against the image border. */
const EXPORT_PADDING = 0.1;

/** React Flow's own class name for the pannable/zoomable layer that carries
 *  the CSS transform — the element `html-to-image` rasterises, since it's
 *  the one whose transform this module recomputes to frame the export. */
const VIEWPORT_SELECTOR = ".react-flow__viewport";

/**
 * Build the `html-to-image` options that frame `nodes` inside a fixed
 * `EXPORT_WIDTH`x`EXPORT_HEIGHT` canvas: a computed background, pixel size,
 * and a `style.transform` reproducing the translate/scale React Flow itself
 * would apply for that viewport.
 */
function buildExportOptions(nodes: GraphFlowNode[]): {
  backgroundColor: string;
  width: number;
  height: number;
  style: { width: string; height: string; transform: string };
} {
  const bounds = getNodesBounds(nodes);
  const viewport = getViewportForBounds(
    bounds,
    EXPORT_WIDTH,
    EXPORT_HEIGHT,
    EXPORT_MIN_ZOOM,
    EXPORT_MAX_ZOOM,
    EXPORT_PADDING,
  );
  return {
    backgroundColor: "#ffffff",
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    style: {
      width: `${String(EXPORT_WIDTH)}px`,
      height: `${String(EXPORT_HEIGHT)}px`,
      transform: `translate(${String(viewport.x)}px, ${String(viewport.y)}px) scale(${String(viewport.zoom)})`,
    },
  };
}

/** Look up the mounted React Flow viewport element, the one `html-to-image`
 *  rasterises. Throws rather than silently no-opping: a missing viewport
 *  means the canvas isn't mounted, a genuine caller error worth surfacing
 *  loudly rather than swallowing into a do-nothing export button. */
function getViewportElement(): HTMLElement {
  const element = document.querySelector(VIEWPORT_SELECTOR);
  if (element === null) {
    throw new Error(
      `Cannot export the canvas: no element matching "${VIEWPORT_SELECTOR}" is mounted.`,
    );
  }
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Element matching "${VIEWPORT_SELECTOR}" is not an HTMLElement.`);
  }
  return element;
}

/**
 * Build a throwaway anchor pointed at a data URL, click it, and remove it —
 * the same download-trigger shape as `src/sharing/download.ts`'s
 * `triggerDownload`, but for a data URL produced by `html-to-image` rather
 * than a `Blob` built locally, so it stays a separate, distinctly named
 * helper rather than overloading that one's contract.
 */
function triggerImageDownload(dataUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/** Export the current canvas as a PNG and trigger a browser download. */
export async function exportCanvasAsPng(nodes: GraphFlowNode[]): Promise<void> {
  const viewportElement = getViewportElement();
  const dataUrl = await toPng(viewportElement, buildExportOptions(nodes));
  triggerImageDownload(dataUrl, "graphle.png");
}

/** Export the current canvas as an SVG and trigger a browser download. */
export async function exportCanvasAsSvg(nodes: GraphFlowNode[]): Promise<void> {
  const viewportElement = getViewportElement();
  const dataUrl = await toSvg(viewportElement, buildExportOptions(nodes));
  triggerImageDownload(dataUrl, "graphle.svg");
}
