/**
 * CSV / adjacency-list import: turns a simple two- or three-column CSV
 * (`source,target` or `source,target,label`) into a {@link GraphDelta} of
 * `freeform` nodes and `references` edges, ready to fold into the current
 * document via `mergeDelta`.
 *
 * Parsing goes through d3-dsv's `csvParseRows`, which does correct
 * quoted-field CSV parsing (a quoted comma stays inside its cell) and, unlike
 * `csvParse`, treats every line as a plain row rather than assuming the first
 * is a header — this importer decides that for itself, since a header is
 * optional here.
 */
import { csvParseRows } from "d3-dsv";

import { cascadePosition, type GraphDelta } from "../domain";
import type { GraphEdge, GraphNode } from "../schema";

/** Whether `row`'s first two cells read as a "source"/"target" header,
 *  case-insensitively — the only header shape this importer recognises. */
function isHeaderRow(row: string[]): boolean {
  const [first, second] = row;
  return (
    first !== undefined &&
    second !== undefined &&
    first.trim().toLowerCase() === "source" &&
    second.trim().toLowerCase() === "target"
  );
}

/**
 * Parses `text` as a two- or three-column adjacency list into a
 * {@link GraphDelta}.
 *
 * Each row is `source,target` or `source,target,label`. A first row whose
 * first two cells are literally "source"/"target" (case-insensitive) is
 * skipped as a header; every other row is treated as data. A row missing a
 * source or target cell (blank once trimmed) is skipped.
 *
 * One `freeform` node is created per distinct source/target label, deduped
 * within this import by its trimmed text — the same label appearing as a
 * source in one row and a target in another yields a single node, not two —
 * and one `references` edge is created per data row, carrying the third
 * column (trimmed) as its `label` data field when present.
 */
export function importCsv(text: string): GraphDelta {
  const rows = csvParseRows(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  const [firstRow] = rows;
  const dataRows = firstRow !== undefined && isHeaderRow(firstRow) ? rows.slice(1) : rows;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIdByLabel = new Map<string, string>();

  function nodeIdFor(label: string): string {
    const existingId = nodeIdByLabel.get(label);
    if (existingId !== undefined) return existingId;
    const id = crypto.randomUUID();
    nodeIdByLabel.set(label, id);
    nodes.push({
      id,
      type: "freeform",
      position: cascadePosition(nodes.length),
      data: { label },
    });
    return id;
  }

  for (const row of dataRows) {
    const [rawSource, rawTarget, rawLabel] = row;
    const source = rawSource?.trim();
    const target = rawTarget?.trim();
    if (source === undefined || source === "" || target === undefined || target === "") continue;

    const sourceId = nodeIdFor(source);
    const targetId = nodeIdFor(target);
    const label = rawLabel?.trim();
    edges.push({
      id: crypto.randomUUID(),
      source: sourceId,
      target: targetId,
      type: "references",
      data: label !== undefined && label !== "" ? { label } : {},
    });
  }

  return { nodes, edges };
}
