import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, type GraphDocument } from "../schema";

import { decodeDocument, encodeDocument, ShareDecodeError } from "./codec";

/**
 * Identifiers for the representative document. Kept as an object so two
 * documents with different ids (but identical structure) can be built for the
 * determinism test.
 */
interface DocIds {
  freeform: string;
  org: string;
  repo: string;
  issue: string;
  project: string;
  edgeOrgRepo: string;
  edgeRepoIssue: string;
  edgeOrgProject: string;
}

/** Build a representative document covering all five node kinds. */
function makeDocument(ids: DocIds): GraphDocument {
  return {
    version: GRAPH_DOCUMENT_VERSION,
    name: "Representative",
    nodes: [
      {
        id: ids.freeform,
        kind: "freeform",
        position: { x: 10.4, y: 20.7 },
        data: { label: "Note", note: "free-form thoughts" },
      },
      {
        id: ids.org,
        kind: "org",
        position: { x: 0, y: 0 },
        data: { login: "exadev", name: "ExaDev", url: "https://github.com/exadev" },
      },
      {
        id: ids.repo,
        kind: "repo",
        position: { x: 100, y: 50 },
        data: { owner: "exadev", name: "graphle", archived: false },
      },
      {
        id: ids.issue,
        kind: "issue",
        position: { x: -5.5, y: 12.9 },
        data: {
          owner: "exadev",
          repo: "graphle",
          number: 42,
          title: "Fix the thing",
          state: "open",
        },
      },
      {
        id: ids.project,
        kind: "project",
        position: { x: 33, y: 88 },
        data: {
          owner: "exadev",
          number: 1,
          title: "Roadmap",
          projectNodeId: "PNT_kgDO6",
        },
      },
    ],
    edges: [
      {
        id: ids.edgeOrgRepo,
        source: ids.org,
        target: ids.repo,
        relation: "owns",
        label: "owns",
      },
      {
        id: ids.edgeRepoIssue,
        source: ids.repo,
        target: ids.issue,
        relation: "contains",
      },
      {
        id: ids.edgeOrgProject,
        source: ids.org,
        target: ids.project,
        relation: "tracks",
      },
    ],
  };
}

const ids: DocIds = {
  freeform: "n-freeform",
  org: "n-org",
  repo: "n-repo",
  issue: "n-issue",
  project: "n-project",
  edgeOrgRepo: "e-org-repo",
  edgeRepoIssue: "e-repo-issue",
  edgeOrgProject: "e-org-project",
};

describe("share codec", () => {
  describe("round-trip", () => {
    it("decodes an encoded document equal modulo remapped ids", () => {
      const original = makeDocument(ids);
      const decoded = decodeDocument(encodeDocument(original));

      expect(decoded.name).toBe(original.name);
      expect(decoded.version).toBe(original.version);

      expect(decoded.nodes).toHaveLength(original.nodes.length);
      const originalIndex = new Map(original.nodes.map((node, i) => [node.id, i]));
      const decodedIndex = new Map(decoded.nodes.map((node, i) => [node.id, i]));

      decoded.nodes.forEach((decodedNode, i) => {
        const originalNode = original.nodes[i];
        if (originalNode === undefined) throw new Error("original node missing");
        expect(decodedNode.kind).toBe(originalNode.kind);
        expect(decodedNode.data).toEqual(originalNode.data);
        expect(decodedNode.position.x).toBe(Math.round(originalNode.position.x));
        expect(decodedNode.position.y).toBe(Math.round(originalNode.position.y));
        // ids are regenerated, so they must differ from the originals.
        expect(decodedNode.id).not.toBe(originalNode.id);
      });

      expect(decoded.edges).toHaveLength(original.edges.length);
      decoded.edges.forEach((decodedEdge, i) => {
        const originalEdge = original.edges[i];
        if (originalEdge === undefined) throw new Error("original edge missing");
        expect(decodedEdge.relation).toBe(originalEdge.relation);
        expect(decodedEdge.label).toBe(originalEdge.label);
        // Edge endpoints follow the node remap: the source/target indices in
        // the original and decoded arrays must line up.
        expect(originalIndex.get(originalEdge.source)).toBe(
          decodedIndex.get(decodedEdge.source),
        );
        expect(originalIndex.get(originalEdge.target)).toBe(
          decodedIndex.get(decodedEdge.target),
        );
        expect(decodedEdge.id).not.toBe(originalEdge.id);
      });
    });

    it("drops absent optional data fields on the way back", () => {
      const doc: GraphDocument = {
        version: GRAPH_DOCUMENT_VERSION,
        name: "Optionals",
        nodes: [
          {
            id: "f1",
            kind: "freeform",
            position: { x: 1, y: 2 },
            data: { label: "no note here" },
          },
        ],
        edges: [],
      };
      const decoded = decodeDocument(encodeDocument(doc));
      const decodedNode = decoded.nodes[0];
      if (decodedNode === undefined) throw new Error("freeform node missing");
      expect(decodedNode.data).toEqual({ label: "no note here" });
      expect("note" in decodedNode.data).toBe(false);
    });
  });

  describe("determinism", () => {
    it("encodes structurally equal documents to the same string", () => {
      const a = makeDocument(ids);
      const b = makeDocument({
        freeform: crypto.randomUUID(),
        org: crypto.randomUUID(),
        repo: crypto.randomUUID(),
        issue: crypto.randomUUID(),
        project: crypto.randomUUID(),
        edgeOrgRepo: crypto.randomUUID(),
        edgeRepoIssue: crypto.randomUUID(),
        edgeOrgProject: crypto.randomUUID(),
      });
      expect(encodeDocument(a)).toBe(encodeDocument(b));
    });

    it("is stable across repeated encodes of the same document", () => {
      const doc = makeDocument(ids);
      expect(encodeDocument(doc)).toBe(encodeDocument(doc));
    });
  });

  describe("error handling", () => {
    it("throws ShareDecodeError on a corrupt payload", () => {
      expect(() => decodeDocument("!!!not-a-valid-compressed-payload!!!")).toThrow(
        ShareDecodeError,
      );
    });

    it("throws ShareDecodeError on a payload whose version is 2", () => {
      const future = compressToEncodedURIComponent(
        JSON.stringify({ v: 2, n: "future", d: [], e: [] }),
      );
      expect(() => decodeDocument(future)).toThrow(ShareDecodeError);
    });

    it("throws ShareDecodeError when the version field is missing", () => {
      const missing = compressToEncodedURIComponent(
        JSON.stringify({ n: "noversion", d: [], e: [] }),
      );
      expect(() => decodeDocument(missing)).toThrow(ShareDecodeError);
    });

    it("throws ShareDecodeError on JSON that is not an envelope object", () => {
      const notObject = compressToEncodedURIComponent(JSON.stringify([1, 2, 3]));
      expect(() => decodeDocument(notObject)).toThrow(ShareDecodeError);
    });

    it("ShareDecodeError carries a descriptive message", () => {
      try {
        decodeDocument("!!!corrupt!!!");
        throw new Error("expected ShareDecodeError");
      } catch (error) {
        expect(error).toBeInstanceOf(ShareDecodeError);
        if (error instanceof ShareDecodeError) {
          expect(error.name).toBe("ShareDecodeError");
          expect(error.message.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("all five node kinds", () => {
    it("round-trips a representative document containing every kind", () => {
      const doc = makeDocument(ids);
      const decoded = decodeDocument(encodeDocument(doc));
      const decodedKinds = decoded.nodes.map((node) => node.kind);
      expect(decodedKinds).toEqual(["freeform", "org", "repo", "issue", "project"]);
    });
  });
});
