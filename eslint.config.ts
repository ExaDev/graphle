import js from "@eslint/js";
import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "node_modules", ".claude"],
  },
  {
    // Pin the TSConfig root so the parser isn't confused by stray
    // tsconfig.json files elsewhere in the tree. Required because lint-staged
    // runs eslint at commit time.
    //
    // `projectService` (global — no `files` filter) powers the type-checked
    // rules below; it must apply to every matched file or the type-checked
    // configs crash on files outside the program.
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Type-checked tier: catches floating promises, misused async handlers,
  // unsafe `any`, and invalid template expressions. Requires the
  // `projectService` parser option set in the block above.
  ...tseslint.configs.recommendedTypeChecked,
  {
    // No inline eslint-disable / config comments anywhere.
    linterOptions: { noInlineConfig: true },
  },
  {
    // Ban ALL type assertions via the native rule: `assertionStyle: "never"`
    // forbids both `as` and angle-bracket casts. `no-unnecessary-type-assertion`
    // only flags casts it can prove superfluous; this is the outright ban.
    // Narrow with a type guard or parse with Zod instead.
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
    },
  },
  {
    files: [
      "vite.config.ts",
      "eslint.config.ts",
      "playwright.config.ts",
      "e2e/**/*.ts",
      "src/test/load-env.ts",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
