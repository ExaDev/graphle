/**
 * Recognises a GitHub Projects (v2) URL — `github.com/orgs/{login}/projects/{number}`
 * for an org-owned project, `github.com/users/{login}/projects/{number}` for a
 * user-owned one — so a `#url=`/"Load from URL" target can be routed to the
 * authenticated GraphQL loader (`./project-loader`) instead of the generic
 * unauthenticated `sharing/remote` fetch, which would fail: a project page is
 * HTML, not JSON, and not CORS-enabled for arbitrary origins.
 *
 * A trailing `/views/{N}` segment and a `?query=...` filter/sort string (the
 * saved view GitHub's own UI shows) are recognised only far enough to confirm
 * the URL names a project, then discarded — the loader always fetches the
 * full, unfiltered item set. Translating GitHub's view filter/sort DSL into
 * the GraphQL API is out of scope; there is no support for it anywhere in
 * this codebase.
 */

/** The owner-type segment a project URL carries, and the GraphQL root field
 *  it selects (`organization` vs `user`). */
export type ProjectOwnerType = "org" | "user";

export interface ParsedProjectUrl {
  ownerType: ProjectOwnerType;
  login: string;
  number: number;
}

const PROJECT_URL_PATTERN =
  /^https:\/\/github\.com\/(orgs|users)\/([^/]+)\/projects\/(\d+)(?:\/|$|\?)/;

/**
 * Parse a GitHub Projects v2 URL, ignoring any `/views/{N}` segment or
 * `?query=` string. Returns `undefined` for anything else, including a
 * malformed project URL (a non-numeric project id, a missing owner segment).
 */
export function parseProjectUrl(url: string): ParsedProjectUrl | undefined {
  const match = PROJECT_URL_PATTERN.exec(url);
  if (match === null) return undefined;
  const [, ownerSegment, login, numberSegment] = match;
  if (ownerSegment === undefined || login === undefined || numberSegment === undefined) {
    return undefined;
  }
  const number = Number.parseInt(numberSegment, 10);
  if (!Number.isInteger(number)) return undefined;
  return {
    ownerType: ownerSegment === "orgs" ? "org" : "user",
    login,
    number,
  };
}

/**
 * The canonical URL for a parsed project — the page URL stripped of any view
 * or query string. Used to normalise the address bar after a successful load
 * (mirroring how a resolved gist file's raw URL replaces the ambiguous gist
 * URL the user pasted), so a reload or a re-share points at exactly the
 * project, not at a view selection this codec doesn't track.
 */
export function canonicalProjectUrl(parsed: ParsedProjectUrl): string {
  return `https://github.com/${parsed.ownerType}s/${parsed.login}/projects/${String(parsed.number)}`;
}
