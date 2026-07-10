/**
 * Modal for defining a new, user-authored edge type, or editing an existing
 * one when opened with an `editing` prop. Mirrors {@link TypeEditorModal}:
 * the user names the type, picks presentation metadata (colour, stroke
 * style), selects which of the type's fields is the edge label, and authors
 * the field list (name + JSON-Schema type, with comma-separated options for
 * enums). There is no icon (edges render as lines, not badges) and no
 * identity-field picker (edges dedup on `(source, target, type)`, never on
 * `data`). In edit mode the name is fixed (it is the document's key for the
 * type) and every other field pre-fills from the type being edited, via
 * {@link fieldsFromJsonSchema} to recover the field-row list.
 *
 * On save the field list is turned into a portable JSON Schema via
 * {@link buildJsonSchemaFromFields} (Zod is the single source of truth, so the
 * output round-trips through `z.fromJSONSchema` in the type registry), wrapped
 * in an {@link EdgeTypeDefinition}, and either registered on the document via
 * `store.addEdgeType` (create) or merged into the existing definition via
 * `store.updateEdgeType` (edit). The type then appears in the edge type
 * picker on the inspector immediately. When creating, checking "Also save to
 * library" additionally appends the new type to the user's persisted type
 * library.
 *
 * The form's local state lives in {@link EdgeTypeEditorFormBody}, mounted only
 * while `opened` is true: mounting fresh on every open (rather than syncing
 * an already-mounted form from a changed `editing` prop via an effect) is
 * what re-initialises the fields from `editing` each time, and is also what
 * resets a create-mode form back to blank after a cancel or save -- no
 * imperative reset step is needed.
 */
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTemplate, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { edgeTypeNameTaken } from "@/domain/type-name-collision";
import {
  type EdgeTypeDefinition,
  type StoredTypeLibrary,
  type TypeLibraryDocument,
  buildJsonSchemaFromFields,
  fieldsFromJsonSchema,
  type FieldDefinition,
} from "@/schema";
import { useGraphStore } from "@/ui/store/graph-store";
import { db } from "@/storage/db";
import { createTypeLibraryStore } from "@/storage/type-library-store-dexie";

export interface EdgeTypeEditorModalProps {
  opened: boolean;
  onClose: () => void;
  /** When set, the modal edits this existing type instead of creating a new
   *  one: the name field is disabled and every other field pre-fills from
   *  its current values. */
  editing?: EdgeTypeDefinition;
}

/** An empty library document, used when none has been saved yet. */
const EMPTY_LIBRARY: TypeLibraryDocument = {
  version: 1,
  nodeTypes: [],
  edgeTypes: [],
};

/** Narrows an unknown thrown value to a display string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

/** Turn a recovered {@link FieldDefinition} back into an editable row. */
function rowFromFieldDefinition(field: FieldDefinition): FieldRow {
  return {
    id: crypto.randomUUID(),
    name: field.name,
    type: field.type,
    options:
      field.type === "enum" && field.options !== undefined
        ? field.options.join(", ")
        : "",
  };
}

/** The field rows a fresh form starts from: `editing`'s recovered fields, or
 *  one blank row when creating (or when `editing` has no recognisable
 *  fields, which cannot happen for a type produced by this editor). */
function initialFields(editing: EdgeTypeDefinition | undefined): FieldRow[] {
  if (editing === undefined) return [newRow()];
  const recovered = fieldsFromJsonSchema(editing.jsonSchema).map(rowFromFieldDefinition);
  return recovered.length > 0 ? recovered : [newRow()];
}

/** The outcome of {@link buildEdgeTypeDefinition}: either a ready type or an error. */
type BuildResult =
  | { ok: true; typeDef: EdgeTypeDefinition }
  | { ok: false; message: string };

export function EdgeTypeEditorModal({
  opened,
  onClose,
  editing,
}: EdgeTypeEditorModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing === undefined ? "New edge type" : "Edit edge type"}
      centered
      size="lg"
    >
      {opened ? <EdgeTypeEditorFormBody editing={editing} onClose={onClose} /> : null}
    </Modal>
  );
}

interface EdgeTypeEditorFormBodyProps {
  editing: EdgeTypeDefinition | undefined;
  onClose: () => void;
}

/** The modal's form, mounted fresh each time the modal opens -- see the
 *  module doc for why that replaces an effect-based resync. */
function EdgeTypeEditorFormBody({ editing, onClose }: EdgeTypeEditorFormBodyProps) {
  const addEdgeType = useGraphStore((state) => state.addEdgeType);
  const updateEdgeType = useGraphStore((state) => state.updateEdgeType);
  const document = useGraphStore((state) => state.document);

  const [name, setName] = useState(editing?.name ?? "");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [colour, setColour] = useState<string>(editing?.color ?? COLOURS[0]);
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyleName>(
    editing?.strokeStyle ?? "solid",
  );
  const [labelField, setLabelField] = useState<string | null>(
    editing?.labelField ?? null,
  );
  const [fields, setFields] = useState<FieldRow[]>(() => initialFields(editing));
  const [alsoSaveToLibrary, setAlsoSaveToLibrary] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /** Field names the user has actually filled in, for the label pick. */
  const definedFieldNames = fields
    .map((row) => row.name.trim())
    .filter((fieldName) => fieldName !== "");

  /** Validate every constraint then build the type definition, in one pass. */
  function buildEdgeTypeDefinition(): BuildResult {
    const trimmedName = name.trim();
    if (trimmedName === "") return fail("Give the type a name.");
    // The type being edited keeps its own name (the field is disabled), so its
    // unchanged name must never be flagged as already taken.
    if (
      (editing === undefined || trimmedName !== editing.name) &&
      edgeTypeNameTaken(trimmedName, document.edgeTypes)
    ) {
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

  /** Append `typeDef` to the persisted edge type library, creating it if none
   *  is saved yet. */
  async function addToLibrary(typeDef: EdgeTypeDefinition): Promise<void> {
    const controller = new AbortController();
    const store = createTypeLibraryStore(db);
    const stored = await store.get(controller.signal);
    const libraryDocument = stored === undefined ? EMPTY_LIBRARY : stored.document;
    const updatedDocument: TypeLibraryDocument = {
      ...libraryDocument,
      edgeTypes: [...libraryDocument.edgeTypes, typeDef],
    };
    const updated: StoredTypeLibrary =
      stored === undefined
        ? { id: "library", document: updatedDocument, updatedAt: new Date().toISOString() }
        : { ...stored, document: updatedDocument, updatedAt: new Date().toISOString() };
    await store.save(updated, controller.signal);
  }

  async function handleSave(): Promise<void> {
    const result = buildEdgeTypeDefinition();
    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (editing !== undefined) {
      const patch: Partial<Omit<EdgeTypeDefinition, "name">> = {
        label: result.typeDef.label,
        color: result.typeDef.color,
        strokeStyle: result.typeDef.strokeStyle,
        labelField: result.typeDef.labelField,
        jsonSchema: result.typeDef.jsonSchema,
      };
      updateEdgeType(editing.name, patch);
      onClose();
      return;
    }

    addEdgeType(result.typeDef);
    if (alsoSaveToLibrary) {
      try {
        await addToLibrary(result.typeDef);
        notifications.show({
          color: "green",
          message: `Edge type "${result.typeDef.name}" created and saved to your type library`,
        });
      } catch (error) {
        notifications.show({
          color: "red",
          message: `Edge type created, but saving to the library failed: ${describe(error)}`,
        });
      }
    }
    onClose();
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
    <Stack>
      <TextInput
        label="Name"
        description="Unique key stored on each edge, e.g. depends-on"
        placeholder="depends-on"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        disabled={editing !== undefined}
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

      {editing === undefined ? (
        <Checkbox
          label="Also save to library"
          checked={alsoSaveToLibrary}
          onChange={(event) => setAlsoSaveToLibrary(event.currentTarget.checked)}
        />
      ) : null}

      {error !== undefined ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}

      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          leftSection={<IconTemplate size={16} />}
          onClick={() => void handleSave()}
        >
          {editing === undefined ? "Create type" : "Save changes"}
        </Button>
      </Group>
    </Stack>
  );
}

/** Build a negative {@link BuildResult} concisely. */
function fail(message: string): BuildResult {
  return { ok: false, message };
}
