/**
 * Shared, kind-aware editor for a graph node's `data`. Renders the
 * kind-specific Mantine inputs for whatever kind the node carries, and emits
 * the next data object via `onChange`. It holds NO state of its own: the
 * parent controls the value (a draft in {@link AddNodeMenu}, the live document
 * node in {@link InspectorPanel}) and decides the commit cadence.
 *
 * The component narrows `node.data` by switching on `node.kind` (the node is a
 * discriminated union on `kind`), so each case sees the matching data variant
 * with no casts. Optional string fields are spread-then-set, so clearing one
 * leaves an empty string in the document (which every per-kind schema permits);
 * the only "empty clears the optional" contract lives at the edge layer, not
 * here, because nodes carry no optional field whose emptiness is meaningful.
 */
import { NumberInput, Select, Stack, Switch, Textarea, TextInput } from "@mantine/core";

import { type GraphNode, type NodeData } from "@/schema";

export interface NodeDataFieldsProps {
  /** The node whose data is being edited. Drives the field layout via `kind`. */
  node: GraphNode;
  /** Receives the next data object on every field change. */
  onChange: (next: NodeData) => void;
}

/**
 * Render the editable fields for `node`. Each case is exhaustive over
 * {@link GraphNode}'s `kind` discriminator; TypeScript narrows `node.data`
 * inside each branch.
 */
export function NodeDataFields({ node, onChange }: NodeDataFieldsProps) {
  switch (node.kind) {
    case "freeform": {
      const data = node.data;
      return (
        <Stack>
          <TextInput
            label="Label"
            required
            value={data.label}
            onChange={(event) =>
              onChange({ ...data, label: event.currentTarget.value })
            }
          />
          <Textarea
            label="Note"
            autosize
            minRows={2}
            value={data.note ?? ""}
            onChange={(event) =>
              onChange({ ...data, note: event.currentTarget.value })
            }
          />
        </Stack>
      );
    }
    case "org": {
      const data = node.data;
      return (
        <Stack>
          <TextInput
            label="Login"
            required
            value={data.login}
            onChange={(event) =>
              onChange({ ...data, login: event.currentTarget.value })
            }
          />
          <TextInput
            label="Display name"
            value={data.name ?? ""}
            onChange={(event) =>
              onChange({ ...data, name: event.currentTarget.value })
            }
          />
          <TextInput
            label="URL"
            value={data.url ?? ""}
            onChange={(event) =>
              onChange({ ...data, url: event.currentTarget.value })
            }
          />
          <TextInput
            label="Avatar URL"
            value={data.avatarUrl ?? ""}
            onChange={(event) =>
              onChange({ ...data, avatarUrl: event.currentTarget.value })
            }
          />
        </Stack>
      );
    }
    case "repo": {
      const data = node.data;
      return (
        <Stack>
          <TextInput
            label="Owner"
            required
            value={data.owner}
            onChange={(event) =>
              onChange({ ...data, owner: event.currentTarget.value })
            }
          />
          <TextInput
            label="Name"
            required
            value={data.name}
            onChange={(event) =>
              onChange({ ...data, name: event.currentTarget.value })
            }
          />
          <TextInput
            label="URL"
            value={data.url ?? ""}
            onChange={(event) =>
              onChange({ ...data, url: event.currentTarget.value })
            }
          />
          <Textarea
            label="Description"
            autosize
            minRows={2}
            value={data.description ?? ""}
            onChange={(event) =>
              onChange({ ...data, description: event.currentTarget.value })
            }
          />
          <Switch
            label="Archived"
            checked={data.archived === true}
            onChange={(event) =>
              onChange({ ...data, archived: event.currentTarget.checked })
            }
          />
        </Stack>
      );
    }
    case "issue": {
      const data = node.data;
      return (
        <Stack>
          <TextInput
            label="Owner"
            required
            value={data.owner}
            onChange={(event) =>
              onChange({ ...data, owner: event.currentTarget.value })
            }
          />
          <TextInput
            label="Repo"
            required
            value={data.repo}
            onChange={(event) =>
              onChange({ ...data, repo: event.currentTarget.value })
            }
          />
          <NumberInput
            label="Number"
            required
            min={1}
            value={data.number}
            onChange={(value) => {
              const parsed = Number.parseInt(String(value), 10);
              onChange({
                ...data,
                number: Number.isNaN(parsed) ? data.number : parsed,
              });
            }}
          />
          <TextInput
            label="Title"
            required
            value={data.title}
            onChange={(event) =>
              onChange({ ...data, title: event.currentTarget.value })
            }
          />
          <Select
            label="State"
            placeholder="Unset"
            data={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
            ]}
            value={data.state ?? null}
            onChange={(value) => {
              if (value === "open" || value === "closed") {
                onChange({ ...data, state: value });
              }
            }}
          />
          <TextInput
            label="URL"
            value={data.url ?? ""}
            onChange={(event) =>
              onChange({ ...data, url: event.currentTarget.value })
            }
          />
        </Stack>
      );
    }
    case "project": {
      const data = node.data;
      return (
        <Stack>
          <TextInput
            label="Owner"
            required
            value={data.owner}
            onChange={(event) =>
              onChange({ ...data, owner: event.currentTarget.value })
            }
          />
          <NumberInput
            label="Number"
            required
            min={1}
            value={data.number}
            onChange={(value) => {
              const parsed = Number.parseInt(String(value), 10);
              onChange({
                ...data,
                number: Number.isNaN(parsed) ? data.number : parsed,
              });
            }}
          />
          <TextInput
            label="Title"
            required
            value={data.title}
            onChange={(event) =>
              onChange({ ...data, title: event.currentTarget.value })
            }
          />
          <TextInput
            label="URL"
            value={data.url ?? ""}
            onChange={(event) =>
              onChange({ ...data, url: event.currentTarget.value })
            }
          />
          <TextInput
            label="Project node id"
            value={data.projectNodeId ?? ""}
            onChange={(event) =>
              onChange({ ...data, projectNodeId: event.currentTarget.value })
            }
          />
        </Stack>
      );
    }
  }
}
