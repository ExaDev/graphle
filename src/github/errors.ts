/**
 * Error classification for the GitHub GraphQL client. Every failure mode the
 * client can encounter — auth, rate limiting, network, malformed payload — is
 * modelled as a {@link GitHubErrorKind} discriminator so callers can branch on
 * the specific failure rather than parsing a free-form message string.
 */

/** The discriminated set of failures a {@link GitHubError} can represent. */
export type GitHubErrorKind =
  | { type: "unauthorised" }
  | { type: "rateLimited"; resetAt: string | undefined }
  | { type: "forbidden"; message: string }
  | { type: "notFound" }
  | { type: "network"; cause: unknown }
  | { type: "invalidResponse"; message: string };

/**
 * Single error type thrown by the GitHub client. The {@link kind} discriminator
 * carries the structured detail callers branch on; the `message` is derived
 * from the kind and exists only for logging and debugging.
 */
export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;

  constructor(kind: GitHubErrorKind) {
    super(messageForKind(kind));
    this.name = "GitHubError";
    this.kind = kind;
  }
}

function messageForKind(kind: GitHubErrorKind): string {
  switch (kind.type) {
    case "unauthorised":
      return "GitHub request was unauthorised (HTTP 401).";
    case "rateLimited":
      return kind.resetAt === undefined
        ? "GitHub rate limit exceeded."
        : `GitHub rate limit exceeded; resets at ${kind.resetAt}.`;
    case "forbidden":
      return `GitHub request forbidden: ${kind.message}`;
    case "notFound":
      return "GitHub resource not found.";
    case "network":
      return "GitHub request failed due to a network error.";
    case "invalidResponse":
      return `GitHub response was malformed: ${kind.message}`;
  }
}

/**
 * Short, actionable UI guidance for a {@link GitHubError}, distinct from
 * {@link GitHubError.message} (which exists only for logging/debugging —
 * see the class docblock). Shared by every call site that surfaces a GitHub
 * failure to the user (the GitHub panel, the expand menu, a URL-triggered
 * project load) so the guidance — "check your PAT scopes," the rate-limit
 * reset time — stays consistent and isn't hand-duplicated per caller.
 */
export function githubErrorMessage(error: GitHubError): string {
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

/** True when `value` is an object carrying a `type` string property. */
function isTypedError(value: unknown): value is { type: unknown } {
  if (typeof value !== "object" || value === null) return false;
  return "type" in value;
}

/** True when `value` is an object carrying a `message` property of any kind. */
function hasMessage(value: unknown): value is { message: unknown } {
  if (typeof value !== "object" || value === null) return false;
  return "message" in value;
}

/**
 * Narrows an `unknown` to `unknown[]`. Wraps `Array.isArray` (which asserts
 * `any[]`) so callers handle typed `unknown` elements rather than tripping the
 * type-checked `no-unsafe-*` lint rules.
 */
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * True if the GraphQL `errors` payload contains an entry whose `type` is
 * `RATE_LIMITED` — GitHub's signal that the query was rejected for exceeding
 * the rate limit rather than for a permissions or correctness reason.
 */
function hasRateLimitedError(graphQLErrors: unknown): boolean {
  if (!isUnknownArray(graphQLErrors)) return false;
  return graphQLErrors.some((entry) => {
    if (!isTypedError(entry)) return false;
    return entry.type === "RATE_LIMITED";
  });
}

/**
 * True if the GraphQL `errors` payload contains an entry whose `type` is
 * `NOT_FOUND` — GitHub's signal that a field resolved to `null` because the
 * thing it names (an org, a user, a project number) doesn't exist or isn't
 * visible to this token, as opposed to some other GraphQL-level failure.
 * Confirmed empirically: an unresolvable `organization(login:)` or
 * `projectV2(number:)` comes back as HTTP 200 with `data.<field>: null` PLUS
 * a `NOT_FOUND` entry here — never as an HTTP 404. Without this check that
 * response falls through to the generic `forbidden` branch below, which is
 * the wrong classification for "this doesn't exist."
 */
function hasNotFoundError(graphQLErrors: unknown): boolean {
  if (!isUnknownArray(graphQLErrors)) return false;
  return graphQLErrors.some((entry) => {
    if (!isTypedError(entry)) return false;
    return entry.type === "NOT_FOUND";
  });
}

/** True if the GraphQL payload carries any `errors` entries at all. */
function hasAnyGraphQLError(graphQLErrors: unknown): boolean {
  return isUnknownArray(graphQLErrors) && graphQLErrors.length > 0;
}

/**
 * Reads `body.data.rateLimit.resetAt` when present. Rate-limit reset times are
 * only meaningful on rate-limited responses; on other shapes this returns
 * `undefined` so the caller can model the absence explicitly.
 */
function extractResetAt(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  if (!("data" in body)) return undefined;
  const data = body.data;
  if (typeof data !== "object" || data === null) return undefined;
  if (!("rateLimit" in data)) return undefined;
  const rateLimit = data.rateLimit;
  if (typeof rateLimit !== "object" || rateLimit === null) return undefined;
  if (!("resetAt" in rateLimit)) return undefined;
  const resetAt = rateLimit.resetAt;
  return typeof resetAt === "string" ? resetAt : undefined;
}

/** Pulls the first GraphQL error's `message` for the forbidden case. */
function extractFirstMessage(graphQLErrors: unknown): string {
  if (!isUnknownArray(graphQLErrors) || graphQLErrors.length === 0) {
    return "no error detail available";
  }
  const first = graphQLErrors[0];
  if (first !== undefined && hasMessage(first) && typeof first.message === "string") {
    return first.message;
  }
  return "no error detail available";
}

/**
 * Maps a non-2xx HTTP status (and any GraphQL `errors` payload) to a
 * {@link GitHubErrorKind}. Precedence:
 *
 * 1. 401 -> `unauthorised`
 * 2. 404 -> `notFound`
 * 3. HTTP 429 or a `RATE_LIMITED` GraphQL error -> `rateLimited` (resetAt from
 *    the body when present)
 * 4. A `NOT_FOUND` GraphQL error -> `notFound` (GitHub reports an unresolvable
 *    org/user/project as HTTP 200 with this error type, never as a 404)
 * 5. HTTP 403 or any other GraphQL error -> `forbidden`
 * 6. Any other non-2xx status -> `forbidden` with the status as the message
 *
 * A bare 403 is therefore `forbidden` (a permissions or scope problem); only a
 * 429 or an explicit `RATE_LIMITED` GraphQL error is treated as rate limiting.
 */
export function classifyByStatus(
  status: number,
  body: unknown,
  graphQLErrors: unknown,
): GitHubErrorKind {
  if (status === 401) return { type: "unauthorised" };
  if (status === 404) return { type: "notFound" };

  if (status === 429 || hasRateLimitedError(graphQLErrors)) {
    return { type: "rateLimited", resetAt: extractResetAt(body) };
  }

  if (hasNotFoundError(graphQLErrors)) {
    return { type: "notFound" };
  }

  if (status === 403 || hasAnyGraphQLError(graphQLErrors)) {
    return { type: "forbidden", message: extractFirstMessage(graphQLErrors) };
  }

  return { type: "forbidden", message: `unexpected HTTP status ${String(status)}` };
}
