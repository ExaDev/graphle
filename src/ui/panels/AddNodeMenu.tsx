/**
 * Modal for adding a node to the canvas. The user picks a type from the
 * document's type definitions, fills the type's fields (rendered by
 * {@link NodeDataFields} over a draft seeded from the type's JSON Schema), and
 * on "Create" the draft is validated against the type's Zod schema before an
 * `addNode` operation is dispatched at a cascaded position.
 *
 * Validation uses {@link zodSchemaForType} (built-in types keep their original
 * Zod schema; custom types reconstruct one from `jsonSchema`), so a type's
 * required fields cannot drift out of sync with the single source of truth.
 */
import { useState } from "react";
import { Alert, Button, Modal, Select, Stack, Text } from "@mantine/core";

import { cascadePosition } from "@/domain";
import {
  GraphNodeSchema,
  type GraphNode,
  type NodeData,
  type NodeTypeDefinition,
  type Position,
  zodSchemaForType,
} from "@/schema";
import { useGraphStore } from "@/ui/store/graph-store";

import { NodeDataFields } from "./NodeDataFields";

export interface AddNodeMenuProps {
  opened: boolean;
  onClose: () => void;
  /**
   * An explicit position for the new node, supplied when the modal is opened
   * from a pane right-click ("Add node here"); `undefined` for the toolbar
   * "Add node" path, which places the node on the add-cascade grid via
   * {@link cascadePosition}. Modelled as `Position | undefined` (not optional)
   * so the caller can always pass a value under `exactOptionalPropertyTypes`.
   */
  initialPosition: Position | undefined;
}

/** Narrows `unknown` to a string-indexed record without a cast. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Seed a fresh data object for a newly created node of `typeDef`. Required
 * fields are populated with an empty default of the right JSON-Schema type
 * (string -> "", number/integer -> 0, boolean -> false, enum -> "") so the form
 * renders them with a placeholder value; optional fields are omitted. The
 * values are placeholders, not valid content — `validate` catches a required
 * string left empty before the node is created.
 */
function defaultDataForType(typeDef: NodeTypeDefinition): NodeData {
  const properties = typeDef.jsonSchema["properties"];
  if (!isRecord(properties)) return {};
  const requiredList = typeDef.jsonSchema["required"];
  const required = new Set(
    Array.isArray(requiredList)
      ? requiredList.filter((item): item is string => typeof item === "string")
      : [],
  );
  const data: NodeData = {};
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

/**
 * Build a fresh draft node for `typeDef`, parsed through {@link GraphNode} so the
 * `type`/`data` pairing is validated. The throwaway id is overwritten by
 * `handleCreate` with a fresh UUID; it only has to satisfy the schema here.
 */
function makeDraft(typeDef: NodeTypeDefinition): GraphNode {
  return GraphNodeSchema.parse({
    id: crypto.randomUUID(),
    type: typeDef.name,
    position: { x: 0, y: 0 },
    data: defaultDataForType(typeDef),
  });
}

/**
 * The structural slice of a Zod safe-parse result that {@link firstIssue}
 * needs. Zod's own `SafeParseReturnType` is generic over the output type; this
 * structural shape lets one helper accept any schema's result without a type
 * parameter, since `success` and the `error.issues` array are uniform.
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

/** Validate a draft against its type's Zod schema, returning the first issue. */
function validate(typeDef: NodeTypeDefinition, data: NodeData): string | undefined {
  return firstIssue(zodSchemaForType(typeDef).safeParse(data));
}

export function AddNodeMenu({ opened, onClose, initialPosition }: AddNodeMenuProps) {
  const apply = useGraphStore((state) => state.apply);
  const document = useGraphStore((state) => state.document);

  const typeOptions = document.types.map((type) => ({ value: type.name, label: type.label }));

  const [typeName, setTypeName] = useState<string>(() => document.types[0]?.name ?? "");
  const typeDef = document.types.find((type) => type.name === typeName);
  // The draft is undefined only when the document defines no node types at all
  // (a degenerate but schema-valid document); in that case there is nothing to
  // create and the form is replaced by a hint.
  const [draft, setDraft] = useState<GraphNode | undefined>(() => {
    const first = document.types[0];
    return first !== undefined ? makeDraft(first) : undefined;
  });
  const [error, setError] = useState<string | undefined>(undefined);

  function handleTypeChange(next: string | null): void {
    if (next === null || next === typeName) return;
    const nextTypeDef = document.types.find((type) => type.name === next);
    if (nextTypeDef === undefined) return;
    setTypeName(next);
    setDraft(makeDraft(nextTypeDef));
    setError(undefined);
  }

  function handleDataChange(data: NodeData): void {
    setDraft((prev) =>
      prev !== undefined ? GraphNodeSchema.parse({ ...prev, data }) : prev,
    );
  }

  function handleCreate(): void {
    if (typeDef === undefined || draft === undefined) return;
    const message = validate(typeDef, draft.data);
    if (message !== undefined) {
      setError(message);
      return;
    }
    apply({
      type: "addNode",
      node: {
        ...draft,
        id: crypto.randomUUID(),
        position: initialPosition ?? cascadePosition(document.nodes.length),
      },
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
        <Select label="Type" data={typeOptions} value={typeName} onChange={handleTypeChange} />
        {draft !== undefined && typeDef !== undefined ? (
          <NodeDataFields node={draft} typeDef={typeDef} onChange={handleDataChange} />
        ) : (
          <Text size="sm" c="dimmed">
            This graph defines no node types.
          </Text>
        )}
        {error !== undefined && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <Button onClick={handleCreate} disabled={draft === undefined || typeDef === undefined}>
          Create node
        </Button>
      </Stack>
    </Modal>
  );
}
