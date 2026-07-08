import type { Options } from "semantic-release";

/**
 * Runs on `main`. Creates a versioned tag and a GitHub Release with generated
 * notes. The changelog and package.json are committed back to main via the git
 * plugin. The release commit's default [skip ci] message avoids redundant CI runs.
 */
const config: Options = {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    ["@semantic-release/npm", { npmPublish: false }],
    "@semantic-release/git",
    "@semantic-release/github",
  ],
};

export default config;
