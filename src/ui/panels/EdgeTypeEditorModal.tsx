/**
 * Modal for defining a new, user-authored edge type. Mirrors
 * {@link TypeEditorModal}: the user names the type, picks presentation
 * metadata (colour, stroke style), selects which of the type's fields is the
 * edge label, and authors the field list (name + JSON-Schema type, with
 * comma-separated options for enums). There is no icon (edges render as
 * lines, not badges) and no identity-field picker (edges dedup on
 * `(source, target, type)`, never on `data`).
 *
 * On save the field list is turned into a portable JSON Schema via
 * {@link buildJsonSchemaFromFields} (Zod is the single source of truth, so the
 * output round-trips through `z.fromJSONSchema` in the type registry), wrapped
 * in an {@link EdgeTypeDefinition}, and registered on the document via
 * `store.addEdgeType`. The new type then appears in the edge type picker on
 * the inspector immediately.
 */
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTemplate, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import {
  BUILT_IN_EDGE_TYPES_BY_NAME,
  type EdgeTypeDefinition,
  buildJsonSchemaFromFields,
  type FieldDefinition,
} from "@/schema";
import { useGraphStore } from "@/ui/store/graph-store";

export interface EdgeTypeEditorModalProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Mantine accent colour names offered to user-defined edge types. Matches
 * {@link TypeEditorModal}'s palette so a chosen colour always resolves to a
 * real CSS variable.
 */
const COLOURS = [
  "blue",
  "grape",
  "teal",
  "orange",
  "gray",
  "cyan",
  "indigo",
  "pink",
  "red",
  "green",
  "yellow",
  "violet",
  "lime",
] as const;

/** Selectable stroke styles in the editor; mirrors EdgeTypeDefinition["strokeStyle"]. */
const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
type StrokeStyleName = (typeof STROKE_STYLES)[number];

/** Narrows a Select return value to a {@link StrokeStyleName} without a cast. */
function isStrokeStyleName(value: unknown): value is StrokeStyleName {
  return value === "solid" || value === "dashed" || value === "dotted";
}

/** Selectable field types in the editor; mirrors FieldDefinition["type"]. */
const FIELD_TYPES = ["string", "number", "boolean", "enum"] as const;
type FieldTypeName = (typeof FIELD_TYPES)[number];

/** Narrows a Select return value to a {@link FieldTypeName} without a cast. */
function isFieldTypeName(value: unknown): value is FieldTypeName {
  return (
    value === "string" ||
    value === "number" ||
    value === "boolean" ||
    value === "enum"
  );
}

/** Capitalise the first character, leaving the rest untouched. */
function capitalise(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * A field row in the editor. Carries a stable `id` for React keys (field names
 * are editable, so they cannot key the list); `options` is the raw
 * comma-separated text the user types, split into values only on save.
 */
interface FieldRow {
  id: string;
  name: string;
  type: FieldTypeName;
  options: string;
}

/** A blank row for the initial list and the "Add field" button. */
function newRow(): FieldRow {
  return { id: crypto.randomUUID(), name: "", type: "string", options: "" };
}

/** The outcome of {@link buildEdgeTypeDefinition}: either a ready type or an error. */
type BuildResult =
  | { ok: true; typeDef: EdgeTypeDefinition }
  | { ok: false; message: string };

export function EdgeTypeEditorModal({ opened, onClose }: EdgeTypeEditorModalProps) {
  const addEdgeType = useGraphStore((state) => state.addEdgeType);
  const document = useGraphStore((state) => state.document);

  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [colour, setColour] = useState<string>(COLOURS[0]);
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyleName>("solid");
  const [labelField, setLabelField] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldRow[]>([newRow()]);
  const [error, setError] = useState<string | undefined>(undefined);

  /**
   * Names a new type must not collide with. The document's edge types are the
   * stated constraint; built-in names are included too because
   * `resolveEdgeType` prefers a document-carried definition over the registry,
   * so a user type named "owns" would silently shadow the built-in and
   * re-resolve every existing owns edge against the new shape. Blocking the
   * collision here is the root-cause fix.
   */
  const takenNames = new Set<string>([
    ...document.edgeTypes.map((type) => type.name),
    ...BUILT_IN_EDGE_TYPES_BY_NAME.keys(),
  ]);

  /** Field names the user has actually filled in, for the label pick. */
  const definedFieldNames = fields
    .map((row) => row.name.trim())
    .filter((fieldName) => fieldName !== "");

  /** Validate every constraint then build the type definition, in one pass. */
  function buildEdgeTypeDefinition(): BuildResult {
    const trimmedName = name.trim();
    if (trimmedName === "") return fail("Give the type a name.");
    if (takenNames.has(trimmedName)) {
      return fail(`A type named "${trimmedName}" already exists.`);
    }

    const trimmedLabel = label.trim();
    if (trimmedLabel === "") return fail("Give the type a display label.");

    const fieldDefs: FieldDefinition[] = [];
    const seen = new Set<string>();
    for (const row of fields) {
      const fieldName = row.name.trim();
      if (fieldName === "") return fail("Every field needs a name.");
      if (seen.has(fieldName)) return fail(`Duplicate field "${fieldName}".`);
      seen.add(fieldName);
      if (row.type === "enum") {
        const options = row.options
          .split(",")
          .map((option) => option.trim())
          .filter((option) => option !== "");
        if (options.length === 0) {
          return fail(`Enum field "${fieldName}" needs at least one option.`);
        }
        fieldDefs.push({ name: fieldName, type: "enum", options });
      } else {
        fieldDefs.push({ name: fieldName, type: row.type });
      }
    }
    if (fieldDefs.length === 0) return fail("Add at least one field.");

    if (labelField === null) return fail("Pick which field is the label.");
    if (!seen.has(labelField)) {
      return fail("The label field must be one of the defined fields.");
    }

    return {
      ok: true,
      typeDef: {
        name: trimmedName,
        label: trimmedLabel,
        color: colour,
        strokeStyle,
        labelField,
        jsonSchema: buildJsonSchemaFromFields(fieldDefs),
      },
    };
  }

  function handleSave(): void {
    const result = buildEdgeTypeDefinition();
    if (result.ok) {
      addEdgeType(result.typeDef);
      resetForm();
      onClose();
    } else {
      setError(result.message);
    }
  }

  function handleClose(): void {
    resetForm();
    onClose();
  }

  function resetForm(): void {
    setName("");
    setLabel("");
    setColour(COLOURS[0]);
    setStrokeStyle("solid");
    setLabelField(null);
    setFields([newRow()]);
    setError(undefined);
  }

  function addField(): void {
    setFields((prev) => [...prev, newRow()]);
  }

  function updateField(id: string, patch: Partial<Omit<FieldRow, "id">>): void {
    setFields((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeField(id: string): void {
    setFields((prev) => prev.filter((row) => row.id !== id));
  }

  const fieldPickData = definedFieldNames.map((fieldName) => ({
    value: fieldName,
    label: fieldName,
  }));

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="New edge type"
      centered
      size="lg"
    >
      <Stack>
        <TextInput
          label="Name"
          description="Unique key stored on each edge, e.g. depends-on"
          placeholder="depends-on"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <TextInput
          label="Display label"
          description="Shown in the type picker"
          placeholder="Depends on"
          value={label}
          onChange={(event) => setLabel(event.currentTarget.value)}
        />

        <Group grow>
          <Select
            label="Colour"
            data={COLOURS.map((value) => ({ value, label: capitalise(value) }))}
            value={colour}
            onChange={(value) => {
              if (value !== null) setColour(value);
            }}
          />
          <Select
            label="Stroke style"
            data={STROKE_STYLES.map((value) => ({ value, label: capitalise(value) }))}
            value={strokeStyle}
            onChange={(value) => {
              if (isStrokeStyleName(value)) setStrokeStyle(value);
            }}
          />
        </Group>

        <Select
          label="Label field"
          description="Whose value is shown as the edge's label"
          placeholder="Pick a field"
          searchable
          data={fieldPickData}
          value={labelField}
          onChange={setLabelField}
        />

        <Stack gap="xs">
          <Text component="label" size="sm" fw={500}>
            Fields
          </Text>
          {fields.map((row) => (
            <Group key={row.id} gap="xs" align="flex-end" wrap="nowrap">
              <TextInput
                placeholder="Field name"
                value={row.name}
                onChange={(event) =>
                  updateField(row.id, { name: event.currentTarget.value })
                }
                style={{ flex: 1 }}
              />
              <Select
                data={FIELD_TYPES.map((value) => ({
                  value,
                  label: capitalise(value),
                }))}
                value={row.type}
                onChange={(value) => {
                  if (isFieldTypeName(value)) updateField(row.id, { type: value });
                }}
                style={{ width: 130 }}
              />
              {row.type === "enum" ? (
                <TextInput
                  placeholder="comma, separated, values"
                  value={row.options}
                  onChange={(event) =>
                    updateField(row.id, { options: event.currentTarget.value })
                  }
                  style={{ flex: 1 }}
                />
              ) : null}
              <ActionIcon
                color="red"
                variant="subtle"
                aria-label="Remove field"
                onClick={() => removeField(row.id)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Button
            variant="light"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={addField}
          >
            Add field
          </Button>
        </Stack>

        {error !== undefined ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}

        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button leftSection={<IconTemplate size={16} />} onClick={handleSave}>
            Create type
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Build a negative {@link BuildResult} concisely. */
function fail(message: string): BuildResult {
  return { ok: false, message };
}
