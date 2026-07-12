import { z } from "zod";

import { defineBuiltInType, type RuntimeNodeType } from "./node-type";

/**
 * The built-in node types shipped with the application. Each entry pairs a
 * data-validation Zod schema with presentation metadata (label, colour, icon)
 * and the identity/label field selectors used by the domain layer. Existing
 * GitHub-flavoured types preserve their original data shapes; the generic
 * types model systems that have no GitHub analogue, plus `group`, a plain
 * subgraph container (see its own doc comment below).
 */

/** Free-form, user-authored note with no external source. */
const freeformDataSchema = z.object({
  label: z.string().min(1),
  note: z.string().optional(),
});

/** GitHub organisation or user. */
const orgDataSchema = z.object({
  login: z.string().min(1),
  name: z.string().optional(),
  url: z.string().optional(),
  avatarUrl: z.string().optional(),
});

/** GitHub repository. */
const repoDataSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  url: z.string().optional(),
  description: z.string().optional(),
  archived: z.boolean().optional(),
});

/** GitHub issue. */
const issueDataSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int(),
  title: z.string().min(1),
  state: z.enum(["open", "closed"]).optional(),
  url: z.string().optional(),
});

/** GitHub pull request. State adds "merged" alongside an issue's open/closed. */
const pullRequestDataSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int(),
  title: z.string().min(1),
  state: z.enum(["open", "closed", "merged"]).optional(),
  url: z.string().optional(),
  baseRefName: z.string().optional(),
  headRefName: z.string().optional(),
});

/** GitHub Projects v2 project. */
const projectDataSchema = z.object({
  owner: z.string().min(1),
  number: z.number().int(),
  title: z.string().min(1),
  url: z.string().optional(),
  projectNodeId: z.string().optional(),
});

/** Deployed service or component. */
const serviceDataSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["running", "degraded", "down"]).optional(),
});

/** Person, team member, or contact. */
const personDataSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  role: z.string().optional(),
});

/** Actionable unit of work. */
const taskDataSchema = z.object({
  title: z.string(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  assignee: z.string().optional(),
  due: z.string().optional(),
});

/** Standalone textual note attached to the graph. */
const noteDataSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
});

/** External reference expressed as a URL. */
const linkDataSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

/** Data store or persistence backend. */
const databaseDataSchema = z.object({
  name: z.string(),
  engine: z.string().optional(),
  url: z.string().optional(),
});

/** Architectural or product decision record. */
const decisionDataSchema = z.object({
  title: z.string(),
  status: z.enum(["proposed", "accepted", "rejected"]).optional(),
  rationale: z.string().optional(),
});

/**
 * A subgraph container. Used only for the manual "select unrelated nodes ->
 * group them" case — a real GitHub-flavoured node (e.g. `repo`) collapsing
 * its own fetched children (e.g. `issue`) doesn't need one, since it's
 * already a natural parent via `GraphNode.parentId`. See `node.ts`'s
 * `parentId`/`collapsed` doc comment.
 */
const groupDataSchema = z.object({
  label: z.string().min(1),
});

/**
 * Every built-in node type, in a stable order. The six GitHub-flavoured types
 * come first (the five original ones, matching the pre-dynamic `NodeKind`
 * order, plus `pullRequest`) followed by the seven generic types.
 */
export const BUILT_IN_TYPES: RuntimeNodeType[] = [
  defineBuiltInType({
    name: "freeform",
    label: "Note",
    color: "gray",
    icon: "IconNode",
    labelField: "label",
    identityFields: [],
    schema: freeformDataSchema,
  }),
  defineBuiltInType({
    name: "org",
    label: "Org",
    color: "blue",
    icon: "IconBuilding",
    labelField: "login",
    identityFields: ["login"],
    schema: orgDataSchema,
  }),
  defineBuiltInType({
    name: "repo",
    label: "Repo",
    color: "grape",
    icon: "IconBrandGithub",
    labelField: "name",
    identityFields: ["owner", "name"],
    schema: repoDataSchema,
  }),
  defineBuiltInType({
    name: "issue",
    label: "Issue",
    color: "orange",
    icon: "IconCircleDot",
    labelField: "title",
    identityFields: ["owner", "repo", "number"],
    schema: issueDataSchema,
  }),
  defineBuiltInType({
    name: "pullRequest",
    label: "Pull request",
    color: "green",
    icon: "IconGitPullRequest",
    labelField: "title",
    identityFields: ["owner", "repo", "number"],
    schema: pullRequestDataSchema,
  }),
  defineBuiltInType({
    name: "project",
    label: "Project",
    color: "teal",
    icon: "IconLayoutGrid",
    labelField: "title",
    identityFields: ["owner", "number"],
    schema: projectDataSchema,
  }),
  defineBuiltInType({
    name: "service",
    label: "Service",
    color: "grape",
    icon: "IconServer",
    labelField: "name",
    identityFields: ["name"],
    schema: serviceDataSchema,
  }),
  defineBuiltInType({
    name: "person",
    label: "Person",
    color: "teal",
    icon: "IconUser",
    labelField: "name",
    identityFields: ["name"],
    schema: personDataSchema,
  }),
  defineBuiltInType({
    name: "task",
    label: "Task",
    color: "orange",
    icon: "IconCheckbox",
    labelField: "title",
    identityFields: [],
    schema: taskDataSchema,
  }),
  defineBuiltInType({
    name: "note",
    label: "Note",
    color: "gray",
    icon: "IconNote",
    labelField: "title",
    identityFields: [],
    schema: noteDataSchema,
  }),
  defineBuiltInType({
    name: "link",
    label: "Link",
    color: "cyan",
    icon: "IconLink",
    labelField: "url",
    identityFields: ["url"],
    schema: linkDataSchema,
  }),
  defineBuiltInType({
    name: "database",
    label: "Database",
    color: "indigo",
    icon: "IconDatabase",
    labelField: "name",
    identityFields: ["name"],
    schema: databaseDataSchema,
  }),
  defineBuiltInType({
    name: "decision",
    label: "Decision",
    color: "pink",
    icon: "IconChecklist",
    labelField: "title",
    identityFields: [],
    schema: decisionDataSchema,
  }),
  defineBuiltInType({
    name: "group",
    label: "Group",
    color: "yellow",
    icon: "IconFolder",
    labelField: "label",
    identityFields: [],
    schema: groupDataSchema,
  }),
];

/** Built-in types keyed by {@link RuntimeNodeType.name} for O(1) lookup. */
export const BUILT_IN_TYPES_BY_NAME: Map<string, RuntimeNodeType> = new Map(
  BUILT_IN_TYPES.map((type): [string, RuntimeNodeType] => [type.name, type]),
);
