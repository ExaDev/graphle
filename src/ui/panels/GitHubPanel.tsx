/**
 * GitHub integration drawer. Three phases, top to bottom:
 *
 * 1. PAT entry: a PasswordInput plus Save (writes the token to the SecretStore,
 *    the only place the PAT ever lives in this app) and Validate (builds a
 *    client from the entered token, calls `viewer` to confirm it works, then
 *    surfaces the login and the rate-limit budget).
 * 2. Browse: lists the viewer's organisations. Selecting one loads its repos
 *    (listOrgRepos) and projects (listOrgProjects) into tabs; every row has an
 *    "Add to graph" action that materialises the entity into a node via the
 *    pure mappers and folds it through `store.mergeDelta`.
 * 3. Pagination tails: each list offers "Load more" while its connection has a
 *    next page.
 *
 * Opening and closing lives in `store.githubPanelOpened` rather than local
 * component state — a caller with no JSX of its own (`useUrlSync`, on page
 * mount) can still open this drawer to prompt for a PAT. Such a caller can
 * also attach a one-shot `store.pendingGitHubAction`, run with the freshly
 * validated client right after a successful `handleValidate` and then
 * cleared; this component never inspects what that action does (e.g. resume
 * a GitHub Projects URL load) — it stays a general auth+browse drawer.
 *
 * SECURITY: the PAT is sensitive credential material. It lives only in the
 * SecretStore (IndexedDB `secrets` table, separate from graph data) and in the
 * Authorization header `createGitHubClient` sends. It is never written to the
 * document, never placed in a URL, never passed to `notifications.show`, and
 * never included in an export — `exportDocument` serialises the graph document,
 * which structurally cannot carry it. Keep it that way: do not log the token,
 * do not copy it into graph node data, do not echo it in error messages.
 *
 * Every fetch passes the drawer's AbortSignal, which is aborted on close so an
 * in-flight request does not resolve into an unmounted state update. Errors
 * surface through Mantine notifications with kind-specific guidance
 * (unauthorised -> check scopes, rateLimited -> reset time, network -> network).
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
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
  Stack,
  Tabs,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCirclePlus,
  IconExternalLink,
  IconKey,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
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
  type GitHubClient,
  type GitHubIssueWithRepo,
  type GitHubOrg,
  type GitHubProject,
  type GitHubPullRequestWithRepo,
  type GitHubRepo,
  type GitHubSearchAccount,
  type GitHubViewer,
} from "@/github";
import type { GraphNode } from "@/schema";
import { cascadePosition } from "@/domain";
import { db } from "@/storage/db";
import { createSecretStore } from "@/storage/secret-store-dexie";
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

export function GitHubPanel({ opened, onClose }: GitHubPanelProps) {
  // The SecretStore is created once; `db` is a process-wide singleton. The UI
  // never touches Dexie directly, keeping the storage boundary clean.
  const secretStore = useMemo(() => createSecretStore(db), []);

  const nodeCount = useGraphStore((state) => state.document.nodes.length);
  const mergeDelta = useGraphStore((state) => state.mergeDelta);

  const [tokenInput, setTokenInput] = useState("");
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

  // Seed the input with any previously saved token when the drawer opens, so a
  // returning user can re-validate without retyping.
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    void secretStore
      .getGitHubToken(controller.signal)
      .then((stored) => {
        if (controller.signal.aborted || stored === undefined) return;
        setTokenInput(stored);
      })
      // On abort the cleanup already ran; on a non-abort read failure leave
      // the input unseeded so the user can retype their token.
      .catch(() => {
        if (controller.signal.aborted) return;
      });
    return () => controller.abort();
  }, [opened, secretStore]);

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

  async function handleSaveToken(): Promise<void> {
    const sig = signal();
    if (sig === undefined) return;
    if (tokenInput === "") {
      notifications.show({ color: "red", message: "Enter a token first" });
      return;
    }
    // setGitHubToken resolves to void, so success and the runWith "undefined on
    // error" path are indistinguishable by return value: handle the save
    // explicitly so the success notification only fires when it actually wrote.
    try {
      await secretStore.setGitHubToken(tokenInput, sig);
      notifications.show({ color: "green", message: "PAT saved" });
    } catch (error) {
      if (sig.aborted) return;
      notifyGitHubError(error);
    }
  }

  async function handleValidate(): Promise<void> {
    const sig = signal();
    if (sig === undefined) return;
    if (tokenInput === "") {
      notifications.show({ color: "red", message: "Enter a token first" });
      return;
    }
    setValidating(true);
    const client = createGitHubClient({ token: tokenInput });
    const result = await runWith(() => client.viewer(sig), sig);
    setValidating(false);
    if (result === undefined) {
      // Validation failed; clear any prior session so the browse section does
      // not show stale data behind a dead token.
      clientRef.current = undefined;
      setViewer(undefined);
      return;
    }
    clientRef.current = client;
    setViewer(result);
    setRateLimit(client.lastRateLimit);
    notifications.show({ color: "green", message: `Signed in as ${result.login}` });

    // Resume any pending action (e.g. a GitHub Projects URL load waiting on
    // auth) with the freshly validated client, then clear it. This panel
    // doesn't inspect what the action does, or decide whether to close
    // itself afterwards — that's the caller's call, made when it set the
    // action via store.openGitHubPanel(pendingAction).
    const pendingAction = useGraphStore.getState().pendingGitHubAction;
    if (pendingAction !== undefined) {
      useGraphStore.setState({ pendingGitHubAction: undefined });
      pendingAction(client);
    }

    // Reset browse state for the freshly authenticated viewer, then load orgs.
    setSelectedAccount(undefined);
    setRepos([]);
    setReposPage(NO_PAGE);
    setProjects([]);
    setProjectsPage(NO_PAGE);
    void loadOrgs(undefined, sig);
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
        {/* --- PAT entry + validation -------------------------------- */}
        <Stack
          component="form"
          gap="xs"
          onSubmit={(event) => {
            event.preventDefault();
            void handleValidate();
          }}
        >
          <PasswordInput
            label="Personal access token"
            placeholder="ghp_… / github_pat_…"
            leftSection={<IconKey size={16} />}
            value={tokenInput}
            onChange={(event) => setTokenInput(event.currentTarget.value)}
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
            <Button type="button" variant="default" onClick={() => void handleSaveToken()}>
              Save
            </Button>
            <Button type="submit" leftSection={<IconShieldCheck size={16} />} loading={validating}>
              Validate
            </Button>
          </Group>
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
