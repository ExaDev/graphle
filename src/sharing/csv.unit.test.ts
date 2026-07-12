import { describe, expect, it } from "vitest";

import { importCsv } from "./csv";

describe("importCsv", () => {
  it("produces one node per distinct label and one edge per row, deduping a label shared across rows", () => {
    const delta = importCsv("A,B\nB,C\n");

    expect(delta.nodes).toHaveLength(3);
    expect(delta.edges).toHaveLength(2);

    const labels = delta.nodes.map((node) => node.data["label"]).sort();
    expect(labels).toEqual(["A", "B", "C"]);

    // "B" appears once as a target (row 1) and once as a source (row 2) —
    // both edges must reference the same node id.
    const nodeIdByLabel = new Map(delta.nodes.map((node) => [node.data["label"], node.id]));
    const [edge1, edge2] = delta.edges;
    expect(edge1?.target).toBe(nodeIdByLabel.get("B"));
    expect(edge2?.source).toBe(nodeIdByLabel.get("B"));
  });

  it("gives every node type 'freeform' and every edge type 'references'", () => {
    const delta = importCsv("A,B\n");

    expect(delta.nodes.every((node) => node.type === "freeform")).toBe(true);
    expect(delta.edges.every((edge) => edge.type === "references")).toBe(true);
  });

  it("carries a third column through as the edge's label data field", () => {
    const delta = importCsv("A,B,relates to\n");

    expect(delta.edges).toHaveLength(1);
    expect(delta.edges[0]?.data["label"]).toBe("relates to");
  });

  it("omits the label data field when no third column is present", () => {
    const delta = importCsv("A,B\n");

    expect(delta.edges[0]?.data).toEqual({});
  });

  it("skips a literal source/target header row, case-insensitively", () => {
    const delta = importCsv("Source,Target\nA,B\n");

    expect(delta.nodes).toHaveLength(2);
    expect(delta.edges).toHaveLength(1);
    const labels = delta.nodes.map((node) => node.data["label"]).sort();
    expect(labels).toEqual(["A", "B"]);
  });

  it("treats every row as data when the first row is not a source/target header", () => {
    const delta = importCsv("A,B\nC,D\n");

    expect(delta.nodes).toHaveLength(4);
    expect(delta.edges).toHaveLength(2);
  });

  it("parses a quoted field containing a comma as a single cell, not split on the inner comma", () => {
    const delta = importCsv('A,B,"foo, bar"\n');

    expect(delta.nodes).toHaveLength(2);
    expect(delta.edges).toHaveLength(1);
    expect(delta.edges[0]?.data["label"]).toBe("foo, bar");
  });
});
