import { describe, expect, it } from "vitest";

import { GitHubError } from "./errors";
import { DEFAULT_REPO_ISSUES_FILTERS, DEFAULT_REPO_PULL_REQUESTS_FILTERS } from "./filters";
import { createGitHubClient } from "./graphql-adapter";

/** Narrows a parsed request body to a `{ query: string }` envelope. */
function hasQueryEnvelope(value: unknown): value is { query: string } {
  if (typeof value !== "object" || value === null) return false;
  if (!("query" in value)) return false;
  return typeof value.query === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrows a parsed request body's `variables` field, if present and an object. */
function extractVariables(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (!("variables" in value)) return undefined;
  const variables = value.variables;
  return isRecord(variables) ? variables : undefined;
}

/**
 * Stub `fetch` that dispatches on the GraphQL operation name embedded in the
 * request body's `query`, returning the registered fixture. This lets each test
 * stage a different response shape without touching the network.
 */
function stubFetch(
  handlers: Record<string, (body: { query: string }) => Response>,
): typeof globalThis.fetch {
  return (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Mimic real fetch, which rejects when called with an already-aborted
    // signal — the client maps that rejection to a `network` GitHubError.
    if (init?.signal?.aborted) {
      return Promise.reject(new Error("The user aborted a request."));
    }
    const rawBody = init?.body;
    if (typeof rawBody !== "string") {
      throw new Error("stub fetch expected a string request body");
    }
    const parsed: unknown = JSON.parse(rawBody);
    if (!hasQueryEnvelope(parsed)) {
      throw new Error("stub fetch expected a { query: string } request body");
    }
    const match = /^query\s+(\w+)/.exec(parsed.query);
    if (match === null) {
      throw new Error(`stub fetch could not parse operation name from: ${parsed.query}`);
    }
    const opName = match[1];
    if (opName === undefined) {
      throw new Error("stub fetch found no operation-name capture group");
    }
    const handler = handlers[opName];
    if (handler === undefined) {
      throw new Error(`stub fetch has no handler for operation ${opName}`);
    }
    return Promise.resolve(handler(parsed));
  };
}

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RATE = { remaining: 4999, resetAt: "2026-07-08T12:00:00Z" };

describe("createGitHubClient - viewer", () => {
  it("returns the authenticated login", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        Viewer: () =>
          jsonResponse({ data: { viewer: { login: "joe" }, rateLimit: RATE } }),
      }),
    });
    const viewer = await client.viewer(new AbortController().signal);
    expect(viewer.login).toBe("joe");
    expect(client.lastRateLimit).toEqual(RATE);
  });
});

describe("createGitHubClient - pagination", () => {
  it("threads endCursor from one page into the next listOrgRepos call", async () => {
    let call = 0;
    const cursors: (string | undefined)[] = [];
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        OrgRepos: () => {
          call += 1;
          const page = call === 1
            ? {
                nodes: [{ name: "alpha", owner: { login: "exadev" }, description: null }],
                pageInfo: { hasNextPage: true, endCursor: "CURSOR1" },
              }
            : {
                nodes: [{ name: "beta", owner: { login: "exadev" }, description: null }],
                pageInfo: { hasNextPage: false, endCursor: null },
              };
          return jsonResponse({
            data: { organization: { repositories: page }, rateLimit: RATE },
          });
        },
      }),
    });

    const first = await client.listOrgRepos("exadev", undefined, new AbortController().signal);
    cursors.push(first.endCursor);
    const second = await client.listOrgRepos("exadev", first.endCursor, new AbortController().signal);
    cursors.push(second.endCursor);

    expect(first.items.map((r) => r.name)).toEqual(["alpha"]);
    expect(first.endCursor).toBe("CURSOR1");
    expect(first.hasNextPage).toBe(true);
    expect(second.items.map((r) => r.name)).toEqual(["beta"]);
    expect(second.endCursor).toBeUndefined();
    expect(second.hasNextPage).toBe(false);
    expect(cursors).toEqual(["CURSOR1", undefined]);
  });

  it("parses repo issues, org projects, and project items", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        RepoIssues: () =>
          jsonResponse({
            data: {
              repository: {
                issues: {
                  nodes: [
                    { number: 1, title: "Bug", state: "OPEN", url: "u1" },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
              rateLimit: RATE,
            },
          }),
        OrgProjects: () =>
          jsonResponse({
            data: {
              organization: {
                projectsV2: {
                  nodes: [
                    { id: "P_1", number: 1, title: "Roadmap", url: "pu1" },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
              rateLimit: RATE,
            },
          }),
        ProjectItems: () =>
          jsonResponse({
            data: {
              node: {
                items: {
                  nodes: [
                    {
                      content: {
                        __typename: "Issue",
                        number: 7,
                        title: "Tracked",
                        state: "OPEN",
                        url: "iu7",
                        repository: { name: "graphle", owner: { login: "exadev" } },
                      },
                    },
                    {
                      content: { __typename: "DraftIssue", title: "A draft" },
                    },
                    {
                      // PullRequest content is parsed but dropped.
                      content: { __typename: "PullRequest" },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });

    const issues = await client.listRepoIssues(
      "exadev",
      "graphle",
      undefined,
      DEFAULT_REPO_ISSUES_FILTERS,
      new AbortController().signal,
    );
    expect(issues.items).toHaveLength(1);
    expect(issues.items[0]?.number).toBe(1);

    const projects = await client.listOrgProjects(
      "exadev",
      undefined,
      new AbortController().signal,
    );
    expect(projects.items[0]?.number).toBe(1);

    const items = await client.listProjectItems(
      "P_1",
      undefined,
      new AbortController().signal,
    );
    // The PullRequest item is dropped; Issue and DraftIssue survive.
    expect(items.items).toHaveLength(2);
    expect(items.items.map((i) => i.__typename)).toEqual(["Issue", "DraftIssue"]);
  });
});

describe("createGitHubClient - listRepoPullRequests", () => {
  it("fetches a page of pull requests", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        RepoPullRequests: () =>
          jsonResponse({
            data: {
              repository: {
                pullRequests: {
                  nodes: [
                    {
                      number: 1,
                      title: "Add feature",
                      state: "OPEN",
                      url: "pr1",
                      baseRefName: "main",
                      headRefName: "feature-1",
                      headRepository: { name: "graphle", owner: { login: "exadev" } },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });

    const pullRequests = await client.listRepoPullRequests(
      "exadev",
      "graphle",
      undefined,
      DEFAULT_REPO_PULL_REQUESTS_FILTERS,
      new AbortController().signal,
    );
    expect(pullRequests.items).toHaveLength(1);
    expect(pullRequests.items[0]?.number).toBe(1);
    expect(pullRequests.items[0]?.state).toBe("open");
    expect(pullRequests.items[0]?.baseRefName).toBe("main");
    expect(pullRequests.items[0]?.headRefName).toBe("feature-1");
    expect(pullRequests.items[0]?.headRepository).toEqual({ name: "graphle", owner: { login: "exadev" } });
    expect(pullRequests.hasNextPage).toBe(false);
    expect(pullRequests.endCursor).toBeUndefined();
    expect(client.lastRateLimit).toEqual(RATE);
  });

  it("threads endCursor from one page into the next call", async () => {
    let call = 0;
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        RepoPullRequests: () => {
          call += 1;
          const page =
            call === 1
              ? {
                  nodes: [
                    {
                      number: 1,
                      title: "First",
                      state: "OPEN",
                      url: "pr1",
                      baseRefName: "main",
                      headRefName: "feature-1",
                      headRepository: { name: "graphle", owner: { login: "exadev" } },
                    },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: "CURSOR1" },
                }
              : {
                  nodes: [
                    {
                      number: 2,
                      title: "Second",
                      state: "MERGED",
                      url: "pr2",
                      baseRefName: "main",
                      headRefName: "feature-2",
                      headRepository: { name: "graphle", owner: { login: "exadev" } },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                };
          return jsonResponse({
            data: { repository: { pullRequests: page }, rateLimit: RATE },
          });
        },
      }),
    });

    const first = await client.listRepoPullRequests(
      "exadev",
      "graphle",
      undefined,
      DEFAULT_REPO_PULL_REQUESTS_FILTERS,
      new AbortController().signal,
    );
    expect(first.items.map((p) => p.number)).toEqual([1]);
    expect(first.endCursor).toBe("CURSOR1");
    expect(first.hasNextPage).toBe(true);

    const second = await client.listRepoPullRequests(
      "exadev",
      "graphle",
      first.endCursor,
      DEFAULT_REPO_PULL_REQUESTS_FILTERS,
      new AbortController().signal,
    );
    expect(second.items.map((p) => p.number)).toEqual([2]);
    expect(second.endCursor).toBeUndefined();
    expect(second.hasNextPage).toBe(false);
  });

  it("throws notFound when the repository doesn't resolve", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        RepoPullRequests: () =>
          jsonResponse({
            data: { repository: null, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }],
          }),
      }),
    });
    await expect(
      client.listRepoPullRequests(
        "exadev",
        "no-such-repo",
        undefined,
        DEFAULT_REPO_PULL_REQUESTS_FILTERS,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });

  it("classifies a RATE_LIMITED GraphQL error as rateLimited with resetAt", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        RepoPullRequests: () =>
          jsonResponse({
            data: { repository: null, rateLimit: RATE },
            errors: [{ type: "RATE_LIMITED", message: "too many" }],
          }),
      }),
    });
    await expect(
      client.listRepoPullRequests(
        "exadev",
        "graphle",
        undefined,
        DEFAULT_REPO_PULL_REQUESTS_FILTERS,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      kind: { type: "rateLimited", resetAt: RATE.resetAt },
    });
  });

  it("maps lower-case filters to GitHub's upper-case GraphQL variables, omitting empty labels", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const client = createGitHubClient({
      token: "t",
      fetch: (_input, init) => {
        const rawBody = init?.body;
        if (typeof rawBody !== "string") throw new Error("expected a string request body");
        const parsed: unknown = JSON.parse(rawBody);
        const variables = extractVariables(parsed);
        if (variables !== undefined) capturedVariables = variables;
        return Promise.resolve(
          jsonResponse({
            data: {
              repository: {
                pullRequests: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
              },
              rateLimit: RATE,
            },
          }),
        );
      },
    });

    await client.listRepoPullRequests(
      "exadev",
      "graphle",
      undefined,
      { states: ["open", "merged"], sort: { field: "created", direction: "asc" }, labels: [] },
      new AbortController().signal,
    );

    expect(capturedVariables).toMatchObject({
      states: ["OPEN", "MERGED"],
      orderByField: "CREATED_AT",
      orderByDirection: "ASC",
    });
    expect(capturedVariables?.labels).toBeUndefined();
  });
});

describe("createGitHubClient - getOrgProject / getUserProject", () => {
  it("resolves an org-owned project by number", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        OrgProject: () =>
          jsonResponse({
            data: {
              organization: {
                projectV2: {
                  id: "PVT_1",
                  number: 1,
                  title: "Roadmap",
                  url: "https://github.com/orgs/exadev/projects/1",
                  closed: false,
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const project = await client.getOrgProject("exadev", 1, new AbortController().signal);
    expect(project).toEqual({
      id: "PVT_1",
      number: 1,
      title: "Roadmap",
      url: "https://github.com/orgs/exadev/projects/1",
      closed: false,
    });
    expect(client.lastRateLimit).toEqual(RATE);
  });

  it("resolves a user-owned project by number", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        UserProject: () =>
          jsonResponse({
            data: {
              user: {
                projectV2: {
                  id: "PVT_2",
                  number: 3,
                  title: "Personal board",
                  url: "https://github.com/users/joe/projects/3",
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const project = await client.getUserProject("joe", 3, new AbortController().signal);
    expect(project.id).toBe("PVT_2");
    expect(project.title).toBe("Personal board");
  });

  it("throws notFound when the organization itself doesn't resolve", async () => {
    // GitHub reports this as HTTP 200 with organization: null plus a
    // NOT_FOUND GraphQL error, never an HTTP 404 — confirmed empirically.
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        OrgProject: () =>
          jsonResponse({
            data: { organization: null, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to an Organization" }],
          }),
      }),
    });
    await expect(
      client.getOrgProject("no-such-org", 1, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });

  it("throws notFound when the org exists but the project number doesn't", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        OrgProject: () =>
          jsonResponse({
            data: { organization: { projectV2: null }, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to a ProjectV2" }],
          }),
      }),
    });
    await expect(
      client.getOrgProject("exadev", 999, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });

  it("throws notFound when the user exists but the project number doesn't", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        UserProject: () =>
          jsonResponse({
            data: { user: { projectV2: null }, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to a ProjectV2" }],
          }),
      }),
    });
    await expect(
      client.getUserProject("joe", 999, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });
});

describe("createGitHubClient - getRepo", () => {
  it("resolves a repository by owner and name", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        Repo: () =>
          jsonResponse({
            data: {
              repository: {
                owner: { login: "exadev" },
                name: "graphle",
                url: "https://github.com/exadev/graphle",
                description: "A graph tool",
                isArchived: false,
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const repo = await client.getRepo("exadev", "graphle", new AbortController().signal);
    expect(repo).toEqual({
      owner: { login: "exadev" },
      name: "graphle",
      url: "https://github.com/exadev/graphle",
      description: "A graph tool",
      isArchived: false,
    });
    expect(client.lastRateLimit).toEqual(RATE);
  });

  it("throws notFound when the repository doesn't resolve", async () => {
    // Mirrors the project lookups: GitHub reports this as HTTP 200 with
    // repository: null plus a NOT_FOUND GraphQL error, never an HTTP 404.
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        Repo: () =>
          jsonResponse({
            data: { repository: null, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }],
          }),
      }),
    });
    await expect(
      client.getRepo("exadev", "no-such-repo", new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });

  it("passes through rate-limit classification for getRepo", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        Repo: () =>
          jsonResponse({
            data: { repository: null, rateLimit: RATE },
            errors: [{ type: "RATE_LIMITED", message: "too many" }],
          }),
      }),
    });
    await expect(
      client.getRepo("exadev", "graphle", new AbortController().signal),
    ).rejects.toMatchObject({
      kind: { type: "rateLimited", resetAt: RATE.resetAt },
    });
  });
});

describe("createGitHubClient - listUserRepos / listUserProjects", () => {
  it("fetches a personal account's own repositories", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        UserRepos: () =>
          jsonResponse({
            data: {
              user: {
                repositories: {
                  nodes: [{ name: "dotfiles", owner: { login: "joe" }, description: null }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const repos = await client.listUserRepos("joe", undefined, new AbortController().signal);
    expect(repos.items.map((r) => r.name)).toEqual(["dotfiles"]);
    expect(client.lastRateLimit).toEqual(RATE);
  });

  it("fetches a personal account's own projects", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        UserProjects: () =>
          jsonResponse({
            data: {
              user: {
                projectsV2: {
                  nodes: [{ id: "PVT_9", number: 2, title: "Personal board", url: "pu2" }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const projects = await client.listUserProjects("joe", undefined, new AbortController().signal);
    expect(projects.items.map((p) => p.number)).toEqual([2]);
  });

  it("throws notFound when the login doesn't resolve to a user", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        UserRepos: () =>
          jsonResponse({
            data: { user: null, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to a User" }],
          }),
      }),
    });
    await expect(
      client.listUserRepos("no-such-user", undefined, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });
});

describe("createGitHubClient - search", () => {
  it("searches repositories", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        SearchRepositories: () =>
          jsonResponse({
            data: {
              search: {
                nodes: [
                  {
                    __typename: "Repository",
                    name: "graphle",
                    owner: { login: "exadev" },
                    url: "https://github.com/exadev/graphle",
                    description: "A graph tool",
                    isArchived: false,
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const repos = await client.searchRepositories("graphle", undefined, new AbortController().signal);
    expect(repos.items.map((r) => r.name)).toEqual(["graphle"]);
    expect(client.lastRateLimit).toEqual(RATE);
  });

  it("appends is:issue to the query when searching issues", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const client = createGitHubClient({
      token: "t",
      fetch: (_input, init) => {
        const rawBody = init?.body;
        if (typeof rawBody !== "string") throw new Error("expected a string request body");
        const parsed: unknown = JSON.parse(rawBody);
        const variables = extractVariables(parsed);
        if (variables !== undefined) capturedVariables = variables;
        return Promise.resolve(
          jsonResponse({
            data: {
              search: {
                nodes: [
                  {
                    __typename: "Issue",
                    number: 1,
                    title: "A bug",
                    state: "OPEN",
                    url: "iu1",
                    repository: { name: "graphle", owner: { login: "exadev" } },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              rateLimit: RATE,
            },
          }),
        );
      },
    });
    const issues = await client.searchIssues("bug", undefined, new AbortController().signal);
    expect(issues.items.map((i) => i.number)).toEqual([1]);
    expect(capturedVariables).toMatchObject({ query: "bug is:issue" });
  });

  it("appends is:pr to the query when searching pull requests", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const client = createGitHubClient({
      token: "t",
      fetch: (_input, init) => {
        const rawBody = init?.body;
        if (typeof rawBody !== "string") throw new Error("expected a string request body");
        const parsed: unknown = JSON.parse(rawBody);
        const variables = extractVariables(parsed);
        if (variables !== undefined) capturedVariables = variables;
        return Promise.resolve(
          jsonResponse({
            data: {
              search: {
                nodes: [
                  {
                    __typename: "PullRequest",
                    number: 4,
                    title: "Add feature",
                    state: "OPEN",
                    url: "pu4",
                    baseRefName: "main",
                    headRefName: "feature",
                    headRepository: { name: "graphle", owner: { login: "exadev" } },
                    repository: { name: "graphle", owner: { login: "exadev" } },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              rateLimit: RATE,
            },
          }),
        );
      },
    });
    const pullRequests = await client.searchPullRequests(
      "feature",
      undefined,
      new AbortController().signal,
    );
    expect(pullRequests.items.map((p) => p.number)).toEqual([4]);
    expect(capturedVariables).toMatchObject({ query: "feature is:pr" });
  });

  it("searches accounts, discriminating User from Organization via accountType", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        SearchAccounts: () =>
          jsonResponse({
            data: {
              search: {
                nodes: [
                  { __typename: "User", login: "joe", name: "Joe" },
                  { __typename: "Organization", login: "exadev", name: "ExaDev" },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const accounts = await client.searchAccounts("joe", undefined, new AbortController().signal);
    expect(accounts.items).toEqual([
      { login: "joe", name: "Joe", accountType: "user" },
      { login: "exadev", name: "ExaDev", accountType: "organization" },
    ]);
  });
});

describe("createGitHubClient - explicit-null nullable fields", () => {
  // GraphQL returns an explicit `null` for a selected-but-unset nullable
  // scalar, not an absent key (confirmed via live search API testing:
  // User.name and Repository.description are both genuinely nullable, and
  // real accounts/repos without one really do come back `null`). A schema
  // that only accepts `undefined` for these fields fails to parse the
  // instant a real node has one — these tests pin the fix (`nullableString`
  // in schema.ts transforming `null` to `undefined` at the parse boundary)
  // so it can't silently regress back to `.optional()`.
  it("parses an org with a null name", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        ViewerOrgs: () =>
          jsonResponse({
            data: {
              viewer: {
                login: "joe",
                organizations: {
                  nodes: [{ login: "exadev", name: null }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const orgs = await client.listViewerOrgs(undefined, new AbortController().signal);
    expect(orgs.items).toEqual([{ login: "exadev", name: undefined }]);
  });

  it("parses a repo with a null description", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        OrgRepos: () =>
          jsonResponse({
            data: {
              organization: {
                repositories: {
                  nodes: [{ name: "graphle", owner: { login: "exadev" }, description: null }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const repos = await client.listOrgRepos("exadev", undefined, new AbortController().signal);
    expect(repos.items[0]?.description).toBeUndefined();
  });

  it("parses a search account with a null name", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        SearchAccounts: () =>
          jsonResponse({
            data: {
              search: {
                nodes: [{ __typename: "User", login: "no-name-set", name: null }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });
    const accounts = await client.searchAccounts(
      "no-name-set",
      undefined,
      new AbortController().signal,
    );
    expect(accounts.items).toEqual([
      { login: "no-name-set", name: undefined, accountType: "user" },
    ]);
  });
});

describe("createGitHubClient - listIssueSubIssues", () => {
  it("fetches a page of sub-issues", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        IssueSubIssues: () =>
          jsonResponse({
            data: {
              repository: {
                issue: {
                  subIssues: {
                    nodes: [{ number: 8, title: "Sub-issue", state: "OPEN", url: "u8" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });

    const subIssues = await client.listIssueSubIssues(
      "exadev",
      "graphle",
      7,
      undefined,
      new AbortController().signal,
    );
    expect(subIssues.items).toHaveLength(1);
    expect(subIssues.items[0]?.number).toBe(8);
    expect(subIssues.items[0]?.state).toBe("open");
    expect(subIssues.hasNextPage).toBe(false);
    expect(client.lastRateLimit).toEqual(RATE);
  });

  it("throws notFound when the repository doesn't resolve", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        IssueSubIssues: () =>
          jsonResponse({
            data: { repository: null, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }],
          }),
      }),
    });
    await expect(
      client.listIssueSubIssues("exadev", "no-such-repo", 7, undefined, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });

  it("throws notFound when the issue number doesn't resolve in a known repository", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        IssueSubIssues: () =>
          jsonResponse({
            data: { repository: { issue: null }, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to an Issue" }],
          }),
      }),
    });
    await expect(
      client.listIssueSubIssues("exadev", "graphle", 9999, undefined, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });
});

describe("createGitHubClient - listIssueBlockedBy", () => {
  it("fetches a page of blocking issues, each with its own repository", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        IssueBlockedBy: () =>
          jsonResponse({
            data: {
              repository: {
                issue: {
                  blockedBy: {
                    nodes: [
                      {
                        number: 3,
                        title: "Blocking issue",
                        state: "OPEN",
                        url: "u3",
                        repository: { name: "other-repo", owner: { login: "exadev" } },
                      },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });

    const blockedBy = await client.listIssueBlockedBy(
      "exadev",
      "graphle",
      7,
      undefined,
      new AbortController().signal,
    );
    expect(blockedBy.items).toHaveLength(1);
    expect(blockedBy.items[0]?.number).toBe(3);
    expect(blockedBy.items[0]?.repository).toEqual({ name: "other-repo", owner: { login: "exadev" } });
    expect(blockedBy.hasNextPage).toBe(false);
    expect(client.lastRateLimit).toEqual(RATE);
  });

  it("throws notFound when the repository doesn't resolve", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        IssueBlockedBy: () =>
          jsonResponse({
            data: { repository: null, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }],
          }),
      }),
    });
    await expect(
      client.listIssueBlockedBy("exadev", "no-such-repo", 7, undefined, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });

  it("throws notFound when the issue number doesn't resolve in a known repository", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        IssueBlockedBy: () =>
          jsonResponse({
            data: { repository: { issue: null }, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to an Issue" }],
          }),
      }),
    });
    await expect(
      client.listIssueBlockedBy("exadev", "graphle", 9999, undefined, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });
});

describe("createGitHubClient - listIssueBlocking", () => {
  it("fetches a page of blocked issues, each with its own repository", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        IssueBlocking: () =>
          jsonResponse({
            data: {
              repository: {
                issue: {
                  blocking: {
                    nodes: [
                      {
                        number: 4,
                        title: "Blocked issue",
                        state: "CLOSED",
                        url: "u4",
                        repository: { name: "graphle", owner: { login: "exadev" } },
                      },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
              rateLimit: RATE,
            },
          }),
      }),
    });

    const blocking = await client.listIssueBlocking(
      "exadev",
      "graphle",
      7,
      undefined,
      new AbortController().signal,
    );
    expect(blocking.items).toHaveLength(1);
    expect(blocking.items[0]?.number).toBe(4);
    expect(blocking.items[0]?.state).toBe("closed");
    expect(blocking.hasNextPage).toBe(false);
    expect(client.lastRateLimit).toEqual(RATE);
  });

  it("throws notFound when the repository doesn't resolve", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        IssueBlocking: () =>
          jsonResponse({
            data: { repository: null, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }],
          }),
      }),
    });
    await expect(
      client.listIssueBlocking("exadev", "no-such-repo", 7, undefined, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });

  it("throws notFound when the issue number doesn't resolve in a known repository", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        IssueBlocking: () =>
          jsonResponse({
            data: { repository: { issue: null }, rateLimit: RATE },
            errors: [{ type: "NOT_FOUND", message: "Could not resolve to an Issue" }],
          }),
      }),
    });
    await expect(
      client.listIssueBlocking("exadev", "graphle", 9999, undefined, new AbortController().signal),
    ).rejects.toMatchObject({ kind: { type: "notFound" } });
  });
});

describe("createGitHubClient - errors", () => {
  it("classifies a 401 as unauthorised", async () => {
    const client = createGitHubClient({
      token: "bad",
      fetch: stubFetch({
        Viewer: () => jsonResponse({ message: "Bad credentials" }, 401),
      }),
    });
    await expect(client.viewer(new AbortController().signal)).rejects.toMatchObject({
      kind: { type: "unauthorised" },
    });
  });

  it("classifies a RATE_LIMITED GraphQL error as rateLimited with resetAt", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        ViewerOrgs: () =>
          jsonResponse({
            data: { viewer: { login: "joe", organizations: null }, rateLimit: RATE },
            errors: [{ type: "RATE_LIMITED", message: "too many" }],
          }),
      }),
    });
    await expect(
      client.listViewerOrgs(undefined, new AbortController().signal),
    ).rejects.toMatchObject({
      kind: { type: "rateLimited", resetAt: RATE.resetAt },
    });
  });

  it("classifies a malformed body as invalidResponse", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        Viewer: () => jsonResponse({ data: { viewer: {} }, rateLimit: RATE }),
      }),
    });
    const promise = client.viewer(new AbortController().signal);
    await expect(promise).rejects.toBeInstanceOf(GitHubError);
    await expect(promise).rejects.toMatchObject({
      kind: { type: "invalidResponse" },
    });
  });

  it("rejects when called with an already-aborted signal", async () => {
    const client = createGitHubClient({
      token: "t",
      fetch: stubFetch({
        Viewer: () => jsonResponse({ data: { viewer: { login: "joe" }, rateLimit: RATE } }),
      }),
    });
    const controller = new AbortController();
    controller.abort();
    await expect(client.viewer(controller.signal)).rejects.toBeInstanceOf(GitHubError);
  });
});
