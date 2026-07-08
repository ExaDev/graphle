/**
 * Modal for adding a node to the canvas. The user picks a kind from the
 * registry, fills the kind-specific fields (rendered by {@link NodeDataFields}
 * over a draft seeded from `NODE_KINDS[kind].defaultData()`), and on "Create"
 * the draft is validated against its per-kind Zod schema before an `addNode`
 * operation is dispatched at a cascaded position.
 *
 * Validation uses the schema layer (`FreeformNodeData.safeParse`, etc.) rather
 * than ad-hoc checks, so a kind's required fields cannot drift out of sync
 * with the single source of truth.
 */
import { useState } from "react";
import { Alert, Button, Modal, SegmentedControl, Stack } from "@mantine/core";

import {
  FreeformNodeData,
  GraphNode,
  IssueNodeData,
  NodeKind,
  OrgNodeData,
  ProjectNodeData,
  RepoNodeData,
  type NodeData,
} from "@/schema";
import { cascadePosition } from "@/domain";
import { useGraphStore } from "@/ui/store/graph-store";

import { NODE_KINDS } from "../flow/node-kinds-registry";
import { NodeDataFields } from "./NodeDataFields";

export interface AddNodeMenuProps {
  opened: boolean;
  onClose: () => void;
}

/** Kind options for the segmented control, derived from the Zod enum. */
const KIND_OPTIONS = NodeKind.options.map((value) => ({
  value,
  label: NODE_KINDS[value].label,
}));

/**
 * Build a fresh draft node for a kind, seeded from the registry's
 * `defaultData()`. Parsed through `GraphNode` so the `kind`/`data` pairing is
 * validated rather than asserted — the registry pairs them by construction,
 * but TypeScript cannot see that a variable kind correlates with the union
 * data, so the schema is the boundary that restores the correlation.
 */
function makeDraft(kind: NodeKind): GraphNode {
  return GraphNode.parse({
    // A real throwaway id: NodeId is z.string().min(1), so "" would throw a
    // ZodError here. handleCreate overwrites the id with a fresh UUID, so this
    // one only has to satisfy the schema while the kind/data pairing is checked.
    id: crypto.randomUUID(),
    kind,
    position: { x: 0, y: 0 },
    data: NODE_KINDS[kind].defaultData(),
  });
}

/** Narrow a segmented-control value (a raw string) back to a node kind. */
function isNodeKind(value: string): value is NodeKind {
  return (
    value === "freeform" ||
    value === "org" ||
    value === "repo" ||
    value === "issue" ||
    value === "project"
  );
}

/**
 * The structural slice of a Zod safe-parse result that {@link firstIssue}
 * needs. Zod's own `SafeParseReturnType` is generic over the output type;
 * this structural shape lets one helper accept any schema's result without a
 * type parameter, since `success` and the `error.issues` array are uniform.
 */
type ParseResult =
  | { success: true }
  | { success: false; error: { issues: Array<{ message: string }> } };

/** Extract the first issue message from a parse result, or undefined if valid. */
function firstIssue(result: ParseResult): string | undefined {
  if (result.success) return undefined;
  const first = result.error.issues[0];
  return first !== undefined ? first.message : "Some fields are invalid";
}

/** Validate a draft against its per-kind schema, returning the first issue. */
function validate(kind: NodeKind, data: NodeData): string | undefined {
  switch (kind) {
    case "freeform":
      return firstIssue(FreeformNodeData.safeParse(data));
    case "org":
      return firstIssue(OrgNodeData.safeParse(data));
    case "repo":
      return firstIssue(RepoNodeData.safeParse(data));
    case "issue":
      return firstIssue(IssueNodeData.safeParse(data));
    case "project":
      return firstIssue(ProjectNodeData.safeParse(data));
  }
}

export function AddNodeMenu({ opened, onClose }: AddNodeMenuProps) {
  const apply = useGraphStore((state) => state.apply);
  const document = useGraphStore((state) => state.document);

  const [kind, setKind] = useState<NodeKind>("freeform");
  const [draft, setDraft] = useState<GraphNode>(() => makeDraft("freeform"));
  const [error, setError] = useState<string | undefined>(undefined);

  function handleKindChange(next: string): void {
    if (!isNodeKind(next) || next === kind) return;
    setKind(next);
    setDraft(makeDraft(next));
    setError(undefined);
  }

  function handleCreate(): void {
    const message = validate(kind, draft.data);
    if (message !== undefined) {
      setError(message);
      return;
    }
    apply({
      type: "addNode",
      node: { ...draft, id: crypto.randomUUID(), position: cascadePosition(document.nodes.length) },
    });
    setError(undefined);
    onClose();
  }

  function handleClose(): void {
    setError(undefined);
    onClose();
  }

  return (
    <Modal opened={opened} onClose={handleClose} title="Add node" centered>
      <Stack>
        <SegmentedControl
          fullWidth
          value={kind}
          onChange={handleKindChange}
          data={KIND_OPTIONS}
        />
        <NodeDataFields node={draft} onChange={(data) => setDraft(GraphNode.parse({ ...draft, data }))} />
        {error !== undefined && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <Button onClick={handleCreate}>Create node</Button>
      </Stack>
    </Modal>
  );
}
