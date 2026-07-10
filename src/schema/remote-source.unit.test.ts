import { describe, expect, it } from "vitest";

import { LinkedRemoteSource } from "./remote-source";

const now = "2024-01-15T10:30:00Z";

describe("LinkedRemoteSource", () => {
  it("accepts a minimal gist source", () => {
    const result = LinkedRemoteSource.safeParse({
      provider: "gist",
      gistId: "abc123",
      filename: "graph.json",
      syncMode: "off",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a gist source with sync bookkeeping", () => {
    const result = LinkedRemoteSource.safeParse({
      provider: "gist",
      gistId: "abc123",
      filename: "graph.json",
      syncMode: "automatic",
      lastSyncedRevision: "deadbeef",
      lastSyncedAt: now,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a minimal githubFile source", () => {
    const result = LinkedRemoteSource.safeParse({
      provider: "githubFile",
      owner: "exadev",
      repo: "graphle",
      branch: "main",
      path: "graphs/demo.json",
      syncMode: "manual",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognised provider", () => {
    const result = LinkedRemoteSource.safeParse({
      provider: "s3",
      syncMode: "off",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a gist source with an invalid syncMode", () => {
    const result = LinkedRemoteSource.safeParse({
      provider: "gist",
      gistId: "abc123",
      filename: "graph.json",
      syncMode: "continuous",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a gist source missing filename", () => {
    const result = LinkedRemoteSource.safeParse({
      provider: "gist",
      gistId: "abc123",
      syncMode: "off",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a githubFile source missing branch", () => {
    const result = LinkedRemoteSource.safeParse({
      provider: "githubFile",
      owner: "exadev",
      repo: "graphle",
      path: "graphs/demo.json",
      syncMode: "off",
    });
    expect(result.success).toBe(false);
  });
});
