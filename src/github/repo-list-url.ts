/**
 * Recognises a GitHub repo issues or pull-requests list URL —
 * `github.com/{owner}/{repo}/issues` or `github.com/{owner}/{repo}/pulls` —
 * so a `#url=`/"Load from URL" target naming one of these list pages can be
 * routed to a repo-scoped loader instead of the generic unauthenticated
 * `sharing/remote` fetch, which would fail: the list page is HTML, not JSON,
 * and not CORS-enabled for arbitrary origins.
 *
 * A single-issue page (`.../issues/42`) is a different resource entirely —
 * not a list — and is deliberately out of scope here. Pull requests have no
 * equivalent exclusion: confirmed live against github.com, `.../pulls/{value}`
 * (any value, including one that looks numeric) and `.../pulls/assigned/{value}`
 * are themselves GitHub's own path-segment shorthand for the PR list filtered
 * by author/assignee, not a single-PR view — the real single-PR route is the
 * singular `.../pull/{number}`, an unrelated path this module still doesn't
 * handle. See {@link parseRepoPullRequestsUrl} and
 * {@link parseRepoPullRequestsFilters}, which both recognise this shorthand.
 * Issues have no matching shorthand handling here: GitHub's equivalent
 * (`.../issues/{value}`, redirecting to `.../issues/created_by/{value}`)
 * would need `RepoIssuesFilters` to grow assignee/author fields backed by
 * `Repository.issues`'s own `filterBy` argument — a different GraphQL
 * mechanism than pull requests' `search` route, and not yet built.
 *
 * Filters (state/sort/labels) are a separate concern from URL-shape
 * recognition, handled by {@link parseRepoIssuesFilters}/
 * {@link parseRepoPullRequestsFilters} below — `parseRepoIssuesUrl`/
 * `parseRepoPullRequestsUrl` themselves only ever return `{owner, repo}`.
 */
import {
  isIssueSortField,
  isIssueState,
  isPullRequestSortField,
  isPullRequestState,
  isSortDirection,
  type RepoIssuesFilters,
  type RepoPullRequestsFilters,
} from "./filters";

export interface ParsedRepoListUrl {
  owner: string;
  repo: string;
}

function buildRepoListUrlPattern(segment: "issues" | "pulls"): RegExp {
  return new RegExp(`^https://github\\.com/([^/]+)/([^/]+)/${segment}/?(\\?.*)?$`);
}

const REPO_ISSUES_URL_PATTERN = buildRepoListUrlPattern("issues");
const REPO_PULL_REQUESTS_URL_PATTERN = buildRepoListUrlPattern("pulls");

/** GitHub's own path-segment shorthand for a repo's PR list filtered by
 *  assignee — `.../pulls/assigned/{value}` — checked ahead of
 *  {@link REPO_PULL_REQUESTS_AUTHOR_PATTERN} only for clarity; the two never
 *  actually overlap; a single `[^/]+` path segment can't itself contain the
 *  `/` that separates `assigned` from its value. */
const REPO_PULL_REQUESTS_ASSIGNED_PATTERN =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pulls\/assigned\/([^/?]+)\/?$/;

/** GitHub's own path-segment shorthand for a repo's PR list filtered by
 *  author — `.../pulls/{value}` — see the module doc comment for why this
 *  applies to any value, including one that looks like a PR number. */
const REPO_PULL_REQUESTS_AUTHOR_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pulls\/([^/?]+)\/?$/;

function parseRepoListUrl(pattern: RegExp, url: string): ParsedRepoListUrl | undefined {
  const match = pattern.exec(url);
  if (match === null) return undefined;
  const [, owner, repo] = match;
  if (owner === undefined || repo === undefined) return undefined;
  return { owner, repo };
}

/**
 * Parse a GitHub repo issues list URL. Returns `undefined` for anything
 * else, including a single-issue page (`.../issues/42`), a gist URL, a
 * Projects URL, or a repo file (blob) URL.
 */
export function parseRepoIssuesUrl(url: string): ParsedRepoListUrl | undefined {
  return parseRepoListUrl(REPO_ISSUES_URL_PATTERN, url);
}

/**
 * Parse a GitHub repo pull-requests list URL — the bare/query form
 * (`.../pulls`, `.../pulls?...`) or either of GitHub's own person-filter
 * path shorthands (`.../pulls/{value}`, `.../pulls/assigned/{value}`, see
 * the module doc comment). Returns `undefined` for anything else, including
 * a gist URL, a Projects URL, or a repo file (blob) URL.
 */
export function parseRepoPullRequestsUrl(url: string): ParsedRepoListUrl | undefined {
  return (
    parseRepoListUrl(REPO_PULL_REQUESTS_URL_PATTERN, url) ??
    parseRepoListUrl(REPO_PULL_REQUESTS_ASSIGNED_PATTERN, url) ??
    parseRepoListUrl(REPO_PULL_REQUESTS_AUTHOR_PATTERN, url)
  );
}

/**
 * Extracts the person-filter value from GitHub's `.../pulls/{value}`
 * (author) or `.../pulls/assigned/{value}` (assignee) path shorthand, if
 * `url` matches either — see the module doc comment. Consumed by
 * {@link parseRepoPullRequestsFilters} alongside its existing query-string
 * sources.
 */
function parsePullRequestsPathShorthand(url: string): { assignee?: string; author?: string } | undefined {
  const assignedMatch = REPO_PULL_REQUESTS_ASSIGNED_PATTERN.exec(url);
  const assignee = assignedMatch?.[3];
  if (assignee !== undefined) return { assignee };

  const authorMatch = REPO_PULL_REQUESTS_AUTHOR_PATTERN.exec(url);
  const author = authorMatch?.[3];
  if (author !== undefined) return { author };

  return undefined;
}

/**
 * The canonical URL for a parsed repo issues list, re-encoding `filters`
 * with graphle's own query params (`state=`, `sort=`, `direction=`,
 * `labels=`) — never GitHub's `q=` search DSL, so every subsequent parse of
 * a URL this codec wrote takes the exact, unambiguous "own scheme" path in
 * {@link parseRepoIssuesFilters} rather than the best-effort `q=` tokenizer.
 * Omits the query string entirely when `filters` equals
 * `DEFAULT_REPO_ISSUES_FILTERS`, keeping the bare URL for the common case.
 */
export function canonicalRepoIssuesUrl(parsed: ParsedRepoListUrl, filters: RepoIssuesFilters): string {
  return `https://github.com/${parsed.owner}/${parsed.repo}/issues${encodeFiltersQuery(filters)}`;
}

/**
 * The canonical URL for a parsed repo pull-requests list — mirrors
 * {@link canonicalRepoIssuesUrl} for `.../pulls`, plus `assignee=`/
 * `author=`/`involves=` params when set (PR-only — see
 * {@link RepoPullRequestsFilters}'s doc comment for why these have no
 * `RepoIssuesFilters` equivalent).
 */
export function canonicalRepoPullRequestsUrl(
  parsed: ParsedRepoListUrl,
  filters: RepoPullRequestsFilters,
): string {
  const params = buildFiltersParams(filters);
  if (filters.assignee !== undefined) params.set("assignee", filters.assignee);
  if (filters.author !== undefined) params.set("author", filters.author);
  if (filters.involves !== undefined) params.set("involves", filters.involves);
  return `https://github.com/${parsed.owner}/${parsed.repo}/pulls${toQueryString(params)}`;
}

/** Builds the `state=...&sort=...&direction=...&labels=...` params shared by
 *  {@link canonicalRepoIssuesUrl}/{@link canonicalRepoPullRequestsUrl}. Each
 *  field is omitted when it matches the shared default (`["open"]`,
 *  `updated`/`desc`, no labels — see `DEFAULT_REPO_ISSUES_FILTERS`/
 *  `DEFAULT_REPO_PULL_REQUESTS_FILTERS`), so the common case round-trips to
 *  the bare URL with no query string at all. Returns the mutable
 *  `URLSearchParams` itself (rather than a finished string) so
 *  {@link canonicalRepoPullRequestsUrl} can layer its extra PR-only params
 *  on before stringifying. */
function buildFiltersParams(filters: RepoIssuesFilters | RepoPullRequestsFilters): URLSearchParams {
  const params = new URLSearchParams();
  const isDefaultState = filters.states.length === 1 && filters.states[0] === "open";
  if (!isDefaultState) params.set("state", filters.states.join(","));
  const isDefaultSort = filters.sort.field === "updated" && filters.sort.direction === "desc";
  if (!isDefaultSort) {
    params.set("sort", filters.sort.field);
    params.set("direction", filters.sort.direction);
  }
  if (filters.labels.length > 0) params.set("labels", filters.labels.join(","));
  return params;
}

/** `?a=b&c=d` when `params` has entries, `""` when empty — the shared tail
 *  format for every canonical list URL in this module. */
function toQueryString(params: URLSearchParams): string {
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

/** {@link buildFiltersParams} stringified directly — the issues case, which
 *  has no extra params to layer on top. */
function encodeFiltersQuery(filters: RepoIssuesFilters): string {
  return toQueryString(buildFiltersParams(filters));
}

/** Splits a comma-separated query param into its non-empty parts. */
function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * One recognised token from GitHub's own issue/PR search DSL (the `?q=`
 * string its list UI shows, e.g. `is:open sort:updated-desc label:bug`) —
 * only `is:`/`state:`, `sort:`, and `label:` are recognised here; milestone,
 * free text, and date ranges are silently dropped, not preserved, since the
 * canonical URL this codec writes is always a fresh encoding of exactly
 * what the filter UI shows, never a mix of understood and not-understood
 * fragments. `assignee:`/`author:`/`involves:` are recognised too, but by
 * the separate {@link parsePersonSearchTokens} below (PR-only — see its own
 * doc comment for why), not by this struct/function.
 */
interface SearchQueryTokens {
  states: string[];
  sortField: string | undefined;
  sortDirection: string | undefined;
  labels: string[];
}

/** Tokenizes a GitHub search-DSL string, respecting `label:"quoted value"`
 *  as one token. */
function tokenizeSearchQuery(q: string): string[] {
  const matches = q.match(/\S+:"[^"]*"|\S+/g);
  return matches ?? [];
}

/** Splits one `key:value` or `key:"quoted value"` search-DSL token into its
 *  key and unquoted value, shared by {@link parseSearchQueryTokens} and
 *  {@link parsePersonSearchTokens}. Returns `undefined` for a token with no
 *  `:` (defensive against `tokenizeSearchQuery` ever yielding one — it
 *  currently never does, since its regex requires a `:`, but this keeps the
 *  two callers from needing to re-derive the same quote-stripping logic). */
function parseSearchToken(token: string): { key: string; value: string } | undefined {
  const colonIndex = token.indexOf(":");
  if (colonIndex === -1) return undefined;
  const key = token.slice(0, colonIndex);
  const rawValue = token.slice(colonIndex + 1);
  const value = rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue;
  return { key, value };
}

/** Best-effort parse of GitHub's `q=` search DSL into the tokens this codec
 *  understands. Unrecognised tokens are ignored. */
function parseSearchQueryTokens(q: string): SearchQueryTokens {
  const tokens: SearchQueryTokens = { states: [], sortField: undefined, sortDirection: undefined, labels: [] };
  for (const token of tokenizeSearchQuery(q)) {
    const parsed = parseSearchToken(token);
    if (parsed === undefined) continue;
    const { key, value } = parsed;
    if (key === "is" || key === "state") {
      tokens.states.push(value);
    } else if (key === "sort") {
      const dashIndex = value.lastIndexOf("-");
      if (dashIndex === -1) continue;
      tokens.sortField = value.slice(0, dashIndex);
      tokens.sortDirection = value.slice(dashIndex + 1);
    } else if (key === "label") {
      tokens.labels.push(value);
    }
  }
  return tokens;
}

/**
 * Best-effort parse of the `assignee:`/`author:`/`involves:` tokens from
 * GitHub's `q=` search DSL — kept separate from {@link parseSearchQueryTokens}
 * (which stays scoped to `is:`/`state:`, `sort:`, `label:`, shared by both
 * issues and pull requests) since these three qualifiers are only ever
 * consumed for pull requests today: GitHub's `Repository.pullRequests`
 * connection has no assignee/author argument at all, so
 * `repo-list-loader.ts` routes a PR-list load through the separate `search`
 * API whenever one of these is set. Repo-issues loading still uses the
 * plain `Repository.issues` connection unconditionally, so these tokens
 * would have nowhere to go if parsed there — `RepoIssuesFilters` has no
 * matching fields (see its doc comment in `filters.ts`). Last value wins
 * when a qualifier appears more than once, matching how `sort:` already
 * behaves in {@link parseSearchQueryTokens}.
 */
function parsePersonSearchTokens(q: string): {
  assignee: string | undefined;
  author: string | undefined;
  involves: string | undefined;
} {
  let assignee: string | undefined;
  let author: string | undefined;
  let involves: string | undefined;
  for (const token of tokenizeSearchQuery(q)) {
    const parsed = parseSearchToken(token);
    if (parsed === undefined) continue;
    if (parsed.key === "assignee") assignee = parsed.value;
    else if (parsed.key === "author") author = parsed.value;
    else if (parsed.key === "involves") involves = parsed.value;
  }
  return { assignee, author, involves };
}

/**
 * Resolves `defaults`' filters against `url`'s query string: graphle's own
 * `state=`/`sort=`/`direction=`/`labels=` params if present (an exact
 * round-trip of a URL this codec wrote), else a best-effort translation of
 * GitHub's `q=` search DSL if present, else `defaults` unchanged. Shared
 * implementation for {@link parseRepoIssuesFilters}/
 * {@link parseRepoPullRequestsFilters}, which supply the state/sort-field
 * type guards for their respective entity type.
 */
function parseRepoListFilters<F extends RepoIssuesFilters | RepoPullRequestsFilters>(
  url: string,
  defaults: F,
  isState: (value: string) => value is F["states"][number],
  isSortField: (value: string) => value is F["sort"]["field"],
): F {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return defaults;
  const params = new URLSearchParams(url.slice(queryIndex));

  const ownScheme = params.has("state") || params.has("sort") || params.has("direction") || params.has("labels");
  if (ownScheme) {
    const stateParam = params.get("state");
    const parsedStates = stateParam === null ? [] : splitCommaList(stateParam).filter(isState);
    const sortFieldParam = params.get("sort");
    const sortField =
      sortFieldParam !== null && isSortField(sortFieldParam) ? sortFieldParam : defaults.sort.field;
    const directionParam = params.get("direction");
    const sortDirection =
      directionParam !== null && isSortDirection(directionParam) ? directionParam : defaults.sort.direction;
    const labelsParam = params.get("labels");
    const labels = labelsParam === null ? defaults.labels : splitCommaList(labelsParam);
    return {
      ...defaults,
      states: parsedStates.length === 0 ? defaults.states : parsedStates,
      sort: { field: sortField, direction: sortDirection },
      labels,
    };
  }

  const q = params.get("q");
  if (q === null) return defaults;
  const tokens = parseSearchQueryTokens(q);
  const states = tokens.states.filter(isState);
  const sortField = tokens.sortField !== undefined && isSortField(tokens.sortField) ? tokens.sortField : undefined;
  const sortDirection =
    tokens.sortDirection !== undefined && isSortDirection(tokens.sortDirection) ? tokens.sortDirection : undefined;
  return {
    ...defaults,
    states: states.length === 0 ? defaults.states : states,
    sort: {
      field: sortField ?? defaults.sort.field,
      direction: sortDirection ?? defaults.sort.direction,
    },
    labels: tokens.labels.length === 0 ? defaults.labels : tokens.labels,
  };
}

/** {@link parseRepoListFilters} instantiated for repo issues. */
export function parseRepoIssuesFilters(url: string, defaults: RepoIssuesFilters): RepoIssuesFilters {
  return parseRepoListFilters(url, defaults, isIssueState, isIssueSortField);
}

/**
 * {@link parseRepoListFilters} instantiated for repo pull requests, then
 * layered with `assignee`/`author`/`involves` — parsed independently of the
 * shared `state`/`sort`/`labels` machinery above since `RepoIssuesFilters`
 * has no equivalent fields for {@link parseRepoListFilters} to populate
 * generically (see {@link RepoPullRequestsFilters}'s doc comment).
 *
 * Three sources feed `assignee`/`author`, in ascending priority: `defaults`,
 * then GitHub's own `.../pulls/{value}`/`.../pulls/assigned/{value}` path
 * shorthand ({@link parsePullRequestsPathShorthand}), then own-scheme
 * `assignee=`/`author=`/`involves=` query params or a `q=` GitHub search-DSL
 * token (mutually exclusive with each other, and — by construction, since
 * GitHub itself never emits both at once — with the path shorthand too, but
 * checked in this order regardless so an explicit query param would still
 * win over a path segment if a caller ever combined them).
 */
export function parseRepoPullRequestsFilters(
  url: string,
  defaults: RepoPullRequestsFilters,
): RepoPullRequestsFilters {
  const base = parseRepoListFilters(url, defaults, isPullRequestState, isPullRequestSortField);
  const pathPerson = parsePullRequestsPathShorthand(url);
  const pathApplied =
    pathPerson === undefined
      ? base
      : withPersonFields(base, pathPerson.assignee, pathPerson.author, undefined);

  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return pathApplied;
  const params = new URLSearchParams(url.slice(queryIndex));

  const hasOwnPersonParams = params.has("assignee") || params.has("author") || params.has("involves");
  if (hasOwnPersonParams) {
    return withPersonFields(
      pathApplied,
      params.get("assignee") ?? pathApplied.assignee,
      params.get("author") ?? pathApplied.author,
      params.get("involves") ?? pathApplied.involves,
    );
  }

  const q = params.get("q");
  if (q === null) return pathApplied;
  const personTokens = parsePersonSearchTokens(q);
  return withPersonFields(
    pathApplied,
    personTokens.assignee ?? pathApplied.assignee,
    personTokens.author ?? pathApplied.author,
    personTokens.involves ?? pathApplied.involves,
  );
}

/** Spreads `assignee`/`author`/`involves` onto `base` only when each is
 *  actually present — never assigning an explicit `undefined` to an
 *  optional property, which `exactOptionalPropertyTypes` forbids in an
 *  object literal (the same "conditionally spread, never set to undefined"
 *  idiom `materialise.ts` already establishes for optional node-data
 *  fields). */
function withPersonFields(
  base: RepoPullRequestsFilters,
  assignee: string | undefined,
  author: string | undefined,
  involves: string | undefined,
): RepoPullRequestsFilters {
  return {
    ...base,
    ...(assignee !== undefined ? { assignee } : {}),
    ...(author !== undefined ? { author } : {}),
    ...(involves !== undefined ? { involves } : {}),
  };
}
