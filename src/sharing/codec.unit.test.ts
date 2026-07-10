import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";

import {
  BUILT_IN_TYPES_BY_NAME,
  GRAPH_DOCUMENT_VERSION,
  toPortableTypeDefinition,
  type GraphDocument,
  type NodeTypeDefinition,
} from "../schema";

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

/** Project a built-in type to its portable definition for test fixtures. */
function builtInTypeDef(name: string): NodeTypeDefinition {
  const type = BUILT_IN_TYPES_BY_NAME.get(name);
  if (type === undefined) {
    throw new Error(`test fixture: built-in ${name} type must exist`);
  }
  return toPortableTypeDefinition(type);
}

/** The type definitions carried by the representative document. */
const documentTypes: NodeTypeDefinition[] = [
  builtInTypeDef("freeform"),
  builtInTypeDef("org"),
  builtInTypeDef("repo"),
  builtInTypeDef("issue"),
  builtInTypeDef("project"),
];

/** Build a representative document covering all five original node types. */
function makeDocument(ids: DocIds): GraphDocument {
  return {
    version: GRAPH_DOCUMENT_VERSION,
    name: "Representative",
    types: documentTypes,
    nodes: [
      {
        id: ids.freeform,
        type: "freeform",
        position: { x: 10.4, y: 20.7 },
        data: { label: "Note", note: "free-form thoughts" },
      },
      {
        id: ids.org,
        type: "org",
        position: { x: 0, y: 0 },
        data: { login: "exadev", name: "ExaDev", url: "https://github.com/exadev" },
      },
      {
        id: ids.repo,
        type: "repo",
        position: { x: 100, y: 50 },
        data: { owner: "exadev", name: "graphle", archived: false },
      },
      {
        id: ids.issue,
        type: "issue",
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
        type: "project",
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

      // Type definitions round-trip intact.
      expect(decoded.types).toEqual(original.types);

      expect(decoded.nodes).toHaveLength(original.nodes.length);
      const originalIndex = new Map(original.nodes.map((node, i) => [node.id, i]));
      const decodedIndex = new Map(decoded.nodes.map((node, i) => [node.id, i]));

      decoded.nodes.forEach((decodedNode, i) => {
        const originalNode = original.nodes[i];
        if (originalNode === undefined) throw new Error("original node missing");
        expect(decodedNode.type).toBe(originalNode.type);
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
        types: [builtInTypeDef("freeform")],
        nodes: [
          {
            id: "f1",
            type: "freeform",
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

    it("round-trips a node of a custom (non-built-in) type", () => {
      const customType: NodeTypeDefinition = {
        name: "service",
        label: "Service",
        color: "blue",
        icon: "IconServer",
        labelField: "name",
        identityFields: ["name"],
        jsonSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            url: { type: "string" },
          },
          required: ["name"],
        },
      };
      const doc: GraphDocument = {
        version: GRAPH_DOCUMENT_VERSION,
        name: "Custom",
        types: [customType],
        nodes: [
          {
            id: "s1",
            type: "service",
            position: { x: 4, y: 8 },
            data: { name: "api", url: "https://api.example.com" },
          },
        ],
        edges: [],
      };
      const decoded = decodeDocument(encodeDocument(doc));
      expect(decoded.types).toEqual([customType]);
      const node = decoded.nodes[0];
      if (node === undefined) throw new Error("service node missing");
      expect(node.type).toBe("service");
      expect(node.data).toEqual({ name: "api", url: "https://api.example.com" });
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

    it("throws ShareDecodeError on an unsupported compact version", () => {
      const future = compressToEncodedURIComponent(
        JSON.stringify({ v: 3, n: "future", t: [], d: [], e: [] }),
      );
      expect(() => decodeDocument(future)).toThrow(ShareDecodeError);
    });

    it("throws ShareDecodeError on a legacy v1 compact payload", () => {
      // The v1 compact wire format used per-kind codes this codec no longer
      // carries; only full v1 documents are migrated.
      const legacy = compressToEncodedURIComponent(
        JSON.stringify({ v: 1, n: "legacy", d: [], e: [] }),
      );
      expect(() => decodeDocument(legacy)).toThrow(ShareDecodeError);
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

  describe("all five original node types", () => {
    it("round-trips a representative document containing every type", () => {
      const doc = makeDocument(ids);
      const decoded = decodeDocument(encodeDocument(doc));
      const decodedTypes = decoded.nodes.map((node) => node.type);
      expect(decodedTypes).toEqual(["freeform", "org", "repo", "issue", "project"]);
    });
  });

  describe("v1 document migration", () => {
    it("migrates a compressed v1 full document to v2", () => {
      const v1 = {
        version: 1,
        name: "Legacy",
        nodes: [
          {
            id: "n1",
            kind: "org",
            position: { x: 5, y: 6 },
            data: { login: "exadev" },
          },
        ],
        edges: [],
      };
      const payload = compressToEncodedURIComponent(JSON.stringify(v1));
      const decoded = decodeDocument(payload);
      expect(decoded.version).toBe(GRAPH_DOCUMENT_VERSION);
      expect(decoded.name).toBe("Legacy");
      // kind -> type on every node.
      const node = decoded.nodes[0];
      if (node === undefined) throw new Error("migrated node missing");
      expect(node.type).toBe("org");
      expect(node.data).toEqual({ login: "exadev" });
      // The five v1 built-in type definitions are injected.
      const typeNames = decoded.types.map((t) => t.name);
      expect(typeNames).toEqual(["freeform", "org", "repo", "issue", "project"]);
    });
  });
});

describe("decodeDocument — JSON Canvas URL detection", () => {
  it("decodes a compressed JSON Canvas payload as a graphle document", () => {
    const canvasJson = JSON.stringify({
      nodes: [
        { id: "n1", type: "text", x: 10, y: 20, width: 250, height: 120, text: "Hello" },
        { id: "n2", type: "text", x: 50, y: 60, width: 250, height: 120, text: "World" },
      ],
      edges: [{ id: "e1", fromNode: "n1", toNode: "n2", label: "link" }],
    });
    const payload = compressToEncodedURIComponent(canvasJson);
    const decoded = decodeDocument(payload);
    expect(decoded.nodes).toHaveLength(2);
    expect(decoded.nodes.every((n) => n.type === "freeform")).toBe(true);
    const first = decoded.nodes[0];
    if (first !== undefined && first.type === "freeform") {
      expect(first.data.label).toBe("Hello");
    }
    expect(decoded.edges).toHaveLength(1);
    expect(decoded.edges[0]?.source).toBe("n1");
  });
});
