import type { RemoteLoadErrorKind } from "./remote";

/**
 * Classify a non-2xx GitHub REST API status into a {@link RemoteLoadErrorKind}.
 * This is REST, not GraphQL — there is no `errors` array to inspect, unlike
 * {@link classifyByStatus} in `src/github/errors.ts`, which assumes a
 * GraphQL error shape REST responses don't have, so that classifier is not
 * reused here. Any status without a more specific kind falls back to the
 * generic `httpError` kind, carrying the status for the caller to report
 * verbatim.
 */
export function classifyGithubRestStatus(status: number): RemoteLoadErrorKind {
  if (status === 401) return { type: "unauthorised" };
  if (status === 403) return { type: "forbidden" };
  if (status === 404) return { type: "notFound" };
  return { type: "httpError", status };
}
