# Graphle

A client-side tool for mapping relationships between dependent systems — built
around GitHub organisations, repositories, issues and Projects (v2), though the
graph itself is generic enough to hold anything.

The whole app runs in the browser: there is no backend. A graph is captured
entirely by its URL, so sharing a view is just copying the address bar.

## What you can do

- **Build graphs by hand.** Add nodes of several kinds (freeform note, org,
  repo, issue, project), connect them with typed relations (owns, contains,
  tracks, references, custom), edit labels, and delete. The canvas is React
  Flow — pan, zoom, fit, minimap.
- **Share via URL.** The graph document is serialised into a compressed
  `#g=` fragment that live-updates as you edit. Paste the URL anywhere and the
  recipient sees the same graph. Nothing about your view state (selection,
  viewport) leaks into the share — only the document.
- **Persist locally.** Save named graphs to IndexedDB, reload them later, and
  export/import the raw document as JSON.
- **Pull from GitHub.** Enter a Personal Access Token to fetch your orgs,
  repos, issues and Projects (v2) over the GraphQL API, add them to the graph,
  and expand a node into its children (org → repos/projects, repo →
  issues/projects, project → items).

## Quick start

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm dev        # vite dev server
```

Other scripts: `pnpm build` (typecheck + production build), `pnpm preview`
(serve the built app), `pnpm test`, `pnpm lint`, `pnpm typecheck`.

The build is an installable PWA — the service worker precaches the app shell so
the app still opens offline and a shared URL or a saved graph still loads with
no network. GitHub API calls always go straight to the network; they are never
cached or intercepted.

## The GitHub token

GitHub integration needs a Personal Access Token, stored only in this browser's
IndexedDB. It is used solely in the `Authorization` header to `api.github.com`
— it is never written into the URL, the graph document, an export, or a log,
and it never leaves the browser for any other destination.

A classic token needs the `repo`, `read:org` and `read:project` scopes; a
fine-grained token needs the organisation's Projects read permission. Projects
(v2) are only available through the GraphQL API, which is why a token is
required even for public data.

## Architecture

The code is layered so the pure, testable logic has no dependency on React,
the network, or storage:

- `src/schema` — Zod schemas: the single source of truth for the graph
  document, nodes, edges and stored entities.
- `src/domain` — pure graph logic: an operation reducer, identity keys for
  deduplication, delta merge, and layout.
- `src/sharing` — the versioned, compressed URL codec and JSON import/export.
- `src/storage` — async storage contracts (graphs + secrets) and their Dexie
  adapters; every read is re-validated through Zod at the boundary.
- `src/github` — the GraphQL client (pagination, rate-limit reporting, typed
  errors), materialisers, and the node-expansion registry.
- `src/ui` — the zustand store, the React Flow canvas, and the panels.

Schemas are the contract across every boundary; types are inferred, never
mirrored or asserted.

## Deployment

The repo is public so CI runs on GitHub-hosted `ubuntu-latest` runners (free,
unlimited Actions minutes for public repos) and deploys to GitHub Pages at
<https://exadev.github.io/graphle/>. Pushes to `main` run lint, typecheck and
test, cut a release with semantic-release, then build and deploy. The build
uses a `/graphle/` base path for Pages and `/` for local dev. A visibility
flip can disable the Pages site, so `configure-pages` runs with
`enablement: true` to re-enable it automatically.


## Status and roadmap

The initial rebuild covers manual graph editing, URL sharing, local
persistence, and PAT-backed GitHub fetching with node expansion. Ideas for
later: user-defined node/edge categories with schema-driven appearance and
behaviour, computed properties (size by connectivity, edge length by weight),
directed/undirected and multi-edges, and loading graphs from remote URLs.
