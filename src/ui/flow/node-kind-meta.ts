/**
 * Presentation metadata for each node kind: the human-readable label shown on
 * the kind badge, the Mantine accent colour, and the Tabler icon. Pure data,
 * no React, so it can be shared by the node components (for rendering) and the
 * node-kind registry (for wiring) without a circular import.
 */
import {
  IconAlertCircle,
  IconBrandGithub,
  IconBuildingCommunity,
  IconLayoutGrid,
  IconMessage,
  type TablerIcon,
} from "@tabler/icons-react";
import { type MantineColor } from "@mantine/core";

import type { NodeKind } from "@/schema";

export interface NodeKindPresentation {
  /** Human-readable kind name, shown on the node's badge. */
  label: string;
  /** Mantine accent colour for the border, icon, and badge. */
  color: MantineColor;
  /** Tabler icon glyph for the kind. */
  icon: TablerIcon;
}

/** Presentation metadata for every kind, keyed by {@link NodeKind}. */
export const KIND_PRESENTATION: Record<NodeKind, NodeKindPresentation> = {
  freeform: { label: "Note", color: "gray", icon: IconMessage },
  org: { label: "Org", color: "blue", icon: IconBuildingCommunity },
  repo: { label: "Repo", color: "grape", icon: IconBrandGithub },
  issue: { label: "Issue", color: "orange", icon: IconAlertCircle },
  project: { label: "Project", color: "teal", icon: IconLayoutGrid },
};
