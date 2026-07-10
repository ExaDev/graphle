import { describe, expect, it } from "vitest";

import { classifyGithubRestStatus } from "./github-rest-errors";

describe("classifyGithubRestStatus", () => {
  it("maps 401 to unauthorised", () => {
    expect(classifyGithubRestStatus(401)).toEqual({ type: "unauthorised" });
  });

  it("maps 403 to forbidden", () => {
    expect(classifyGithubRestStatus(403)).toEqual({ type: "forbidden" });
  });

  it("maps 404 to notFound", () => {
    expect(classifyGithubRestStatus(404)).toEqual({ type: "notFound" });
  });

  it("maps any other status to a generic httpError carrying the status", () => {
    expect(classifyGithubRestStatus(500)).toEqual({ type: "httpError", status: 500 });
    expect(classifyGithubRestStatus(422)).toEqual({ type: "httpError", status: 422 });
  });
});
