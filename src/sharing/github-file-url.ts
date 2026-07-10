/**
 * Recognises a GitHub repo file URL naming one specific file in one specific
 * repo at one specific branch — the human-facing
 * `github.com/{owner}/{repo}/blob/{branch}/{path}` file-view page, or the raw
 * content host `raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}`
 * (also accepting the `.../refs/heads/{branch}/{path}` form GitHub's own UI
 * currently generates for a raw link, with the `refs/heads/` prefix stripped
 * so the parsed branch is just the branch name) — so either shape can be
 * recognised and normalised to the same canonical form regardless of which
 * one a user pasted.
 */

export interface ParsedGithubFileUrl {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

const GITHUB_BLOB_PATTERN =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/;

const RAW_GITHUBUSERCONTENT_PATTERN =
  /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.+)$/;

/** Strip a query string or fragment, so only the path portion of `url` is matched. */
function stripQueryAndFragment(url: string): string {
  const queryIndex = url.indexOf("?");
  const fragmentIndex = url.indexOf("#");
  const cutIndex = [queryIndex, fragmentIndex]
    .filter((index) => index !== -1)
    .reduce((min, index) => (index < min ? index : min), url.length);
  return url.slice(0, cutIndex);
}

/**
 * Parse a GitHub repo file URL (a `blob` page or a raw-host URL). Returns
 * `undefined` for anything else, including a GitHub URL that isn't a file
 * view (a gist, a Projects board, an issues/PR page).
 *
 * KNOWN, DELIBERATE LIMITATION: a branch name containing a literal `/` is
 * genuinely ambiguous against the path in these URL shapes without an extra
 * API call GitHub's own UI makes to resolve it. This parser assumes the
 * first path segment after `blob/` (or after `{repo}/`, for the raw host,
 * minus any `refs/heads/` prefix) is the WHOLE branch name, and everything
 * after that is the file path — so a branch like `feature/foo` misparses as
 * branch `feature` with path `foo/rest/of/path`. This is not disambiguated;
 * only the simple case is handled.
 */
export function parseGithubFileUrl(url: string): ParsedGithubFileUrl | undefined {
  const stripped = stripQueryAndFragment(url);

  const blobMatch = GITHUB_BLOB_PATTERN.exec(stripped);
  if (blobMatch !== null) {
    const [, owner, repo, branch, path] = blobMatch;
    if (owner === undefined || repo === undefined || branch === undefined || path === undefined) {
      return undefined;
    }
    return { owner, repo, branch, path };
  }

  const rawMatch = RAW_GITHUBUSERCONTENT_PATTERN.exec(stripped);
  if (rawMatch !== null) {
    const [, owner, repo, branch, path] = rawMatch;
    if (owner === undefined || repo === undefined || branch === undefined || path === undefined) {
      return undefined;
    }
    return { owner, repo, branch, path };
  }

  return undefined;
}

/**
 * The canonical URL for a parsed file — the `github.com/.../blob/...`
 * human-facing form, regardless of which of the two recognised shapes was
 * originally parsed.
 */
export function canonicalGithubFileUrl(parsed: ParsedGithubFileUrl): string {
  return `https://github.com/${parsed.owner}/${parsed.repo}/blob/${parsed.branch}/${parsed.path}`;
}
