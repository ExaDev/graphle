/**
 * Modal for defining a new, user-authored node type, or editing an existing
 * one when opened with an `editing` prop. The user names the type, picks
 * presentation metadata (colour, icon), selects which of the type's fields
 * is the display label and which form the dedupe identity, and authors the
 * field list (name + JSON-Schema type, with comma-separated options for
 * enums). In edit mode the name is fixed (it is the document's key for the
 * type) and every other field pre-fills from the type being edited, via
 * {@link fieldsFromJsonSchema} to recover the field-row list.
 *
 * On save the field list is turned into a portable JSON Schema via
 * {@link buildJsonSchemaFromFields} (Zod is the single source of truth, so the
 * output round-trips through `z.fromJSONSchema` in the type registry), wrapped in
 * a {@link NodeTypeDefinition}, and either registered on the document via
 * `store.addType` (create) or merged into the existing definition via
 * `store.updateType` (edit). The type then appears in the Add-node picker and
 * on the canvas immediately. When creating, checking "Also save to library"
 * additionally appends the new type to the user's persisted type library.
 *
 * Validation is collected into one pass and surfaced as a single message: the
 * constraints (unique name, at least one field, label field references a defined
 * field, every enum has options) are the preconditions for
 * `buildJsonSchemaFromFields` and `addType`/`updateType` to succeed, not
 * speculative guards. The type being edited is exempt from the name-collision
 * check since its own unchanged name is not a collision.
 *
 * The form's local state lives in {@link TypeEditorFormBody}, mounted only
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
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTemplate, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { nodeTypeNameTaken } from "@/domain/type-name-collision";
import {
  type NodeTypeDefinition,
  type StoredTypeLibrary,
  type TypeLibraryDocument,
  buildJsonSchemaFromFields,
  fieldsFromJsonSchema,
  type FieldDefinition,
} from "@/schema";
import {
  AVAILABLE_ICON_NAMES,
  DEFAULT_ICON_NAME,
} from "@/ui/flow/type-presentation";
import { useGraphStore } from "@/ui/store/graph-store";
import { db } from "@/storage/db";
import { createTypeLibraryStore } from "@/storage/type-library-store-dexie";

export interface TypeEditorModalProps {
  opened: boolean;
  onClose: () => void;
  /** When set, the modal edits this existing type instead of creating a new
   *  one: the name field is disabled and every other field pre-fills from
   *  its current values. */
  editing?: NodeTypeDefinition;
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
 * Mantine accent colour names offered to user-defined types. Covers the palette
 * the canvas already reads via `var(--mantine-color-<name>-6)`, so a chosen
 * colour always resolves to a real CSS variable.
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
function initialFields(editing: NodeTypeDefinition | undefined): FieldRow[] {
  if (editing === undefined) return [newRow()];
  const recovered = fieldsFromJsonSchema(editing.jsonSchema).map(rowFromFieldDefinition);
  return recovered.length > 0 ? recovered : [newRow()];
}

/** The outcome of {@link buildTypeDefinition}: either a ready type or an error. */
type BuildResult =
  | { ok: true; typeDef: NodeTypeDefinition }
  | { ok: false; message: string };

export function TypeEditorModal({ opened, onClose, editing }: TypeEditorModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing === undefined ? "New node type" : "Edit node type"}
      centered
      size="lg"
    >
      {opened ? <TypeEditorFormBody editing={editing} onClose={onClose} /> : null}
    </Modal>
  );
}

interface TypeEditorFormBodyProps {
  editing: NodeTypeDefinition | undefined;
  onClose: () => void;
}

/** The modal's form, mounted fresh each time the modal opens -- see the
 *  module doc for why that replaces an effect-based resync. */
function TypeEditorFormBody({ editing, onClose }: TypeEditorFormBodyProps) {
  const addType = useGraphStore((state) => state.addType);
  const updateType = useGraphStore((state) => state.updateType);
  const document = useGraphStore((state) => state.document);

  const [name, setName] = useState(editing?.name ?? "");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [colour, setColour] = useState<string>(editing?.color ?? COLOURS[0]);
  const [icon, setIcon] = useState<string>(editing?.icon ?? DEFAULT_ICON_NAME);
  const [labelField, setLabelField] = useState<string | null>(
    editing?.labelField ?? null,
  );
  const [identityFields, setIdentityFields] = useState<string[]>(
    editing?.identityFields ?? [],
  );
  const [fields, setFields] = useState<FieldRow[]>(() => initialFields(editing));
  const [alsoSaveToLibrary, setAlsoSaveToLibrary] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /** Field names the user has actually filled in, for the label/identity picks. */
  const definedFieldNames = fields
    .map((row) => row.name.trim())
    .filter((fieldName) => fieldName !== "");

  /** Validate every constraint then build the type definition, in one pass. */
  function buildTypeDefinition(): BuildResult {
    const trimmedName = name.trim();
    if (trimmedName === "") return fail("Give the type a name.");
    // The type being edited keeps its own name (the field is disabled), so its
    // unchanged name must never be flagged as already taken.
    if (
      (editing === undefined || trimmedName !== editing.name) &&
      nodeTypeNameTaken(trimmedName, document.types)
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

    // Identity fields are picked from the live field list, but a field may have
    // been renamed after selection; keep only those that still exist so the
    // definition never references a missing field.
    const validIdentityFields = identityFields.filter((fieldName) =>
      seen.has(fieldName),
    );

    return {
      ok: true,
      typeDef: {
        name: trimmedName,
        label: trimmedLabel,
        color: colour,
        icon,
        labelField,
        identityFields: validIdentityFields,
        jsonSchema: buildJsonSchemaFromFields(fieldDefs),
      },
    };
  }

  /** Append `typeDef` to the persisted node type library, creating it if none
   *  is saved yet. */
  async function addToLibrary(typeDef: NodeTypeDefinition): Promise<void> {
    const controller = new AbortController();
    const store = createTypeLibraryStore(db);
    const stored = await store.get(controller.signal);
    const libraryDocument = stored === undefined ? EMPTY_LIBRARY : stored.document;
    const updatedDocument: TypeLibraryDocument = {
      ...libraryDocument,
      nodeTypes: [...libraryDocument.nodeTypes, typeDef],
    };
    const updated: StoredTypeLibrary =
      stored === undefined
        ? { id: "library", document: updatedDocument, updatedAt: new Date().toISOString() }
        : { ...stored, document: updatedDocument, updatedAt: new Date().toISOString() };
    await store.save(updated, controller.signal);
  }

  async function handleSave(): Promise<void> {
    const result = buildTypeDefinition();
    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (editing !== undefined) {
      const patch: Partial<Omit<NodeTypeDefinition, "name">> = {
        label: result.typeDef.label,
        color: result.typeDef.color,
        icon: result.typeDef.icon,
        labelField: result.typeDef.labelField,
        identityFields: result.typeDef.identityFields,
        jsonSchema: result.typeDef.jsonSchema,
      };
      updateType(editing.name, patch);
      onClose();
      return;
    }

    addType(result.typeDef);
    if (alsoSaveToLibrary) {
      try {
        await addToLibrary(result.typeDef);
        notifications.show({
          color: "green",
          message: `Node type "${result.typeDef.name}" created and saved to your type library`,
        });
      } catch (error) {
        notifications.show({
          color: "red",
          message: `Node type created, but saving to the library failed: ${describe(error)}`,
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
        description="Unique key stored on each node, e.g. service"
        placeholder="service"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        disabled={editing !== undefined}
      />
      <TextInput
        label="Display label"
        description="Shown on the node badge"
        placeholder="Service"
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
          label="Icon"
          searchable
          data={AVAILABLE_ICON_NAMES.map((value) => ({
            value,
            label: value.replace(/^Icon/, ""),
          }))}
          value={icon}
          onChange={(value) => {
            if (value !== null) setIcon(value);
          }}
        />
      </Group>

      <Select
        label="Label field"
        description="Whose value is shown as the node's primary label"
        placeholder="Pick a field"
        searchable
        data={fieldPickData}
        value={labelField}
        onChange={setLabelField}
      />
      <MultiSelect
        label="Identity fields"
        description="Fields that together identify a node (for dedupe/merge)"
        placeholder="Pick fields"
        searchable
        data={fieldPickData}
        value={identityFields}
        onChange={setIdentityFields}
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
