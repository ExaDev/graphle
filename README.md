# Graphle

> A client-side graph tool for mapping relationships between dependent systems —
> built around GitHub orgs, repos, issues and Projects (v2), though the graph is
> generic enough to hold anything.

Stack: Vite 8 + React 19 (React Compiler), TypeScript 6 strict, Zod 4, Mantine 9
(via its native vanilla-extract integration), `@xyflow/react`, Dexie, zustand,
lz-string. Installable offline-capable PWA. There is no backend — a graph is
captured entirely by its URL, so sharing a view is copying the address bar.

## Getting started

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm dev
```

A GitHub Personal Access Token is needed for GitHub integration. It is stored
only in this browser's IndexedDB and used solely in the `Authorization` header
to `api.github.com` — never in the URL, the graph document, an export, or a
log. A classic token needs `repo`, `read:org`, `read:project`; a fine-grained
token needs the org's Projects read permission. Projects (v2) are GraphQL-only,
which is why a token is required even for public data.

## Build, test, and lint

```sh
pnpm build         # tsc --noEmit && vite build (the CI gate)
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint . --max-warnings 0
pnpm test          # vitest run (full suite)
pnpm test:watch
```

- **Single test:** `pnpm exec vitest run <path>` (e.g. `src/domain`) or by name
  `pnpm exec vitest run -t "merge"`. Vitest runs two projects — a `node` project
  for pure logic and a `jsdom` project for `src/ui` and `*.smoke.test.ts`; both
  are picked up automatically by path.
- **Format:** no Prettier/Biome. `eslint --fix` is the formatter and runs on
  staged `*.{ts,tsx}` via lint-staged at commit time.
- **Husky hooks:** pre-commit → lint-staged; commit-msg → commitlint
  (conventional commits); pre-push → `pnpm test`. CI releases with `HUSKY=0`.

## Architecture

The code is layered so the pure, testable logic has no dependency on React, the
network, or storage. Each layer depends only on the one(s) beneath it.

- `src/schema` — Zod schemas: the single source of truth for the graph
  document, nodes, edges, and stored entities.
- `src/domain` — pure graph logic: an operation reducer, identity keys for
  deduplication, delta merge, and layout. **No React, no IO, no imports from
  `sharing`/`storage`/`ui`.**
- `src/sharing` — the versioned, compressed URL codec (`#g=`) and JSON
  import/export.
- `src/storage` — async storage contracts (graphs + secrets) and their Dexie
  adapters; every read is re-validated through Zod at the boundary.
- `src/github` — the GraphQL client (pagination, rate-limit reporting, typed
  errors), materialisers, and the node-expansion registry.
- `src/ui` — the zustand store (wraps the domain reducer), the React Flow
  canvas, and the panels.

The `GraphDocument` is the unit that round-trips identically through the URL,
IndexedDB, and JSON export. Schemas are the contract across every boundary —
types are inferred (`z.infer`), never mirrored or asserted. View state
(selection, viewport) is ephemeral and never enters the document or URL.

## Conventions

These are enforced by config or were established during the build; violating
them fails the gate or the review.

- **Strict TypeScript.** `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Narrow index access with
  an explicit `if (x === undefined)` check — never `?? default`.
- **No type assertions.** `@typescript-eslint/consistent-type-assertions` with
  `assertionStyle: "never"` bans `as` and angle-bracket casts (eslint error).
  Narrow with a type guard or parse with Zod. No `any` (use `unknown`).
- **Zod is the single source of truth.** `export const X = z.object(...)`;
  `export type X = z.infer<typeof X>`. Derive types, don't hand-write them.
- **No defensive fallbacks.** No `?? ""`/`?? []` masking real absences, no
  try/catch that swallows an error into a default. Model absence explicitly as
  `T | undefined` and handle it at the right layer.
- **Styling via the Mantine vanilla-extract integration.** Write colocated
  `*.css.ts` files that import `vars` from `@/ui/theme/vars` (`themeToVars`).
  No inline colour literals, no CSS modules. Drive React Flow's `colorMode`
  from the Mantine scheme or its controls/minimap won't theme.
- **Tests are colocated** as `*.unit.test.ts` next to the code they cover.
- **British English** in all comments, docs, and commit messages. Straight
  quotes and plain hyphens in identifiers and paths.

## Gotchas and quirks

- **React Flow needs a definite canvas height.** Its root has a forced inline
  `height: 100%` that does not resolve against a flex-derived parent height —
  the canvas renders 0px tall and controls fly off-screen. The wrapper in
  `AppShell` uses `calc(100dvh - HEADER_HEIGHT)`; don't switch it to
  `height: 100%`.
- **The gate does not render React.** `tsc`/`eslint`/`vitest`/`vite build`
  compile and unit-test logic but never mount components, so runtime layout and
  mount-time bugs (a white-screen, a 0-height canvas, inspector deselection)
  slip through. Browser-verify after non-trivial UI work.
- **PWA service worker caches the previous deploy.** `autoUpdate` serves the
  last build on the first load after a deploy and activates the new one on the
  next reload — users see the update on their next visit.
- **Keep the repo public for free CI + deploy.** Public repos get free
  GitHub-hosted `ubuntu-latest` runners and free GitHub Pages. Switching to
  the self-hosted fleet breaks for public repos (org runner groups disallow
  public repos by default), and a private repo's Pages needs a paid plan. A
  visibility flip also disables Pages, which is why `configure-pages` runs with
  `enablement: true`.
- **Multi-phase Workflow runs against this repo have a reproducible
  worktree base-commit race.** When a Workflow script's phases have real
  cross-phase file dependencies (phase N+1 imports a file phase N created),
  a later phase's `isolation: "worktree"` agent can get a worktree that
  doesn't reflect an earlier phase's already-merged output, even though the
  script's own `await` ordering guarantees the merge landed first — seen
  3+ times across two separate feature builds, including once for a single
  non-parallel agent. Run dependent phases on the shared tree instead
  (agents within a phase already write disjoint files by design, so there's
  nothing to race); reserve worktree isolation for genuinely independent
  fan-out. Always verify a run's result yourself afterwards (`git status
  --short`, grep new exports for real callers, diff the shipped surface
  against the plan) — a green gate does not prove the claimed work landed
  or was committed.

## Contributing

Conventional commits (`feat:`, `fix:`, `chore:`, …), atomic per logical change,
enforced by commitlint. The husky hooks above gate every commit and push. CI
runs the same lint/typecheck/test, then semantic-release cuts a versioned
release and deploys to Pages on `main`.

## Deployment

Public repo → CI on `ubuntu-latest` → semantic-release → build → GitHub Pages
at <https://exadev.github.io/graphle/>. The Vite base is `/graphle/` in CI and
`/` in local dev (see `vite.config.ts`).

## Status and roadmap

Manual graph editing, URL sharing, local persistence, and PAT-backed GitHub
fetching with node expansion are done. Planned: user-defined node/edge
categories with schema-driven appearance, computed properties, directed/
undirected and multi-edges, and loading graphs from remote URLs.
