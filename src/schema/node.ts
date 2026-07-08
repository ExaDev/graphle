import { z } from "zod";

import { NodeId, Position } from "./primitives";

/** The kind of GitHub entity (or free-form note) a node represents. */
export const NodeKind = z.enum(["freeform", "org", "repo", "issue", "project"]);
export type NodeKind = z.infer<typeof NodeKind>;

/** User-authored node carrying no link to an external source. */
export const FreeformNodeData = z.object({
  label: z.string().min(1),
  note: z.string().optional(),
});
export type FreeformNodeData = z.infer<typeof FreeformNodeData>;

/** GitHub organisation or user. */
export const OrgNodeData = z.object({
  login: z.string().min(1),
  name: z.string().optional(),
  url: z.string().optional(),
  avatarUrl: z.string().optional(),
});
export type OrgNodeData = z.infer<typeof OrgNodeData>;

/** GitHub repository. */
export const RepoNodeData = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  url: z.string().optional(),
  description: z.string().optional(),
  archived: z.boolean().optional(),
});
export type RepoNodeData = z.infer<typeof RepoNodeData>;

/** GitHub issue or pull request. */
export const IssueNodeData = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int(),
  title: z.string().min(1),
  state: z.enum(["open", "closed"]).optional(),
  url: z.string().optional(),
});
export type IssueNodeData = z.infer<typeof IssueNodeData>;

/** GitHub Projects v2 project. */
export const ProjectNodeData = z.object({
  owner: z.string().min(1),
  number: z.number().int(),
  title: z.string().min(1),
  url: z.string().optional(),
  projectNodeId: z.string().optional(),
});
export type ProjectNodeData = z.infer<typeof ProjectNodeData>;

const FreeformNode = z.object({
  id: NodeId,
  kind: z.literal("freeform"),
  position: Position,
  data: FreeformNodeData,
});

const OrgNode = z.object({
  id: NodeId,
  kind: z.literal("org"),
  position: Position,
  data: OrgNodeData,
});

const RepoNode = z.object({
  id: NodeId,
  kind: z.literal("repo"),
  position: Position,
  data: RepoNodeData,
});

const IssueNode = z.object({
  id: NodeId,
  kind: z.literal("issue"),
  position: Position,
  data: IssueNodeData,
});

const ProjectNode = z.object({
  id: NodeId,
  kind: z.literal("project"),
  position: Position,
  data: ProjectNodeData,
});

/**
 * A single graph node. The `kind` discriminator selects the shape of `data`,
 * so narrowing on `kind` narrows `data` to the matching per-kind schema.
 */
export const GraphNode = z.discriminatedUnion("kind", [
  FreeformNode,
  OrgNode,
  RepoNode,
  IssueNode,
  ProjectNode,
]);
export type GraphNode = z.infer<typeof GraphNode>;

/** Union of every per-kind node data shape. Derived from the discriminated
 *  union so adding a kind can't drift the data type out of sync. */
export type NodeData = GraphNode["data"];
