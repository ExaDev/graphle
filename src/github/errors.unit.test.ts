import { describe, expect, it } from "vitest";

import { classifyByStatus, GitHubError } from "./errors";

describe("classifyByStatus", () => {
  it("maps HTTP 401 to unauthorised regardless of body", () => {
    expect(classifyByStatus(401, {}, undefined)).toEqual({ type: "unauthorised" });
  });

  it("maps HTTP 404 to notFound", () => {
    expect(classifyByStatus(404, {}, undefined)).toEqual({ type: "notFound" });
  });

  it("maps HTTP 429 to rateLimited, reading resetAt from the body", () => {
    const body = { data: { rateLimit: { resetAt: "2026-01-01T00:00:00Z" } } };
    expect(classifyByStatus(429, body, undefined)).toEqual({
      type: "rateLimited",
      resetAt: "2026-01-01T00:00:00Z",
    });
  });

  it("maps a RATE_LIMITED GraphQL error to rateLimited even on HTTP 200", () => {
    const errors = [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }];
    expect(classifyByStatus(200, {}, errors)).toEqual({
      type: "rateLimited",
      resetAt: undefined,
    });
  });

  it("maps a NOT_FOUND GraphQL error to notFound on HTTP 200 — GitHub never uses HTTP 404 for this", () => {
    // Confirmed empirically against the real API: an unresolvable
    // organization(login:) or projectV2(number:) comes back exactly like this.
    const errors = [
      {
        type: "NOT_FOUND",
        path: ["organization"],
        message: "Could not resolve to an Organization with the login of 'nope'.",
      },
    ];
    expect(classifyByStatus(200, { data: { organization: null } }, errors)).toEqual({
      type: "notFound",
    });
  });

  it("maps any other GraphQL error to forbidden with its message", () => {
    const errors = [{ type: "FORBIDDEN", message: "Resource protected by organization SAML" }];
    expect(classifyByStatus(200, {}, errors)).toEqual({
      type: "forbidden",
      message: "Resource protected by organization SAML",
    });
  });

  it("maps HTTP 403 with no GraphQL errors to forbidden with the first-message fallback", () => {
    expect(classifyByStatus(403, {}, undefined)).toEqual({
      type: "forbidden",
      message: "no error detail available",
    });
  });

  it("maps an otherwise-unclassified status to forbidden naming the status", () => {
    expect(classifyByStatus(500, {}, undefined)).toEqual({
      type: "forbidden",
      message: "unexpected HTTP status 500",
    });
  });
});

describe("GitHubError", () => {
  it("derives a human-readable message from the kind", () => {
    expect(new GitHubError({ type: "notFound" }).message).toBe("GitHub resource not found.");
    expect(new GitHubError({ type: "unauthorised" }).message).toContain("unauthorised");
    expect(new GitHubError({ type: "rateLimited", resetAt: "2026-01-01T00:00:00Z" }).message).toContain(
      "2026-01-01T00:00:00Z",
    );
  });

  it("sets name to GitHubError and carries the kind", () => {
    const error = new GitHubError({ type: "forbidden", message: "nope" });
    expect(error.name).toBe("GitHubError");
    expect(error.kind).toEqual({ type: "forbidden", message: "nope" });
  });
});
