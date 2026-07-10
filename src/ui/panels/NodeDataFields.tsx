/**
 * Schema-driven editor for a graph node's `data`. There are no per-type field
 * layouts any more: the control rendered for each field is derived from the
 * node type's `jsonSchema` (string -> TextInput/Textarea, enum -> Select,
 * number/integer -> NumberInput, boolean -> Switch). The component holds NO
 * state of its own: the parent controls the value (a draft in AddNodeMenu, the
 * live document node in InspectorPanel) and decides the commit cadence.
 *
 * Empty-string handling preserves the existing contract: clearing an OPTIONAL
 * field omits its key from `data` (so the document never carries an empty
 * placeholder), while a REQUIRED field keeps the empty value for the schema's
 * `min(1)` validation to flag on commit.
 */
import { NumberInput, Select, Stack, Switch, Textarea, TextInput } from "@mantine/core";

import { type GraphNode, type NodeData, type NodeTypeDefinition } from "@/schema";

export interface NodeDataFieldsProps {
  /** The node whose data is being edited. */
  node: GraphNode;
  /** Definition of the node's type; its `jsonSchema` drives the field layout. */
  typeDef: NodeTypeDefinition;
  /** Receives the next data object on every field change. */
  onChange: (next: NodeData) => void;
}

/** Narrows `unknown` to a string-indexed record without a cast. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Field names whose string value reads as long-form text and so earns a
 * Textarea rather than a single-line TextInput. Matches the hints the original
 * per-type layouts treated as multi-line.
 */
const LONG_TEXT_FIELDS = new Set(["description", "body", "note", "rationale"]);

/** The Mantine control to render for a property, derived from its JSON Schema. */
type Control = "text" | "textarea" | "select" | "number" | "boolean";

interface FieldPlan {
  name: string;
  label: string;
  required: boolean;
  control: Control;
  options: string[];
}

/** Capitalise the first character, leaving the rest untouched. */
function capitalise(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Turn a camelCase field name into a human-readable label, e.g.
 * `projectNodeId` -> `Project node id`, `url` -> `Url`. Words past the first are
 * lower-cased so acronyms folded into camelCase (`avatarUrl`) read cleanly.
 */
function humaniseFieldName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((word, index) => (index === 0 ? capitalise(word) : word.toLowerCase()));
  return words.join(" ");
}

/** Render an enum value as a human-readable Select option label. */
function humaniseEnumValue(value: string): string {
  return capitalise(value.replace(/_/g, " ").toLowerCase());
}

/**
 * Decide the control and options for one property from its JSON Schema
 * subschema. A property without a recognised `type` and without an `enum` is
 * treated as plain text (the JSON-Schema default for an unconstrained value).
 */
function planField(
  name: string,
  schema: Record<string, unknown>,
  required: boolean,
): FieldPlan {
  const label = humaniseFieldName(name);
  const enumValues = schema["enum"];
  if (Array.isArray(enumValues)) {
    return {
      name,
      label,
      required,
      control: "select",
      options: enumValues.filter((value): value is string => typeof value === "string"),
    };
  }
  const type = schema["type"];
  if (type === "boolean") return { name, label, required, control: "boolean", options: [] };
  if (type === "number" || type === "integer") {
    return { name, label, required, control: "number", options: [] };
  }
  return {
    name,
    label,
    required,
    control: LONG_TEXT_FIELDS.has(name) ? "textarea" : "text",
    options: [],
  };
}

/** Read the current data as a string (empty string when absent/non-string). */
function stringValue(data: NodeData, name: string): string {
  const value = data[name];
  return typeof value === "string" ? value : "";
}

/** Read the current data as a number, or empty string for an absent NumberInput. */
function numberValue(data: NodeData, name: string): number | string {
  const value = data[name];
  return typeof value === "number" ? value : "";
}

/** Read the current data as a boolean (false when absent/non-boolean). */
function booleanValue(data: NodeData, name: string): boolean {
  return data[name] === true;
}

/** Read the current data as a Select value (null when absent/non-string). */
function selectValue(data: NodeData, name: string): string | null {
  const value = data[name];
  return typeof value === "string" ? value : null;
}

/**
 * Build the next data object after a field edit, applying the empty-optional
 * contract: an empty string on an OPTIONAL field omits the key, everything else
 * (including empty strings on required fields) is written through.
 */
function commitField(
  data: NodeData,
  name: string,
  value: unknown,
  required: boolean,
): NodeData {
  if (!required && value === "") {
    const next: NodeData = { ...data };
    delete next[name];
    return next;
  }
  return { ...data, [name]: value };
}

export function NodeDataFields({ node, typeDef, onChange }: NodeDataFieldsProps) {
  const properties = typeDef.jsonSchema["properties"];
  const requiredList = typeDef.jsonSchema["required"];
  const required = new Set(
    Array.isArray(requiredList)
      ? requiredList.filter((item): item is string => typeof item === "string")
      : [],
  );

  if (!isRecord(properties)) {
    // A valid node type always has an object schema with `properties`; reaching
    // here means a malformed type definition, so render nothing rather than a
    // broken form.
    return null;
  }

  const plans = Object.entries(properties).map(([name, schema]) =>
    planField(name, isRecord(schema) ? schema : {}, required.has(name)),
  );

  return (
    <Stack>
      {plans.map((plan) => {
        if (plan.control === "boolean") {
          return (
            <Switch
              key={plan.name}
              label={plan.label}
              checked={booleanValue(node.data, plan.name)}
              onChange={(event) =>
                onChange(
                  commitField(node.data, plan.name, event.currentTarget.checked, plan.required),
                )
              }
            />
          );
        }
        if (plan.control === "select") {
          return (
            <Select
              key={plan.name}
              label={plan.label}
              withAsterisk={plan.required}
              placeholder={plan.required ? "Pick one" : "Optional"}
              data={plan.options.map((option) => ({
                value: option,
                label: humaniseEnumValue(option),
              }))}
              value={selectValue(node.data, plan.name)}
              onChange={(value) =>
                onChange(commitField(node.data, plan.name, value ?? "", plan.required))
              }
            />
          );
        }
        if (plan.control === "number") {
          return (
            <NumberInput
              key={plan.name}
              label={plan.label}
              withAsterisk={plan.required}
              value={numberValue(node.data, plan.name)}
              onChange={(value) => {
                if (value === "") {
                  // A required number cannot be emptied; leave the current value.
                  // An optional number is cleared (the key is omitted below).
                  if (plan.required) return;
                  onChange(commitField(node.data, plan.name, "", false));
                  return;
                }
                const parsed = Number(value);
                if (Number.isNaN(parsed)) return;
                onChange(commitField(node.data, plan.name, parsed, plan.required));
              }}
            />
          );
        }
        if (plan.control === "textarea") {
          return (
            <Textarea
              key={plan.name}
              label={plan.label}
              withAsterisk={plan.required}
              autosize
              minRows={2}
              value={stringValue(node.data, plan.name)}
              onChange={(event) =>
                onChange(
                  commitField(node.data, plan.name, event.currentTarget.value, plan.required),
                )
              }
            />
          );
        }
        return (
          <TextInput
            key={plan.name}
            label={plan.label}
            withAsterisk={plan.required}
            value={stringValue(node.data, plan.name)}
            onChange={(event) =>
              onChange(
                commitField(node.data, plan.name, event.currentTarget.value, plan.required),
              )
            }
          />
        );
      })}
    </Stack>
  );
}
