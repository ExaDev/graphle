import { z } from "zod";

import { defineBuiltInEdgeType, type RuntimeEdgeType } from "./edge-type";

/**
 * The built-in edge types shipped with the application. Each mirrors one of
 * the five relations the pre-dynamic `EdgeRelation` enum carried; every one
 * has the same `{ label?: string }` data shape, so an existing edge's optional
 * label survives the v2 -> v3 migration unchanged.
 */
const labelDataSchema = z.object({ label: z.string().optional() });

/**
 * Every built-in edge type, in the original `EdgeRelation` enum's order.
 */
export const BUILT_IN_EDGE_TYPES: RuntimeEdgeType[] = [
  defineBuiltInEdgeType({
    name: "owns",
    label: "Owns",
    color: "green",
    strokeStyle: "solid",
    labelField: "label",
    schema: labelDataSchema,
  }),
  defineBuiltInEdgeType({
    name: "contains",
    label: "Contains",
    color: "blue",
    strokeStyle: "solid",
    labelField: "label",
    schema: labelDataSchema,
  }),
  defineBuiltInEdgeType({
    name: "tracks",
    label: "Tracks",
    color: "orange",
    strokeStyle: "dashed",
    labelField: "label",
    schema: labelDataSchema,
  }),
  defineBuiltInEdgeType({
    name: "references",
    label: "References",
    color: "gray",
    strokeStyle: "dotted",
    labelField: "label",
    schema: labelDataSchema,
  }),
  defineBuiltInEdgeType({
    name: "custom",
    label: "Custom",
    color: "gray",
    strokeStyle: "solid",
    labelField: "label",
    schema: labelDataSchema,
  }),
];

/** Built-in edge types keyed by {@link RuntimeEdgeType.name} for O(1) lookup. */
export const BUILT_IN_EDGE_TYPES_BY_NAME: Map<string, RuntimeEdgeType> = new Map(
  BUILT_IN_EDGE_TYPES.map((type): [string, RuntimeEdgeType] => [type.name, type]),
);
