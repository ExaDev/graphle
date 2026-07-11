/**
 * Recognises a GitHub repo issues or pull-requests list URL —
 * `github.com/{owner}/{repo}/issues` or `github.com/{owner}/{repo}/pulls` —
 * so a `#url=`/"Load from URL" target naming one of these list pages can be
 * routed to a repo-scoped loader instead of the generic unauthenticated
 * `sharing/remote` fetch, which would fail: the list page is HTML, not JSON,
 * and not CORS-enabled for arbitrary origins.
 *
 * A trailing `?q=...` string (the search/sort/filter DSL GitHub's own list
 * UI shows, e.g. `?q=is%3Aopen+label%3Abug`) is recognised only far enough to
 * confirm the URL names a list page, then discarded entirely and never
 * parsed — both parsers always resolve to the full open set for this repo,
 * mirroring the Projects URL parser's own precedent of ignoring its
 * `/views/{N}` and query suffix (`./project-url`). Translating GitHub's
 * search DSL into the GraphQL API is out of scope; there is no support for it
 * anywhere in this codebase.
 *
 * A single-issue or single-PR page (`.../issues/42`, `.../pulls/7`) is a
 * different resource entirely — not a list — and is deliberately out of
 * scope here.
 */

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
 * Parse a GitHub repo issues list URL, ignoring any `?q=` search string.
 * Returns `undefined` for anything else, including a single-issue page
 * (`.../issues/42`), a gist URL, a Projects URL, or a repo file (blob) URL.
 */
export function parseRepoIssuesUrl(url: string): ParsedRepoListUrl | undefined {
  return parseRepoListUrl(REPO_ISSUES_URL_PATTERN, url);
}

/**
 * Parse a GitHub repo pull-requests list URL, ignoring any `?q=` search
 * string. Returns `undefined` for anything else, including a single-PR page
 * (`.../pulls/7`), a gist URL, a Projects URL, or a repo file (blob) URL.
 */
export function parseRepoPullRequestsUrl(url: string): ParsedRepoListUrl | undefined {
  return parseRepoListUrl(REPO_PULL_REQUESTS_URL_PATTERN, url);
}

/**
 * The canonical URL for a parsed repo issues list — the list page URL
 * stripped of any search/sort/filter query string, so a reload or a
 * re-share points at the full open set this codec actually loads, not at a
 * filter selection this codec doesn't track.
 */
export function canonicalRepoIssuesUrl(parsed: ParsedRepoListUrl): string {
  return `https://github.com/${parsed.owner}/${parsed.repo}/issues`;
}

/**
 * The canonical URL for a parsed repo pull-requests list — mirrors
 * {@link canonicalRepoIssuesUrl} for `.../pulls`.
 */
export function canonicalRepoPullRequestsUrl(parsed: ParsedRepoListUrl): string {
  return `https://github.com/${parsed.owner}/${parsed.repo}/pulls`;
}
