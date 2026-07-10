/**
 * Presentation layer for the dynamic node-type system. Replaces the old
 * `node-kind-meta.ts` (hardcoded per-kind icon/colour map) and
 * `node-kinds-registry.ts` (per-kind component wiring) with one data-driven
 * registry: a node type's `icon` and `color` strings resolve to a Tabler glyph
 * and a Mantine accent-colour CSS variable, and a single React Flow `nodeTypes`
 * entry routes every node through the generic {@link GenericNode} component.
 *
 * There are no per-type React components anywhere: presentation is derived
 * entirely from the {@link NodeTypeDefinition}.
 */
import { type NodeTypes } from "@xyflow/react";
import {
  IconBell,
  IconBolt,
  IconBookmark,
  IconBox,
  IconBrandGithub,
  IconBuilding,
  IconCalendar,
  IconChecklist,
  IconCheckbox,
  IconCircleDot,
  IconClock,
  IconCloud,
  IconDatabase,
  IconEye,
  IconFlag,
  IconHeart,
  IconHexagon,
  IconLayoutGrid,
  IconLink,
  IconMap,
  IconNote,
  IconServer,
  IconSettings,
  IconStar,
  IconTerminal,
  IconUser,
  type TablerIcon,
} from "@tabler/icons-react";

import type { NodeTypeDefinition } from "@/schema";

import { GenericNode } from "./node-kinds";

/** A renderable Tabler icon component. */
export type IconComponent = TablerIcon;

/**
 * Maps a node type's `icon` string to the Tabler component that draws it.
 * Covers every glyph named by a built-in type plus a starter set exposed to
 * custom types by the (Phase 5) type editor. "IconNode" has no Tabler glyph of
 * its own, so it aliases {@link IconHexagon} — the closest node-shaped mark.
 */
const ICON_REGISTRY: Record<string, IconComponent> = {
  // Built-in type glyphs.
  IconNode: IconHexagon,
  IconBuilding,
  IconBrandGithub,
  IconCircleDot,
  IconLayoutGrid,
  IconServer,
  IconUser,
  IconCheckbox,
  IconNote,
  IconLink,
  IconDatabase,
  IconChecklist,
  // Starter glyphs available to user-defined types.
  IconHexagon,
  IconStar,
  IconFlag,
  IconBookmark,
  IconHeart,
  IconBell,
  IconCalendar,
  IconClock,
  IconBox,
  IconCloud,
  IconTerminal,
  IconMap,
  IconEye,
  IconBolt,
  IconSettings,
};

/** Fallback glyph for a type whose `icon` is not in the registry. */
const DEFAULT_ICON: IconComponent = IconHexagon;

/**
 * Every icon name resolvable by {@link resolveIcon}, in registry order. The
 * type editor offers exactly this set, so a user-defined type can never carry an
 * icon string the renderer would have to fall back from.
 */
export const AVAILABLE_ICON_NAMES: readonly string[] = Object.keys(ICON_REGISTRY);

/**
 * Icon name the type editor selects by default. Matches the glyph behind
 * {@link DEFAULT_ICON} so an untouched new type renders with the same mark used
 * for an unresolvable icon.
 */
export const DEFAULT_ICON_NAME = "IconHexagon";

/**
 * Resolve an icon name to its Tabler component. Presentation only: an
 * unrecognised name (a hand-edited or future type) degrades to the default
 * glyph rather than breaking the canvas, because the icon string is stored data
 * the renderer cannot assume is well-formed.
 */
export function resolveIcon(name: string): IconComponent {
  return ICON_REGISTRY[name] ?? DEFAULT_ICON;
}

/**
 * Mantine's accent shade — the one Badge/Button render for colour-aware
 * "light"/"filled" variants (`theme.colors[name][6]`). Node accents share it so
 * a type's badge, border, and icon read as a single colour in both schemes.
 */
const ACCENT_SHADE = 6;

/**
 * CSS variable reference for a Mantine colour's accent shade, e.g.
 * `"blue"` -> `"var(--mantine-color-blue-6)"`. Works for every colour in the
 * Mantine palette (built-in or user-picked), and respects light/dark because
 * Mantine emits the variable per scheme.
 */
function accentColorVar(color: string): string {
  return `var(--mantine-color-${color}-${String(ACCENT_SHADE)})`;
}

/** Resolved presentation for a node type: glyph, accent colour variable, label. */
export interface TypePresentation {
  /** Tabler icon component to draw. */
  Icon: IconComponent;
  /** Mantine CSS variable for the accent colour (border + icon tint). */
  colorVar: string;
  /** Human-readable type label, shown on the node badge. */
  label: string;
}

/** Resolve a node type's presentation from its definition. */
export function getTypePresentation(typeDef: NodeTypeDefinition): TypePresentation {
  return {
    Icon: resolveIcon(typeDef.icon),
    colorVar: accentColorVar(typeDef.color),
    label: typeDef.label,
  };
}

/** Presentation used when a node's type cannot be resolved at all. */
export const DEFAULT_TYPE_PRESENTATION: TypePresentation = {
  Icon: DEFAULT_ICON,
  colorVar: accentColorVar("gray"),
  label: "Unknown",
};

/**
 * React Flow `nodeTypes`: a single entry routing every node through the generic
 * component. `nodeToFlow` stamps each node with the matching `type` string
 * ("default"). This file is the only importer of {@link GenericNode}; that
 * keeps the `type-presentation` <-> `node-kinds` import cycle safe, because
 * `node-kinds` consumes this module's exports only inside the component body
 * (runtime), never at module load — so `GenericNode` is always defined by the
 * time this `nodeTypes` constant is evaluated.
 */
export const nodeTypes: NodeTypes = {
  default: GenericNode,
};
