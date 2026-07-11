/**
 * Recognises a GitHub Projects (v2) URL — `github.com/orgs/{login}/projects/{number}`
 * for an org-owned project, `github.com/users/{login}/projects/{number}` for a
 * user-owned one — so a `#url=`/"Load from URL" target can be routed to the
 * authenticated GraphQL loader (`./project-loader`) instead of the generic
 * unauthenticated `sharing/remote` fetch, which would fail: a project page is
 * HTML, not JSON, and not CORS-enabled for arbitrary origins.
 *
 * A trailing `/views/{N}` segment is recognised only far enough to confirm
 * the URL names a project, then discarded — a project view (its layout,
 * grouping, columns) has no GraphQL equivalent to load against. A
 * `?filterQuery=`/`?query=` string is handled separately by
 * {@link parseProjectFilterQuery}: unlike GitHub's own project-view filter
 * language (which can filter on arbitrary custom fields this codec doesn't
 * even fetch), graphle's interpretation of it is a plain substring match
 * against item titles, applied client-side after fetching every item — the
 * param name is kept for continuity with a pasted GitHub URL, not because
 * graphle implements the same filter language.
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
 * The canonical URL for a parsed project — the page URL stripped of any
 * `/views/{N}` selection this codec doesn't track, with `searchText`
 * (graphle's own title-substring filter, see the module doc) re-attached as
 * `?filterQuery=` when non-empty. Used to normalise the address bar after a
 * successful load, so a reload or re-share points at exactly the project and
 * filter this codec actually loaded.
 */
export function canonicalProjectUrl(parsed: ParsedProjectUrl, searchText: string): string {
  const base = `https://github.com/${parsed.ownerType}s/${parsed.login}/projects/${String(parsed.number)}`;
  return searchText === "" ? base : `${base}?filterQuery=${encodeURIComponent(searchText)}`;
}

/**
 * Extracts the raw `?filterQuery=`/`?query=` value from a project URL
 * verbatim, or `""` when neither is present — see the module doc for why
 * this is passed through as-is rather than interpreted as GitHub's own
 * project-view filter language.
 */
export function parseProjectFilterQuery(url: string): string {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return "";
  const params = new URLSearchParams(url.slice(queryIndex));
  return params.get("filterQuery") ?? params.get("query") ?? "";
}
