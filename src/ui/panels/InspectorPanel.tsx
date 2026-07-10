/**
 * Sidebar inspector for the current canvas selection.
 *
 * - Node selected: editable fields (via {@link NodeDataFields}) that commit
 *   `updateNodeData` on every change, plus a Delete button dispatching
 *   `removeNode`.
 * - Edge selected: a relation Select and a label TextInput. Both dispatch
 *   `updateEdge`. An empty label is sent as `label: ""`, which the domain
 *   reducer treats as "clear the label" (it omits the optional key), so the
 *   document never carries an empty-string label. Plus a Delete button
 *   dispatching `removeEdge`.
 * - Nothing selected: a muted hint.
 *
 * Node fields are driven directly by the document (no local state), so edits
 * propagate to the store and the canvas immediately; the controlled inputs
 * stay focused because the value they render always matches what was typed.
 */
import { Button, Divider, Select, Stack, Text, TextInput } from "@mantine/core";

import { resolveType, EdgeRelation } from "@/schema";
import { useGraphStore, useSelection } from "@/ui/store/graph-store";

import { ExpandMenu } from "../flow/ExpandMenu";
import { NodeDataFields } from "./NodeDataFields";

/** Human-readable labels for each edge relation, keyed by the enum value. */
const RELATION_LABELS: Record<EdgeRelation, string> = {
  owns: "Owns",
  contains: "Contains",
  tracks: "Tracks",
  references: "References",
  custom: "Custom",
};

/** Select options for the relation dropdown, in enum order. */
const RELATION_OPTIONS = EdgeRelation.options.map((value) => ({
  value,
  label: RELATION_LABELS[value],
}));

/** Narrows an arbitrary select value back to the edge-relation enum. */
function isEdgeRelation(value: unknown): value is EdgeRelation {
  return (
    value === "owns" ||
    value === "contains" ||
    value === "tracks" ||
    value === "references" ||
    value === "custom"
  );
}

export interface InspectorPanelProps {
  /** Opens the GitHub panel; passed to {@link ExpandMenu} for the no-PAT case. */
  onOpenGitHub: () => void;
}

export function InspectorPanel({ onOpenGitHub }: InspectorPanelProps) {
  const document = useGraphStore((state) => state.document);
  const apply = useGraphStore((state) => state.apply);
  const setSelection = useGraphStore((state) => state.setSelection);
  const selection = useSelection();

  const node =
    selection.nodeId === undefined
      ? undefined
      : document.nodes.find((n) => n.id === selection.nodeId);
  const edge =
    selection.edgeId === undefined
      ? undefined
      : document.edges.find((e) => e.id === selection.edgeId);

  function clearSelection(): void {
    setSelection({ nodeId: undefined, edgeId: undefined });
  }

  if (node !== undefined) {
    const typeDef = resolveType(document.types, node.type);
    return (
      <Stack p="md" gap="md">
        <Text fw={600} size="sm" c="dimmed">
          {typeDef?.label ?? node.type} node
        </Text>
        {typeDef !== undefined ? (
          <NodeDataFields
            node={node}
            typeDef={typeDef}
            onChange={(data) =>
              apply({ type: "updateNodeData", id: node.id, nodeType: node.type, data })
            }
          />
        ) : (
          <Text size="sm" c="dimmed">
            This node's type is not defined in this graph.
          </Text>
        )}
        <ExpandMenu node={node} onOpenGitHub={onOpenGitHub} />
        <Divider />
        <Button
          variant="light"
          color="red"
          onClick={() => {
            apply({ type: "removeNode", id: node.id });
            clearSelection();
          }}
        >
          Delete node
        </Button>
      </Stack>
    );
  }

  if (edge !== undefined) {
    return (
      <Stack p="md" gap="md">
        <Text fw={600} size="sm" c="dimmed">
          Edge
        </Text>
        <Select
          label="Relation"
          data={RELATION_OPTIONS}
          value={edge.relation}
          onChange={(value) => {
            if (isEdgeRelation(value)) {
              apply({ type: "updateEdge", id: edge.id, relation: value });
            }
          }}
        />
        <TextInput
          label="Label"
          placeholder="Optional"
          value={edge.label ?? ""}
          onChange={(event) =>
            apply({ type: "updateEdge", id: edge.id, label: event.currentTarget.value })
          }
        />
        <Divider />
        <Button
          variant="light"
          color="red"
          onClick={() => {
            apply({ type: "removeEdge", id: edge.id });
            clearSelection();
          }}
        >
          Delete edge
        </Button>
      </Stack>
    );
  }

  return (
    <Stack p="md" gap="md">
      <Text size="sm" c="dimmed">
        Select a node or edge on the canvas to edit it.
      </Text>
    </Stack>
  );
}
