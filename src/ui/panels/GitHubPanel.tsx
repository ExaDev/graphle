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
import { useEffect, useMemo, useRef, useState } from "react";
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
  Stack,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCirclePlus,
  IconExternalLink,
  IconKey,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";

import {
  buildDelta,
  createGitHubClient,
  GitHubError,
  orgToNode,
  projectToNode,
  repoToNode,
  type GitHubClient,
  type GitHubOrg,
  type GitHubProject,
  type GitHubRepo,
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

/** GitHub token settings URL, linked from the PAT help text. */
const TOKEN_SETTINGS_URL = "https://github.com/settings/tokens";

/**
 * Maps a {@link GitHubError} to a short, actionable notification message. The
 * kind discriminator drives the branch so the user gets scope/rate-limit/
 * network guidance rather than a raw error string.
 */
function githubErrorMessage(error: GitHubError): string {
  switch (error.kind.type) {
    case "unauthorised":
      return "Unauthorised — check your PAT scopes";
    case "rateLimited":
      return error.kind.resetAt === undefined
        ? "GitHub rate limit exceeded"
        : `GitHub rate limit exceeded; resets at ${error.kind.resetAt}`;
    case "network":
      return "Network error";
    case "forbidden":
      return `Forbidden: ${error.kind.message}`;
    case "notFound":
      return "Not found";
    case "invalidResponse":
      return `Invalid response: ${error.kind.message}`;
  }
}

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
  const [selectedOrgLogin, setSelectedOrgLogin] = useState<string | undefined>(
    undefined,
  );

  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposPage, setReposPage] = useState<PageTail>(NO_PAGE);
  const [projects, setProjects] = useState<GitHubProject[]>([]);
  const [projectsPage, setProjectsPage] = useState<PageTail>(NO_PAGE);

  const [validating, setValidating] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // The validated client, kept for browse fetches. Held in a ref rather than
  // state because its identity is irrelevant to rendering — only its methods
  // are called from handlers.
  const clientRef = useRef<GitHubClient | undefined>(undefined);

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
    // Reset browse state for the freshly authenticated viewer, then load orgs.
    setSelectedOrgLogin(undefined);
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
    login: string,
    cursor: string | undefined,
    sig: AbortSignal,
  ): Promise<void> {
    const client = clientRef.current;
    if (client === undefined) return;
    setLoadingRepos(true);
    const result = await runWith(() => client.listOrgRepos(login, cursor, sig), sig);
    setLoadingRepos(false);
    if (result === undefined) return;
    setRepos((prev) => (cursor === undefined ? result.items : [...prev, ...result.items]));
    setReposPage({ cursor: result.endCursor, hasNextPage: result.hasNextPage });
  }

  async function loadProjects(
    login: string,
    cursor: string | undefined,
    sig: AbortSignal,
  ): Promise<void> {
    const client = clientRef.current;
    if (client === undefined) return;
    setLoadingProjects(true);
    const result = await runWith(() => client.listOrgProjects(login, cursor, sig), sig);
    setLoadingProjects(false);
    if (result === undefined) return;
    setProjects((prev) =>
      cursor === undefined ? result.items : [...prev, ...result.items],
    );
    setProjectsPage({ cursor: result.endCursor, hasNextPage: result.hasNextPage });
  }

  function handleSelectOrg(login: string): void {
    const sig = signal();
    if (sig === undefined) return;
    setSelectedOrgLogin(login);
    setRepos([]);
    setReposPage(NO_PAGE);
    setProjects([]);
    setProjectsPage(NO_PAGE);
    void loadRepos(login, undefined, sig);
    void loadProjects(login, undefined, sig);
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
        <Stack gap="xs">
          <PasswordInput
            label="Personal access token"
            placeholder="ghp_… / github_pat_…"
            leftSection={<IconKey size={16} />}
            value={tokenInput}
            onChange={(event) => setTokenInput(event.currentTarget.value)}
          />
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              Classic token needs <Code>repo</Code>, <Code>read:org</Code>,{" "}
              <Code>read:project</Code>. Fine-grained needs the org's Projects
              (read).
            </Text>
            <Anchor size="xs" href={TOKEN_SETTINGS_URL} target="_blank">
              <Group gap={4}>
                Manage tokens
                <IconExternalLink size={12} />
              </Group>
            </Anchor>
          </Stack>
          <Group gap="xs">
            <Button variant="default" onClick={() => void handleSaveToken()}>
              Save
            </Button>
            <Button
              leftSection={<IconShieldCheck size={16} />}
              loading={validating}
              onClick={() => void handleValidate()}
            >
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

        {/* --- Browse ------------------------------------------------ */}
        {viewer !== undefined && (
          <>
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
                    selected={org.login === selectedOrgLogin}
                    onSelect={() => handleSelectOrg(org.login)}
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

            {selectedOrgLogin !== undefined && (
              <>
                <Divider label={selectedOrgLogin} labelPosition="center" />
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
                                void loadRepos(selectedOrgLogin, reposPage.cursor, sig);
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
                                  selectedOrgLogin,
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
                                  selectedOrgLogin,
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
