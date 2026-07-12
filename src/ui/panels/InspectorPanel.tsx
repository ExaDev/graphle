/**
 * Sidebar inspector for the current canvas selection.
 *
 * - Node selected: editable fields (via {@link NodeDataFields}) that commit
 *   `updateNodeData` on every change, plus a Delete button dispatching
 *   `removeNode`.
 * - Edge selected: a type Select (from `document.edgeTypes`) and, once a type
 *   is resolved, schema-driven fields via {@link EdgeDataFields}. Both commit
 *   `updateEdge`, which mirrors `updateNodeData`: it always carries the
 *   current type name and the whole `data` object, validated against that
 *   type's schema. Plus a Delete button dispatching `removeEdge`.
 * - Nothing selected: a muted hint.
 *
 * Fields are driven directly by the document (no local state), so edits
 * propagate to the store and the canvas immediately; the controlled inputs
 * stay focused because the value they render always matches what was typed.
 */
import { Button, Divider, Select, Stack, Text } from "@mantine/core";

import { resolveType, resolveEdgeType, type EdgeData, type EdgeTypeDefinition } from "@/schema";
import { useGraphStore, useSelection } from "@/ui/store/graph-store";

import { ExpandMenu } from "../flow/ExpandMenu";
import { EdgeDataFields } from "./EdgeDataFields";
import { NodeDataFields } from "./NodeDataFields";

/** Narrows `unknown` to a string-indexed record without a cast. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Seed a fresh data object for an edge switched to `typeDef`, so the
 * subsequent `updateEdge` never fails its own type's schema. Mirrors
 * `AddNodeMenu`'s `defaultDataForType`: required fields get an empty default
 * of the right JSON-Schema type; optional fields are omitted.
 */
function defaultDataForEdgeType(typeDef: EdgeTypeDefinition): EdgeData {
  const properties = typeDef.jsonSchema["properties"];
  if (!isRecord(properties)) return {};
  const requiredList = typeDef.jsonSchema["required"];
  const required = new Set(
    Array.isArray(requiredList)
      ? requiredList.filter((item): item is string => typeof item === "string")
      : [],
  );
  const data: EdgeData = {};
  for (const [name, schema] of Object.entries(properties)) {
    if (!required.has(name) || !isRecord(schema)) continue;
    const type = schema["type"];
    if (type === "number" || type === "integer") {
      data[name] = 0;
    } else if (type === "boolean") {
      data[name] = false;
    } else {
      data[name] = "";
    }
  }
  return data;
}

export function InspectorPanel() {
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
        <ExpandMenu node={node} />
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
    const edgeTypeDef = resolveEdgeType(document.edgeTypes, edge.type);
    const edgeTypeOptions = document.edgeTypes.map((type) => ({
      value: type.name,
      label: type.label,
    }));

    const handleEdgeDataChange = (data: EdgeData): void => {
      if (edgeTypeDef === undefined) return;
      apply({ type: "updateEdge", id: edge.id, edgeType: edgeTypeDef.name, data });
    };

    return (
      <Stack p="md" gap="md">
        <Text fw={600} size="sm" c="dimmed">
          Edge
        </Text>
        <Select
          label="Type"
          data={edgeTypeOptions}
          value={edge.type}
          onChange={(value) => {
            if (value === null || value === edge.type) return;
            const nextTypeDef = resolveEdgeType(document.edgeTypes, value);
            if (nextTypeDef === undefined) return;
            apply({
              type: "updateEdge",
              id: edge.id,
              edgeType: value,
              data: defaultDataForEdgeType(nextTypeDef),
            });
          }}
        />
        {edgeTypeDef !== undefined ? (
          <EdgeDataFields edge={edge} typeDef={edgeTypeDef} onChange={handleEdgeDataChange} />
        ) : (
          <Text size="sm" c="dimmed">
            This edge's type is not defined in this graph.
          </Text>
        )}
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
