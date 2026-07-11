import { describe, expect, it } from "vitest";

import { createGitHubClient } from "./graphql-adapter";
import { GitHubError } from "./errors";

/** Narrows a parsed request body to a `{ query: string }` envelope. */
function hasQueryEnvelope(value: unknown): value is { query: string } {
  if (typeof value !== "object" || value === null) return false;
  if (!("query" in value)) return false;
  return typeof value.query === "string";
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
                nodes: [{ name: "alpha", owner: { login: "exadev" } }],
                pageInfo: { hasNextPage: true, endCursor: "CURSOR1" },
              }
            : {
                nodes: [{ name: "beta", owner: { login: "exadev" } }],
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
                  nodes: [{ number: 1, title: "Add feature", state: "OPEN", url: "pr1" }],
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
      new AbortController().signal,
    );
    expect(pullRequests.items).toHaveLength(1);
    expect(pullRequests.items[0]?.number).toBe(1);
    expect(pullRequests.items[0]?.state).toBe("open");
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
                  nodes: [{ number: 1, title: "First", state: "OPEN", url: "pr1" }],
                  pageInfo: { hasNextPage: true, endCursor: "CURSOR1" },
                }
              : {
                  nodes: [{ number: 2, title: "Second", state: "MERGED", url: "pr2" }],
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
      new AbortController().signal,
    );
    expect(first.items.map((p) => p.number)).toEqual([1]);
    expect(first.endCursor).toBe("CURSOR1");
    expect(first.hasNextPage).toBe(true);

    const second = await client.listRepoPullRequests(
      "exadev",
      "graphle",
      first.endCursor,
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
      client.listRepoPullRequests("exadev", "graphle", undefined, new AbortController().signal),
    ).rejects.toMatchObject({
      kind: { type: "rateLimited", resetAt: RATE.resetAt },
    });
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
