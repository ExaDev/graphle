/**
 * Recognises a GitHub repo issues or pull-requests list URL —
 * `github.com/{owner}/{repo}/issues` or `github.com/{owner}/{repo}/pulls` —
 * so a `#url=`/"Load from URL" target naming one of these list pages can be
 * routed to a repo-scoped loader instead of the generic unauthenticated
 * `sharing/remote` fetch, which would fail: the list page is HTML, not JSON,
 * and not CORS-enabled for arbitrary origins.
 *
 * A single-issue or single-PR page (`.../issues/42`, `.../pulls/7`) is a
 * different resource entirely — not a list — and is deliberately out of
 * scope here.
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
 * Parse a GitHub repo pull-requests list URL. Returns `undefined` for
 * anything else, including a single-PR page (`.../pulls/7`), a gist URL, a
 * Projects URL, or a repo file (blob) URL.
 */
export function parseRepoPullRequestsUrl(url: string): ParsedRepoListUrl | undefined {
  return parseRepoListUrl(REPO_PULL_REQUESTS_URL_PATTERN, url);
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
 * {@link canonicalRepoIssuesUrl} for `.../pulls`.
 */
export function canonicalRepoPullRequestsUrl(
  parsed: ParsedRepoListUrl,
  filters: RepoPullRequestsFilters,
): string {
  return `https://github.com/${parsed.owner}/${parsed.repo}/pulls${encodeFiltersQuery(filters)}`;
}

/** Builds the `?state=...&sort=...&direction=...&labels=...` query string
 *  for {@link canonicalRepoIssuesUrl}/{@link canonicalRepoPullRequestsUrl}.
 *  Each field is omitted when it matches the shared default (`["open"]`,
 *  `updated`/`desc`, no labels — see `DEFAULT_REPO_ISSUES_FILTERS`/
 *  `DEFAULT_REPO_PULL_REQUESTS_FILTERS`), so the common case round-trips to
 *  the bare URL with no query string at all. */
function encodeFiltersQuery(filters: RepoIssuesFilters | RepoPullRequestsFilters): string {
  const params = new URLSearchParams();
  const isDefaultState = filters.states.length === 1 && filters.states[0] === "open";
  if (!isDefaultState) params.set("state", filters.states.join(","));
  const isDefaultSort = filters.sort.field === "updated" && filters.sort.direction === "desc";
  if (!isDefaultSort) {
    params.set("sort", filters.sort.field);
    params.set("direction", filters.sort.direction);
  }
  if (filters.labels.length > 0) params.set("labels", filters.labels.join(","));
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
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
 * only `is:`/`state:`, `sort:`, and `label:` are recognised; anything else
 * (assignee, author, milestone, free text, date ranges) is silently
 * dropped, not preserved, since the canonical URL this codec writes is
 * always a fresh encoding of exactly what the filter UI shows, never a
 * mix of understood and not-understood fragments.
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

/** Best-effort parse of GitHub's `q=` search DSL into the tokens this codec
 *  understands. Unrecognised tokens are ignored. */
function parseSearchQueryTokens(q: string): SearchQueryTokens {
  const tokens: SearchQueryTokens = { states: [], sortField: undefined, sortDirection: undefined, labels: [] };
  for (const token of tokenizeSearchQuery(q)) {
    const colonIndex = token.indexOf(":");
    if (colonIndex === -1) continue;
    const key = token.slice(0, colonIndex);
    const rawValue = token.slice(colonIndex + 1);
    const value = rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue;
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

/** {@link parseRepoListFilters} instantiated for repo pull requests. */
export function parseRepoPullRequestsFilters(
  url: string,
  defaults: RepoPullRequestsFilters,
): RepoPullRequestsFilters {
  return parseRepoListFilters(url, defaults, isPullRequestState, isPullRequestSortField);
}
