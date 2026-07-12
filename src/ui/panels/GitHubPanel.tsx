/**
 * GitHub integration drawer. Four sections, top to bottom:
 *
 * 1. Token list: every stored GitHub token, with its type/scope/last-used
 *    summary and Edit/Delete actions.
 * 2. Add/Edit form: label, token type (classic/fine-grained), scope (any
 *    owner, or one/more owner logins — a fine-grained token is restricted to
 *    exactly one, per {@link StoredGithubToken}'s schema constraint), and the
 *    token string itself. Saving calls `viewer` to confirm the token works
 *    before writing it to the {@link GithubTokenStore}.
 * 3. "Acting as": a single-select of the stored tokens driving Browse/Search
 *    below, defaulting via {@link resolveTokenForOwner} to whichever token
 *    already matches `store.suggestedGithubOwner` (the owner a caller was
 *    resolving a token for), or the most recently used any-scoped token.
 * 4. Browse/Search: lists the acting-as token's organisations, repos, and
 *    projects, or runs a GitHub search. Every row has an "Add to graph"
 *    action that materialises the entity into a node via the pure mappers
 *    and folds it through `store.mergeDelta`. Each list offers "Load more"
 *    while its connection has a next page.
 *
 * Opening and closing lives in `store.githubPanelOpened` rather than local
 * component state — a caller with no JSX of its own (`useUrlSync`, on page
 * mount) can still open this drawer to prompt for a token. Such a caller can
 * also attach a one-shot `store.pendingGitHubAction`, run with the freshly
 * resolved client right after a token is added/selected and then cleared;
 * this component never inspects what that action does (e.g. resume a GitHub
 * Projects URL load) — it stays a general auth+browse drawer. When the panel
 * opens because no token resolved for `store.suggestedGithubOwner`, it jumps
 * straight to the Add form with that owner pre-filled, rather than showing an
 * empty acting-as selector.
 *
 * SECURITY: a token is sensitive credential material. It lives only in the
 * GithubTokenStore (IndexedDB `githubTokens` table, separate from graph data)
 * and in the Authorization header `createGitHubClient` sends. It is never
 * written to the document, never placed in a URL, never passed to
 * `notifications.show`, and never included in an export — `exportDocument`
 * serialises the graph document, which structurally cannot carry it. Keep it
 * that way: do not log a token, do not copy it into graph node data, do not
 * echo it in error messages.
 *
 * Every fetch passes the drawer's AbortSignal, which is aborted on close so an
 * in-flight request does not resolve into an unmounted state update. Errors
 * surface through Mantine notifications with kind-specific guidance
 * (unauthorised -> check scopes, rateLimited -> reset time, network -> network).
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Code,
  Divider,
  Drawer,
  Group,
  PasswordInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCirclePlus,
  IconExternalLink,
  IconKey,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconTrash,
} from "@tabler/icons-react";

import {
  buildDelta,
  createGitHubClient,
  GitHubError,
  githubErrorMessage,
  issueWithRepoToNode,
  orgToNode,
  projectToNode,
  pullRequestWithRepoToNode,
  repoToNode,
  resolveTokenForOwner,
  type GitHubClient,
  type GitHubIssueWithRepo,
  type GitHubOrg,
  type GitHubProject,
  type GitHubPullRequestWithRepo,
  type GitHubRepo,
  type GitHubSearchAccount,
  type GitHubViewer,
} from "@/github";
import type { GithubTokenType, GraphNode, StoredGithubToken } from "@/schema";
import { cascadePosition } from "@/domain";
import { db } from "@/storage/db";
import { createGithubTokenStore } from "@/storage/github-token-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

export interface GitHubPanelProps {
  opened: boolean;
  onClose: () => void;
}

/** Pagination tail shared by every list in the drawer. */
interface PageTail {
  cursor: string | undefined;
  hasNextPage: boolean;
}

const NO_PAGE: PageTail = { cursor: undefined, hasNextPage: false };

/**
 * A selected account to browse the repos/projects of. `kind` routes
 * `loadRepos`/`loadProjects` to `listOrgRepos`/`listOrgProjects` (an
 * `organization`) or `listUserRepos`/`listUserProjects` (a `user`) — GitHub
 * has no single query that resolves either kind by login (the same split
 * `getOrgProject`/`getUserProject` already have).
 */
interface AccountRef {
  login: string;
  kind: "organization" | "user";
}

/** Which of the four `search*` client methods the Search tab is currently
 *  driving. */
type SearchResourceType = "repositories" | "issues" | "pullRequests" | "accounts";

function isSearchResourceType(value: string): value is SearchResourceType {
  return (
    value === "repositories" ||
    value === "issues" ||
    value === "pullRequests" ||
    value === "accounts"
  );
}

/** Classic scopes graphle's GraphQL queries need — kept as the single source
 *  for both the help text and {@link CREATE_TOKEN_URL} so they can't drift. */
const REQUIRED_CLASSIC_SCOPES = ["repo", "read:org", "read:project"];

/**
 * Deep-links straight to a pre-filled classic-token creation form (GitHub
 * supports `scopes`/`description` query params on `tokens/new` for exactly
 * this) so the user doesn't have to hunt through the scope checkboxes
 * themselves — the required scopes are already ticked when the page loads.
 */
const CREATE_TOKEN_URL = `https://github.com/settings/tokens/new?${new URLSearchParams({
  scopes: REQUIRED_CLASSIC_SCOPES.join(","),
  description: "graphle",
}).toString()}`;

/**
 * Fine-grained permission slugs graphle needs, confirmed against GitHub's own
 * docs source (github/docs, managing-your-personal-access-tokens.md — the
 * page's own changelog announcement gives only worked examples, not a full
 * parameter reference, so the source file was the only way to get this
 * right): `contents`/`issues` are repository permissions (apply to either a
 * user or organization resource owner); `organization_projects` is an
 * ORGANIZATION-only permission. There is no fine-grained equivalent for a
 * *personal* account's own Projects v2 boards — the Account-permissions table
 * has no Projects entry at all — so a fine-grained token can only ever load
 * an org-owned project through graphle; a personal one needs a classic token.
 * `contents` is `write` (not `read`) because pushing an edited file to a
 * linked repository via the REST Contents API's PUT endpoint requires write
 * access, not just reading Projects-linked issues.
 */
const FINE_GRAINED_PERMISSIONS: Record<string, string> = {
  contents: "write",
  issues: "read",
  organization_projects: "read",
};

/**
 * Deep-links to a pre-filled fine-grained token creation form. `target_name`
 * is deliberately omitted — GitHub defaults it to the current user's own
 * account, and graphle can't know in advance which organization the user
 * wants to target; they pick (or type) the resource owner on GitHub's own
 * page, where these permissions are already ticked.
 */
const CREATE_FINE_GRAINED_TOKEN_URL = `https://github.com/settings/personal-access-tokens/new?${new URLSearchParams(
  { name: "graphle", description: "graphle", ...FINE_GRAINED_PERMISSIONS },
).toString()}`;

function notifyGitHubError(error: unknown): void {
  if (error instanceof GitHubError) {
    notifications.show({ color: "red", message: githubErrorMessage(error) });
    return;
  }
  notifications.show({
    color: "red",
    message: error instanceof Error ? error.message : String(error),
  });
}

/** One-line "acting as" Select option label: label plus type and scope. */
function tokenSummary(token: StoredGithubToken): string {
  const scope = token.scope.kind === "any" ? "any owner" : token.scope.owners.join(", ");
  return `${token.label} (${token.tokenType}, ${scope})`;
}

export function GitHubPanel({ opened, onClose }: GitHubPanelProps) {
  // The GithubTokenStore is created once; `db` is a process-wide singleton.
  // The UI never touches Dexie directly, keeping the storage boundary clean.
  const tokenStore = useMemo(() => createGithubTokenStore(db), []);

  const nodeCount = useGraphStore((state) => state.document.nodes.length);
  const mergeDelta = useGraphStore((state) => state.mergeDelta);
  const suggestedGithubOwner = useGraphStore((state) => state.suggestedGithubOwner);

  const [tokens, setTokens] = useState<StoredGithubToken[]>([]);
  const [actingAsId, setActingAsId] = useState<string | undefined>(undefined);

  // Add/Edit form state. `editingId` is undefined for a fresh Add, or the id
  // of the token being edited (its token string is re-shown for re-validation,
  // matching the single-token drawer's original "seed the input" behaviour).
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | undefined>(undefined);
  const [formLabel, setFormLabel] = useState("");
  const [formTokenType, setFormTokenType] = useState<GithubTokenType>("classic");
  const [formScopeKind, setFormScopeKind] = useState<"any" | "owner">("any");
  const [formOwners, setFormOwners] = useState<string[]>([]);
  const [formSingleOwner, setFormSingleOwner] = useState("");
  const [formTokenInput, setFormTokenInput] = useState("");

  const [viewer, setViewer] = useState<GitHubViewer | undefined>(undefined);
  const [rateLimit, setRateLimit] = useState<
    { remaining: number; resetAt: string } | undefined
  >(undefined);

  const [orgs, setOrgs] = useState<GitHubOrg[]>([]);
  const [orgsPage, setOrgsPage] = useState<PageTail>(NO_PAGE);
  const [selectedAccount, setSelectedAccount] = useState<AccountRef | undefined>(
    undefined,
  );

  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposPage, setReposPage] = useState<PageTail>(NO_PAGE);
  const [projects, setProjects] = useState<GitHubProject[]>([]);
  const [projectsPage, setProjectsPage] = useState<PageTail>(NO_PAGE);

  const [browseMode, setBrowseMode] = useState<"browse" | "search">("browse");
  const [searchType, setSearchType] = useState<SearchResourceType>("repositories");
  const [searchInput, setSearchInput] = useState("");
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState<string | undefined>(undefined);

  const [searchedRepos, setSearchedRepos] = useState<GitHubRepo[]>([]);
  const [searchedReposPage, setSearchedReposPage] = useState<PageTail>(NO_PAGE);
  const [searchedIssues, setSearchedIssues] = useState<GitHubIssueWithRepo[]>([]);
  const [searchedIssuesPage, setSearchedIssuesPage] = useState<PageTail>(NO_PAGE);
  const [searchedPullRequests, setSearchedPullRequests] = useState<GitHubPullRequestWithRepo[]>([]);
  const [searchedPullRequestsPage, setSearchedPullRequestsPage] = useState<PageTail>(NO_PAGE);
  const [searchedAccounts, setSearchedAccounts] = useState<GitHubSearchAccount[]>([]);
  const [searchedAccountsPage, setSearchedAccountsPage] = useState<PageTail>(NO_PAGE);

  const [validating, setValidating] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // The validated client, kept for browse fetches. Held in a ref rather than
  // state because its identity is irrelevant to rendering — only its methods
  // are called from handlers.
  const clientRef = useRef<GitHubClient | undefined>(undefined);

  // Bumped by every user-initiated search action (submit or a resource-type
  // change re-running the last query) — never by a "Load more" page fetch,
  // which continues the same series. `runSearch` stamps each in-flight
  // request with the generation active when it started and discards its
  // result if a newer one has started by the time it resolves, so an
  // in-flight resource-type-change search (still using the previous query)
  // can never clobber a freshly submitted one that happens to resolve first.
  const searchGenerationRef = useRef(0);

  // One AbortController for the whole open lifetime, aborted on close so every
  // in-flight fetch rejects promptly and its rejection is suppressed (see
  // `runWith`). Recreated each time the drawer opens.
  const abortRef = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    abortRef.current = controller;
    return () => {
      controller.abort();
      abortRef.current = undefined;
    };
  }, [opened]);

  /** Resets the Add/Edit form to a fresh Add, optionally pre-filling an
   *  owner (used when no token resolved for `suggestedGithubOwner`). */
  function openAddForm(prefillOwner?: string): void {
    setFormOpen(true);
    setEditingId(undefined);
    setEditingCreatedAt(undefined);
    setFormLabel("");
    setFormTokenType("classic");
    setFormScopeKind(prefillOwner === undefined ? "any" : "owner");
    setFormOwners(prefillOwner === undefined ? [] : [prefillOwner]);
    setFormSingleOwner(prefillOwner ?? "");
    setFormTokenInput("");
  }

  function openEditForm(token: StoredGithubToken): void {
    setFormOpen(true);
    setEditingId(token.id);
    setEditingCreatedAt(token.createdAt);
    setFormLabel(token.label);
    setFormTokenType(token.tokenType);
    setFormScopeKind(token.scope.kind);
    setFormOwners(token.scope.kind === "owner" ? token.scope.owners : []);
    setFormSingleOwner(token.scope.kind === "owner" ? (token.scope.owners[0] ?? "") : "");
    setFormTokenInput(token.token);
  }

  // Load every stored token when the drawer opens, and default the acting-as
  // selection via resolveTokenForOwner: a token scoped to suggestedGithubOwner
  // when the caller who opened the panel was resolving one, else the most
  // recently used any-scoped token. When suggestedGithubOwner is set but
  // nothing resolves for it (the only reason a caller escalates — see
  // ExpandMenu/GraphsDrawer/etc.), jump straight to the Add form instead of
  // showing an empty acting-as selector.
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    void tokenStore
      .list(controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        setTokens(list);
        const resolved = resolveTokenForOwner(list, suggestedGithubOwner);
        if (resolved !== undefined) {
          setActingAsId(resolved.id);
        } else if (suggestedGithubOwner !== undefined || list.length === 0) {
          // Nothing resolves: either a caller was resolving a specific owner
          // and found nothing, or the store is empty and there is nothing
          // else to show. Either way, jump straight to Add rather than an
          // empty list the user has to click through.
          openAddForm(suggestedGithubOwner);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
      });
    return () => controller.abort();
  }, [opened, suggestedGithubOwner, tokenStore]);

  // Build a client for the acting-as token and confirm it works, refreshing
  // viewer/rate-limit and (re)loading orgs. Also fires any pending action
  // queued by the caller that opened the panel, exactly once, the same way
  // the single-token drawer resumed a pending action after Validate.
  useEffect(() => {
    if (!opened) return;
    const token = tokens.find((candidate) => candidate.id === actingAsId);
    if (token === undefined) return;
    const client = createGitHubClient({ token: token.token });
    const controller = new AbortController();
    void runWith(() => client.viewer(controller.signal), controller.signal).then(
      async (result) => {
        if (controller.signal.aborted || result === undefined) return;
        clientRef.current = client;
        setViewer(result);
        setRateLimit(client.lastRateLimit);
        setSelectedAccount(undefined);
        setRepos([]);
        setReposPage(NO_PAGE);
        setProjects([]);
        setProjectsPage(NO_PAGE);

        // Inlined rather than calling the component's own loadOrgs so this
        // effect doesn't need to depend on a function identity that's
        // recreated every render.
        setLoadingOrgs(true);
        const orgsResult = await runWith(
          () => client.listViewerOrgs(undefined, controller.signal),
          controller.signal,
        );
        setLoadingOrgs(false);
        if (!controller.signal.aborted && orgsResult !== undefined) {
          setOrgs(orgsResult.items);
          setOrgsPage({ cursor: orgsResult.endCursor, hasNextPage: orgsResult.hasNextPage });
        }

        const pendingAction = useGraphStore.getState().pendingGitHubAction;
        if (pendingAction !== undefined) {
          useGraphStore.setState({ pendingGitHubAction: undefined });
          pendingAction(client);
        }
      },
    );
    return () => controller.abort();
  }, [opened, actingAsId, tokens]);

  /** The drawer's signal while open, or undefined when closed/no controller yet. */
  function signal(): AbortSignal | undefined {
    return abortRef.current?.signal;
  }

  /**
   * Runs a GitHub fetch, classifying any failure via {@link notifyGitHubError}.
   * Returns the result, or undefined on error or abort. Suppresses the
   * notification when the signal was aborted (a close, not a real failure).
   */
  async function runWith<T>(
    fn: () => Promise<T>,
    sig: AbortSignal,
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      if (sig.aborted) return undefined;
      notifyGitHubError(error);
      return undefined;
    }
  }

  /** Materialises nodes into the document via mergeDelta and notifies the count. */
  function addNodes(nodes: GraphNode[]): void {
    const added = mergeDelta(buildDelta(nodes, []));
    const count = added.length;
    notifications.show({
      color: "green",
      message:
        count === 0
          ? "Nothing new to add"
          : `Added ${String(count)} node${count === 1 ? "" : "s"} to the graph`,
    });
  }

  /** Builds the scope the form currently describes, or undefined when the
   *  form is missing a required owner (caller shows the matching error). */
  function formScope(): { kind: "any" } | { kind: "owner"; owners: string[] } | undefined {
    if (formTokenType === "fine-grained") {
      const owner = formSingleOwner.trim();
      return owner === "" ? undefined : { kind: "owner", owners: [owner] };
    }
    if (formScopeKind === "any") return { kind: "any" };
    return formOwners.length === 0 ? undefined : { kind: "owner", owners: formOwners };
  }

  /** Validates the entered token via `viewer`, then writes it to the
   *  GithubTokenStore — a fine-grained token is restricted to a single owner
   *  by GitHub itself, so the form only offers a single owner field for it;
   *  a classic token may be scoped to any number of owners or left unscoped. */
  async function handleSaveForm(): Promise<void> {
    const sig = signal();
    if (sig === undefined) return;
    if (formTokenInput === "") {
      notifications.show({ color: "red", message: "Enter a token first" });
      return;
    }
    const scope = formScope();
    if (scope === undefined) {
      notifications.show({ color: "red", message: "Enter at least one owner" });
      return;
    }
    setValidating(true);
    const client = createGitHubClient({ token: formTokenInput });
    const result = await runWith(() => client.viewer(sig), sig);
    setValidating(false);
    if (result === undefined) return;

    const id = editingId ?? crypto.randomUUID();
    const label = formLabel.trim() === "" ? `${result.login} (${formTokenType})` : formLabel.trim();
    const stored: StoredGithubToken = {
      id,
      label,
      tokenType: formTokenType,
      token: formTokenInput,
      scope,
      createdAt: editingCreatedAt ?? new Date().toISOString(),
    };
    try {
      await tokenStore.save(stored, sig);
    } catch (error) {
      if (sig.aborted) return;
      notifyGitHubError(error);
      return;
    }
    notifications.show({ color: "green", message: `Signed in as ${result.login}` });

    setFormOpen(false);
    setEditingId(undefined);
    setEditingCreatedAt(undefined);
    const list = await tokenStore.list(sig);
    setTokens(list);
    setActingAsId(id);
  }

  async function handleDeleteToken(id: string): Promise<void> {
    const sig = signal();
    if (sig === undefined) return;
    try {
      await tokenStore.remove(id, sig);
    } catch (error) {
      if (sig.aborted) return;
      notifyGitHubError(error);
      return;
    }
    const list = await tokenStore.list(sig);
    setTokens(list);
    if (actingAsId === id) {
      const next = resolveTokenForOwner(list, undefined);
      setActingAsId(next?.id);
      // The acting-as effect only fetches for a resolvable token; when
      // nothing resolves (no any-scoped token left) it never runs, so clear
      // the deleted token's stale viewer/rate-limit here instead.
      if (next === undefined) {
        clientRef.current = undefined;
        setViewer(undefined);
        setRateLimit(undefined);
      }
    }
  }

  async function loadOrgs(cursor: string | undefined, sig: AbortSignal): Promise<void> {
    const client = clientRef.current;
    if (client === undefined) return;
    setLoadingOrgs(true);
    const result = await runWith(() => client.listViewerOrgs(cursor, sig), sig);
    setLoadingOrgs(false);
    if (result === undefined) return;
    setOrgs((prev) => (cursor === undefined ? result.items : [...prev, ...result.items]));
    setOrgsPage({ cursor: result.endCursor, hasNextPage: result.hasNextPage });
  }

  async function loadRepos(
    account: AccountRef,
    cursor: string | undefined,
    sig: AbortSignal,
  ): Promise<void> {
    const client = clientRef.current;
    if (client === undefined) return;
    setLoadingRepos(true);
    const result = await runWith(
      () =>
        account.kind === "organization"
          ? client.listOrgRepos(account.login, cursor, sig)
          : client.listUserRepos(account.login, cursor, sig),
      sig,
    );
    setLoadingRepos(false);
    if (result === undefined) return;
    setRepos((prev) => (cursor === undefined ? result.items : [...prev, ...result.items]));
    setReposPage({ cursor: result.endCursor, hasNextPage: result.hasNextPage });
  }

  async function loadProjects(
    account: AccountRef,
    cursor: string | undefined,
    sig: AbortSignal,
  ): Promise<void> {
    const client = clientRef.current;
    if (client === undefined) return;
    setLoadingProjects(true);
    const result = await runWith(
      () =>
        account.kind === "organization"
          ? client.listOrgProjects(account.login, cursor, sig)
          : client.listUserProjects(account.login, cursor, sig),
      sig,
    );
    setLoadingProjects(false);
    if (result === undefined) return;
    setProjects((prev) =>
      cursor === undefined ? result.items : [...prev, ...result.items],
    );
    setProjectsPage({ cursor: result.endCursor, hasNextPage: result.hasNextPage });
  }

  function handleSelectAccount(account: AccountRef): void {
    const sig = signal();
    if (sig === undefined) return;
    setSelectedAccount(account);
    setRepos([]);
    setReposPage(NO_PAGE);
    setProjects([]);
    setProjectsPage(NO_PAGE);
    void loadRepos(account, undefined, sig);
    void loadProjects(account, undefined, sig);
  }

  /**
   * Runs one of the four `search*` client methods, keyed by `type`, and folds
   * the result into that type's own state. Never fires as-you-type — always
   * called from an explicit submit (Enter/button) or a resource-type change
   * reusing the last submitted query — GitHub's search endpoints are more
   * strictly rate-limited than ordinary list queries.
   *
   * `generation` pins this call to the {@link searchGenerationRef} value
   * active when it was started; if a newer search has started by the time
   * this one resolves, its result is discarded instead of applied — without
   * this, a resource-type-change search (still using the previous query) can
   * resolve after a freshly submitted new-query search and clobber it with
   * stale results, since both share the same page-level abort signal and
   * neither request is otherwise cancelled by the other.
   */
  async function runSearch(
    type: SearchResourceType,
    query: string,
    cursor: string | undefined,
    sig: AbortSignal,
    generation: number,
  ): Promise<void> {
    const client = clientRef.current;
    if (client === undefined) return;
    setLoadingSearch(true);
    switch (type) {
      case "repositories": {
        const result = await runWith(() => client.searchRepositories(query, cursor, sig), sig);
        if (generation !== searchGenerationRef.current) return;
        setLoadingSearch(false);
        if (result === undefined) return;
        setSearchedRepos((prev) => (cursor === undefined ? result.items : [...prev, ...result.items]));
        setSearchedReposPage({ cursor: result.endCursor, hasNextPage: result.hasNextPage });
        return;
      }
      case "issues": {
        const result = await runWith(() => client.searchIssues(query, cursor, sig), sig);
        if (generation !== searchGenerationRef.current) return;
        setLoadingSearch(false);
        if (result === undefined) return;
        setSearchedIssues((prev) => (cursor === undefined ? result.items : [...prev, ...result.items]));
        setSearchedIssuesPage({ cursor: result.endCursor, hasNextPage: result.hasNextPage });
        return;
      }
      case "pullRequests": {
        const result = await runWith(() => client.searchPullRequests(query, cursor, sig), sig);
        if (generation !== searchGenerationRef.current) return;
        setLoadingSearch(false);
        if (result === undefined) return;
        setSearchedPullRequests((prev) =>
          cursor === undefined ? result.items : [...prev, ...result.items],
        );
        setSearchedPullRequestsPage({ cursor: result.endCursor, hasNextPage: result.hasNextPage });
        return;
      }
      case "accounts": {
        const result = await runWith(() => client.searchAccounts(query, cursor, sig), sig);
        if (generation !== searchGenerationRef.current) return;
        setLoadingSearch(false);
        if (result === undefined) return;
        setSearchedAccounts((prev) => (cursor === undefined ? result.items : [...prev, ...result.items]));
        setSearchedAccountsPage({ cursor: result.endCursor, hasNextPage: result.hasNextPage });
        return;
      }
    }
  }

  function resetSearchResults(): void {
    setSearchedRepos([]);
    setSearchedReposPage(NO_PAGE);
    setSearchedIssues([]);
    setSearchedIssuesPage(NO_PAGE);
    setSearchedPullRequests([]);
    setSearchedPullRequestsPage(NO_PAGE);
    setSearchedAccounts([]);
    setSearchedAccountsPage(NO_PAGE);
  }

  function handleSearchSubmit(): void {
    const sig = signal();
    if (sig === undefined) return;
    const query = searchInput.trim();
    if (query === "") {
      notifications.show({ color: "red", message: "Enter a search query first" });
      return;
    }
    resetSearchResults();
    setLastSubmittedQuery(query);
    const generation = ++searchGenerationRef.current;
    void runSearch(searchType, query, undefined, sig, generation);
  }

  /** Switching resource type re-runs the last submitted query (a single,
   *  deliberate click, not as-you-type) rather than requiring the user to
   *  retype it; no query has been submitted yet, this just switches the
   *  empty view. */
  function handleSearchTypeChange(type: SearchResourceType): void {
    setSearchType(type);
    resetSearchResults();
    if (lastSubmittedQuery === undefined) return;
    const sig = signal();
    if (sig === undefined) return;
    const generation = ++searchGenerationRef.current;
    void runSearch(type, lastSubmittedQuery, undefined, sig, generation);
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="GitHub"
      position="right"
      size="md"
    >
      <Stack gap="md">
        {/* --- Token list ---------------------------------------------- */}
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600} size="sm">
              GitHub tokens
            </Text>
            {!formOpen && (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconPlus size={14} />}
                onClick={() => openAddForm()}
              >
                Add token
              </Button>
            )}
          </Group>
          {tokens.length === 0 && !formOpen && (
            <Text size="sm" c="dimmed">
              No tokens stored yet.
            </Text>
          )}
          {tokens.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              onEdit={() => openEditForm(token)}
              onDelete={() => void handleDeleteToken(token.id)}
            />
          ))}
        </Stack>

        {/* --- Add/Edit form --------------------------------------------- */}
        {formOpen && (
          <Stack
            component="form"
            gap="xs"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveForm();
            }}
          >
            <Text fw={600} size="sm">
              {editingId === undefined ? "Add token" : "Edit token"}
            </Text>
            <TextInput
              label="Label"
              description="Optional — defaults to the signed-in account and token type"
              placeholder="e.g. ExaDev fine-grained"
              value={formLabel}
              onChange={(event) => setFormLabel(event.currentTarget.value)}
            />
            <SegmentedControl
              fullWidth
              value={formTokenType}
              onChange={(value) => {
                if (value === "classic" || value === "fine-grained") setFormTokenType(value);
              }}
              data={[
                { value: "classic", label: "Classic" },
                { value: "fine-grained", label: "Fine-grained" },
              ]}
            />
            {formTokenType === "fine-grained" ? (
              <TextInput
                label="Resource owner"
                description="A fine-grained token is restricted by GitHub to exactly one org or user."
                placeholder="e.g. ExaDev"
                value={formSingleOwner}
                onChange={(event) => setFormSingleOwner(event.currentTarget.value)}
              />
            ) : (
              <>
                <SegmentedControl
                  fullWidth
                  value={formScopeKind}
                  onChange={(value) => {
                    if (value === "any" || value === "owner") setFormScopeKind(value);
                  }}
                  data={[
                    { value: "any", label: "Any owner" },
                    { value: "owner", label: "Specific owners" },
                  ]}
                />
                {formScopeKind === "owner" && (
                  <TagsInput
                    label="Owners"
                    placeholder="Add an org or user login"
                    value={formOwners}
                    onChange={setFormOwners}
                  />
                )}
              </>
            )}
            <PasswordInput
              label="Personal access token"
              placeholder="ghp_… / github_pat_…"
              leftSection={<IconKey size={16} />}
              value={formTokenInput}
              onChange={(event) => setFormTokenInput(event.currentTarget.value)}
            />
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Classic token needs{" "}
                {REQUIRED_CLASSIC_SCOPES.map((scope, index) => (
                  <Fragment key={scope}>
                    {index > 0 && ", "}
                    <Code>{scope}</Code>
                  </Fragment>
                ))}
                . Fine-grained needs{" "}
                {Object.keys(FINE_GRAINED_PERMISSIONS).map((permission, index) => (
                  <Fragment key={permission}>
                    {index > 0 && ", "}
                    <Code>{permission}</Code>
                  </Fragment>
                ))}{" "}
                — but only for an org-owned project; a fine-grained token can't
                read a personal account's own Projects boards, use a classic
                token for those.
              </Text>
              <Group gap="sm">
                <Anchor size="xs" href={CREATE_TOKEN_URL} target="_blank">
                  <Group gap={4}>
                    Create a classic token
                    <IconExternalLink size={12} />
                  </Group>
                </Anchor>
                <Anchor size="xs" href={CREATE_FINE_GRAINED_TOKEN_URL} target="_blank">
                  <Group gap={4}>
                    Create a fine-grained token
                    <IconExternalLink size={12} />
                  </Group>
                </Anchor>
              </Group>
            </Stack>
            <Group gap="xs">
              <Button type="button" variant="default" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" leftSection={<IconShieldCheck size={16} />} loading={validating}>
                Validate &amp; save
              </Button>
            </Group>
          </Stack>
        )}

        {/* --- Acting as ------------------------------------------------- */}
        {tokens.length > 0 && (
          <Stack gap={2}>
            <Select
              label="Acting as"
              data={tokens.map((token) => ({ value: token.id, label: tokenSummary(token) }))}
              value={actingAsId ?? null}
              onChange={(value) => setActingAsId(value ?? undefined)}
              allowDeselect={false}
            />
            {viewer !== undefined && (
              <Group gap="sm" align="center">
                <Badge color="green" variant="light">
                  {viewer.login}
                </Badge>
                {rateLimit !== undefined && (
                  <Text size="xs" c="dimmed">
                    {String(rateLimit.remaining)} calls left (resets{" "}
                    {new Date(rateLimit.resetAt).toLocaleTimeString()})
                  </Text>
                )}
              </Group>
            )}
          </Stack>
        )}

        {/* --- Browse / Search ---------------------------------------- */}
        {viewer !== undefined && (
          <>
            <SegmentedControl
              fullWidth
              value={browseMode}
              onChange={(value) => setBrowseMode(value === "search" ? "search" : "browse")}
              data={[
                { value: "browse", label: "Browse" },
                { value: "search", label: "Search" },
              ]}
            />

            {browseMode === "browse" && (
              <>
                <UnstyledButton
                  fw={600}
                  onClick={() => handleSelectAccount({ login: viewer.login, kind: "user" })}
                  aria-label={`Browse ${viewer.login}'s own repositories and projects`}
                >
                  <Text fw={selectedAccount?.login === viewer.login ? 700 : 600}>
                    Your repositories &amp; projects
                  </Text>
                </UnstyledButton>

                <Divider label="Your organisations" labelPosition="center" />
                <ScrollArea.Autosize mah="30vh" type="scroll">
                  <Stack gap="xs">
                    {loadingOrgs && orgs.length === 0 && (
                      <Text size="sm" c="dimmed">
                        Loading…
                      </Text>
                    )}
                    {!loadingOrgs && orgs.length === 0 && (
                      <Text size="sm" c="dimmed">
                        No organisations visible to this token.
                      </Text>
                    )}
                    {orgs.map((org) => (
                      <OrgRow
                        key={org.login}
                        org={org}
                        selected={
                          selectedAccount?.login === org.login &&
                          selectedAccount.kind === "organization"
                        }
                        onSelect={() => handleSelectAccount({ login: org.login, kind: "organization" })}
                        onAdd={() => addNodes([orgToNode(org, cascadePosition(nodeCount))])}
                      />
                ))}
                {orgsPage.hasNextPage && (
                  <Button
                    variant="subtle"
                    size="xs"
                    loading={loadingOrgs}
                    leftSection={<IconRefresh size={14} />}
                    onClick={() => {
                      const sig = signal();
                      if (sig !== undefined) void loadOrgs(orgsPage.cursor, sig);
                    }}
                  >
                    Load more orgs
                  </Button>
                )}
              </Stack>
            </ScrollArea.Autosize>
              </>
            )}

            {browseMode === "search" && (
              <Stack gap="xs">
                <Group
                  gap="xs"
                  component="form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSearchSubmit();
                  }}
                >
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder="Search GitHub… (org:, repo:, is:open, etc. supported)"
                    leftSection={<IconSearch size={16} />}
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.currentTarget.value)}
                  />
                  <Button type="submit" loading={loadingSearch}>
                    Search
                  </Button>
                </Group>
                <Text size="xs" c="dimmed">
                  GitHub&apos;s search endpoints are more strictly rate-limited than
                  browsing — searches only run when submitted, not as you type.
                </Text>
                <SegmentedControl
                  fullWidth
                  value={searchType}
                  onChange={(value) => {
                    if (isSearchResourceType(value)) handleSearchTypeChange(value);
                  }}
                  data={[
                    { value: "repositories", label: "Repositories" },
                    { value: "issues", label: "Issues" },
                    { value: "pullRequests", label: "Pull requests" },
                    { value: "accounts", label: "Accounts" },
                  ]}
                />

                {searchType === "repositories" && (
                  <ScrollArea.Autosize mah="30vh" type="scroll">
                    <Stack gap="xs">
                      {loadingSearch && searchedRepos.length === 0 && (
                        <Text size="sm" c="dimmed">
                          Searching…
                        </Text>
                      )}
                      {!loadingSearch &&
                        lastSubmittedQuery !== undefined &&
                        searchedRepos.length === 0 && (
                          <Text size="sm" c="dimmed">
                            No repositories found.
                          </Text>
                        )}
                      {searchedRepos.map((repo) => (
                        <RepoRow
                          key={`${repo.owner.login}/${repo.name}`}
                          repo={repo}
                          onAdd={() => addNodes([repoToNode(repo, cascadePosition(nodeCount))])}
                        />
                      ))}
                      {searchedReposPage.hasNextPage && lastSubmittedQuery !== undefined && (
                        <LoadMoreButton
                          loading={loadingSearch}
                          onClick={() => {
                            const sig = signal();
                            if (sig !== undefined) {
                              void runSearch(
                                "repositories",
                                lastSubmittedQuery,
                                searchedReposPage.cursor,
                                sig,
                                searchGenerationRef.current,
                              );
                            }
                          }}
                        />
                      )}
                    </Stack>
                  </ScrollArea.Autosize>
                )}

                {searchType === "issues" && (
                  <ScrollArea.Autosize mah="30vh" type="scroll">
                    <Stack gap="xs">
                      {loadingSearch && searchedIssues.length === 0 && (
                        <Text size="sm" c="dimmed">
                          Searching…
                        </Text>
                      )}
                      {!loadingSearch &&
                        lastSubmittedQuery !== undefined &&
                        searchedIssues.length === 0 && (
                          <Text size="sm" c="dimmed">
                            No issues found.
                          </Text>
                        )}
                      {searchedIssues.map((issue) => (
                        <IssueRow
                          key={`${issue.repository.owner.login}/${issue.repository.name}#${String(issue.number)}`}
                          issue={issue}
                          onAdd={() =>
                            addNodes([issueWithRepoToNode(issue, cascadePosition(nodeCount))])
                          }
                        />
                      ))}
                      {searchedIssuesPage.hasNextPage && lastSubmittedQuery !== undefined && (
                        <LoadMoreButton
                          loading={loadingSearch}
                          onClick={() => {
                            const sig = signal();
                            if (sig !== undefined) {
                              void runSearch(
                                "issues",
                                lastSubmittedQuery,
                                searchedIssuesPage.cursor,
                                sig,
                                searchGenerationRef.current,
                              );
                            }
                          }}
                        />
                      )}
                    </Stack>
                  </ScrollArea.Autosize>
                )}

                {searchType === "pullRequests" && (
                  <ScrollArea.Autosize mah="30vh" type="scroll">
                    <Stack gap="xs">
                      {loadingSearch && searchedPullRequests.length === 0 && (
                        <Text size="sm" c="dimmed">
                          Searching…
                        </Text>
                      )}
                      {!loadingSearch &&
                        lastSubmittedQuery !== undefined &&
                        searchedPullRequests.length === 0 && (
                          <Text size="sm" c="dimmed">
                            No pull requests found.
                          </Text>
                        )}
                      {searchedPullRequests.map((pullRequest) => (
                        <PullRequestRow
                          key={`${pullRequest.repository.owner.login}/${pullRequest.repository.name}#${String(pullRequest.number)}`}
                          pullRequest={pullRequest}
                          onAdd={() =>
                            addNodes([
                              pullRequestWithRepoToNode(pullRequest, cascadePosition(nodeCount)),
                            ])
                          }
                        />
                      ))}
                      {searchedPullRequestsPage.hasNextPage && lastSubmittedQuery !== undefined && (
                        <LoadMoreButton
                          loading={loadingSearch}
                          onClick={() => {
                            const sig = signal();
                            if (sig !== undefined) {
                              void runSearch(
                                "pullRequests",
                                lastSubmittedQuery,
                                searchedPullRequestsPage.cursor,
                                sig,
                                searchGenerationRef.current,
                              );
                            }
                          }}
                        />
                      )}
                    </Stack>
                  </ScrollArea.Autosize>
                )}

                {searchType === "accounts" && (
                  <ScrollArea.Autosize mah="30vh" type="scroll">
                    <Stack gap="xs">
                      {loadingSearch && searchedAccounts.length === 0 && (
                        <Text size="sm" c="dimmed">
                          Searching…
                        </Text>
                      )}
                      {!loadingSearch &&
                        lastSubmittedQuery !== undefined &&
                        searchedAccounts.length === 0 && (
                          <Text size="sm" c="dimmed">
                            No accounts found.
                          </Text>
                        )}
                      {searchedAccounts.map((account) => (
                        <AccountRow
                          key={account.login}
                          account={account}
                          selected={selectedAccount?.login === account.login}
                          onSelect={() =>
                            handleSelectAccount({ login: account.login, kind: account.accountType })
                          }
                          onAdd={() => addNodes([orgToNode(account, cascadePosition(nodeCount))])}
                        />
                      ))}
                      {searchedAccountsPage.hasNextPage && lastSubmittedQuery !== undefined && (
                        <LoadMoreButton
                          loading={loadingSearch}
                          onClick={() => {
                            const sig = signal();
                            if (sig !== undefined) {
                              void runSearch(
                                "accounts",
                                lastSubmittedQuery,
                                searchedAccountsPage.cursor,
                                sig,
                                searchGenerationRef.current,
                              );
                            }
                          }}
                        />
                      )}
                    </Stack>
                  </ScrollArea.Autosize>
                )}
              </Stack>
            )}

            {selectedAccount !== undefined && (
              <>
                <Divider label={selectedAccount.login} labelPosition="center" />
                <Tabs defaultValue="repos">
                  <Tabs.List>
                    <Tabs.Tab value="repos">Repositories</Tabs.Tab>
                    <Tabs.Tab value="projects">Projects</Tabs.Tab>
                  </Tabs.List>

                  <Tabs.Panel value="repos">
                    <ScrollArea.Autosize mah="30vh" type="scroll" mt="xs">
                      <Stack gap="xs">
                        {loadingRepos && repos.length === 0 && (
                          <Text size="sm" c="dimmed">
                            Loading…
                          </Text>
                        )}
                        {!loadingRepos && repos.length === 0 && (
                          <Text size="sm" c="dimmed">
                            No repositories.
                          </Text>
                        )}
                        {repos.map((repo) => (
                          <RepoRow
                            key={`${repo.owner.login}/${repo.name}`}
                            repo={repo}
                            onAdd={() =>
                              addNodes([repoToNode(repo, cascadePosition(nodeCount))])
                            }
                          />
                        ))}
                        {reposPage.hasNextPage && (
                          <LoadMoreButton
                            loading={loadingRepos}
                            onClick={() => {
                              const sig = signal();
                              if (sig !== undefined) {
                                void loadRepos(selectedAccount, reposPage.cursor, sig);
                              }
                            }}
                          />
                        )}
                      </Stack>
                    </ScrollArea.Autosize>
                  </Tabs.Panel>

                  <Tabs.Panel value="projects">
                    <ScrollArea.Autosize mah="30vh" type="scroll" mt="xs">
                      <Stack gap="xs">
                        {loadingProjects && projects.length === 0 && (
                          <Text size="sm" c="dimmed">
                            Loading…
                          </Text>
                        )}
                        {!loadingProjects && projects.length === 0 && (
                          <Text size="sm" c="dimmed">
                            No projects.
                          </Text>
                        )}
                        {projects.map((project) => (
                          <ProjectRow
                            key={project.id}
                            project={project}
                            onAdd={() =>
                              addNodes([
                                projectToNode(
                                  selectedAccount.login,
                                  project,
                                  cascadePosition(nodeCount),
                                ),
                              ])
                            }
                          />
                        ))}
                        {projectsPage.hasNextPage && (
                          <LoadMoreButton
                            loading={loadingProjects}
                            onClick={() => {
                              const sig = signal();
                              if (sig !== undefined) {
                                void loadProjects(
                                  selectedAccount,
                                  projectsPage.cursor,
                                  sig,
                                );
                              }
                            }}
                          />
                        )}
                      </Stack>
                    </ScrollArea.Autosize>
                  </Tabs.Panel>
                </Tabs>
              </>
            )}
          </>
        )}
      </Stack>
    </Drawer>
  );
}

/** A stored token row: label, type/scope badges, last-used, Edit/Delete. */
function TokenRow({
  token,
  onEdit,
  onDelete,
}: {
  token: StoredGithubToken;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Group justify="space-between" gap="xs" px="sm" py="xs">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Group gap={6}>
          <Text fw={600}>{token.label}</Text>
          <Badge size="xs" variant="light">
            {token.tokenType}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          {token.scope.kind === "any" ? "Any owner" : token.scope.owners.join(", ")}
          {token.lastUsedAt !== undefined &&
            ` — last used ${new Date(token.lastUsedAt).toLocaleString()}`}
        </Text>
      </Stack>
      <Group gap={4}>
        <ActionIcon variant="subtle" aria-label={`Edit ${token.label}`} onClick={onEdit}>
          <IconPencil size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" color="red" aria-label={`Delete ${token.label}`} onClick={onDelete}>
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    </Group>
  );
}

/** A selectable, addable organisation row. */
function OrgRow({
  org,
  selected,
  onSelect,
  onAdd,
}: {
  org: GitHubOrg;
  selected: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
  return (
    <Group justify="space-between" gap="xs" px="sm" py="xs">
      <UnstyledButton fw={600} onClick={onSelect} aria-label={`Browse ${org.login}`}>
        <Stack gap={2}>
          <Text fw={selected ? 700 : 600}>{org.login}</Text>
          {org.name !== undefined && (
            <Text size="xs" c="dimmed">
              {org.name}
            </Text>
          )}
        </Stack>
      </UnstyledButton>
      <Button size="xs" variant="light" leftSection={<IconCirclePlus size={14} />} onClick={onAdd}>
        Add
      </Button>
    </Group>
  );
}

/** A repository row with an "Add" action. */
function RepoRow({ repo, onAdd }: { repo: GitHubRepo; onAdd: () => void }) {
  return (
    <Group justify="space-between" gap="xs" px="sm" py="xs">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text fw={600}>
          {repo.owner.login}/{repo.name}
        </Text>
        {repo.description !== undefined && (
          <Text size="xs" c="dimmed" lineClamp={1}>
            {repo.description}
          </Text>
        )}
      </Stack>
      <Button size="xs" variant="light" leftSection={<IconCirclePlus size={14} />} onClick={onAdd}>
        Add
      </Button>
    </Group>
  );
}

/** A Projects v2 row with an "Add" action. */
function ProjectRow({
  project,
  onAdd,
}: {
  project: GitHubProject;
  onAdd: () => void;
}) {
  return (
    <Group justify="space-between" gap="xs" px="sm" py="xs">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text fw={600}>#{String(project.number)} {project.title}</Text>
        {project.closed === true && (
          <Text size="xs" c="dimmed">
            Closed
          </Text>
        )}
      </Stack>
      <Button size="xs" variant="light" leftSection={<IconCirclePlus size={14} />} onClick={onAdd}>
        Add
      </Button>
    </Group>
  );
}

/** A subtle "Load more" footer button for a paginated browse list. */
function LoadMoreButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="subtle"
      size="xs"
      loading={loading}
      leftSection={<IconRefresh size={14} />}
      onClick={onClick}
    >
      Load more
    </Button>
  );
}

/** A search result issue row with an "Add" action. */
function IssueRow({
  issue,
  onAdd,
}: {
  issue: GitHubIssueWithRepo;
  onAdd: () => void;
}) {
  return (
    <Group justify="space-between" gap="xs" px="sm" py="xs">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text fw={600} lineClamp={1}>
          {issue.title}
        </Text>
        <Text size="xs" c="dimmed">
          {issue.repository.owner.login}/{issue.repository.name}#{String(issue.number)} —{" "}
          {issue.state}
        </Text>
      </Stack>
      <Button size="xs" variant="light" leftSection={<IconCirclePlus size={14} />} onClick={onAdd}>
        Add
      </Button>
    </Group>
  );
}

/** A search result pull request row with an "Add" action. */
function PullRequestRow({
  pullRequest,
  onAdd,
}: {
  pullRequest: GitHubPullRequestWithRepo;
  onAdd: () => void;
}) {
  return (
    <Group justify="space-between" gap="xs" px="sm" py="xs">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text fw={600} lineClamp={1}>
          {pullRequest.title}
        </Text>
        <Text size="xs" c="dimmed">
          {pullRequest.repository.owner.login}/{pullRequest.repository.name}#
          {String(pullRequest.number)} — {pullRequest.state}
        </Text>
      </Stack>
      <Button size="xs" variant="light" leftSection={<IconCirclePlus size={14} />} onClick={onAdd}>
        Add
      </Button>
    </Group>
  );
}

/** A search result account row (user or organisation) — selectable to browse
 *  its repos/projects via the same drill-down section {@link OrgRow} feeds,
 *  and addable directly, matching {@link OrgRow}'s two affordances. */
function AccountRow({
  account,
  selected,
  onSelect,
  onAdd,
}: {
  account: GitHubSearchAccount;
  selected: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
  return (
    <Group justify="space-between" gap="xs" px="sm" py="xs">
      <UnstyledButton fw={600} onClick={onSelect} aria-label={`Browse ${account.login}`}>
        <Stack gap={2}>
          <Group gap={6}>
            <Text fw={selected ? 700 : 600}>{account.login}</Text>
            <Badge size="xs" variant="light" color={account.accountType === "user" ? "teal" : "blue"}>
              {account.accountType}
            </Badge>
          </Group>
          {account.name !== undefined && (
            <Text size="xs" c="dimmed">
              {account.name}
            </Text>
          )}
        </Stack>
      </UnstyledButton>
      <Button size="xs" variant="light" leftSection={<IconCirclePlus size={14} />} onClick={onAdd}>
        Add
      </Button>
    </Group>
  );
}
