import { fileURLToPath, URL } from "node:url";

import { transformSync, type PluginItem } from "@babel/core";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import type { PluginOption } from "vite";
import { PRIMARY_COLOUR, BACKGROUND_DARK } from "./src/ui/theme/tokens";

/**
 * GitHub Pages serves the site at /graphle/, but local dev is nicer at /.
 * Detect CI via GITHUB_ACTIONS so the built artefact gets the right asset base.
 */
const base = process.env.CI ? "/graphle/" : "/";

/** babel-plugin-react-compiler with default (compile-everything) options.
 *  Typed as a tuple so the literal isn't widened to `(string | object)[]`. */
const reactCompilerBabelPlugin: PluginItem = ["babel-plugin-react-compiler", {}];

/** Babel's `parserOpts.plugins` element type (the strict literal union from
 *  @babel/parser), derived from transformSync's own signature so no extra type
 *  import is needed. `@babel/core` v8 ships its own types and does not export
 *  ParserOptions, and @babel/parser is not a direct dependency under pnpm/yarn. */
type BabelParserPlugin = NonNullable<
  NonNullable<NonNullable<NonNullable<Parameters<typeof transformSync>[1]>["parserOpts"]>["plugins"]>[number]
>;

/**
 * React Compiler (stable 1.0) auto-memoises components and hooks at build time.
 *
 * Runs as a `post` transform over @babel/core. Two findings drove this shape:
 *
 * 1. It must run AFTER plugin-react's oxc JSX/TypeScript transform, not before.
 *    The compiler expects the `_jsx()` call form that a JSX transform emits
 *    (that is the order it runs in inside a normal babel-preset-react pipeline).
 *    Run as `pre`, the compiler emits memoisation into source that still has
 *    JSX, and the subsequent oxc pass then strips it. As `post`, oxc has
 *    already produced `_jsx()` calls and the compiler's memoisation survives
 *    into the bundle.
 *
 * 2. The path the @vitejs/plugin-react README suggests — `reactCompilerPreset`
 *    via `@rolldown/plugin-babel` — is a silent no-op on this Vite/Rolldown
 *    setup: that plugin assigns `transform.filter` inside `configResolved`,
 *    but a hook's filter is read at registration time, so the babel pass
 *    never runs. Running the compiler directly through @babel/core with an
 *    inline filter is reliable, so that is what this does.
 *
 * Scoped to the React layer (src/ui/** plus the src/main.tsx entry) so the
 * pure, determinism-critical domain/schema/storage layers are never fed to
 * the compiler.
 */
const reactCompiler: PluginOption = {
  name: "react-compiler",
  enforce: "post",
  transform: {
    filter: { id: /\.[tj]sx?$/ },
    handler(code, id) {
      // Virtual modules and dependencies are none of the compiler's business.
      if (id.includes("\0") || id.includes("node_modules")) return undefined;
      // Only compile the React layer; keep domain logic React-free.
      if (!/[\\/]src[\\/](?:ui[\\/]|main\.tsx$)/.test(id)) return undefined;
      const parserPlugins: BabelParserPlugin[] = [];
      if (id.endsWith(".ts") || id.endsWith(".tsx")) parserPlugins.push("typescript");
      if (id.endsWith(".jsx") || id.endsWith(".tsx")) parserPlugins.push("jsx");
      let result: ReturnType<typeof transformSync>;
      try {
        result = transformSync(code, {
          filename: id,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          parserOpts: { plugins: parserPlugins },
          plugins: [reactCompilerBabelPlugin],
        });
      } catch (error) {
        this.error(`[react-compiler] ${error instanceof Error ? error.message : String(error)}`);
      }
      const compiled = result?.code;
      if (compiled === undefined || compiled === null || compiled === code) return undefined;
      // Babel's EncodedSourceMap carries readonly `names`; Vite takes a string
      // or mutable SourceMap, so serialise. Build the result conditionally so the
      // optional `map` is never assigned `undefined` (exactOptionalPropertyTypes).
      if (result?.map === undefined) return { code: compiled };
      return { code: compiled, map: JSON.stringify(result.map) };
    },
  },
};

/**
 * Installable PWA. The service worker precaches the app shell only — HTML,
 * CSS, JS, fonts and icons — so the app opens offline and a shared `#g=` URL
 * or a saved IndexedDB graph still loads with no network. GitHub API calls go
 * straight to the network: they are cross-origin (api.github.com) and
 * `runtimeCaching` is empty, so the worker never intercepts them. Theme
 * colours come from the design-token single source of truth (src/ui/theme).
 * Relative scope/start_url keep the app working under the GitHub Pages
 * /graphle/ base path as well as / in local dev.
 */
const pwa = VitePWA({
  registerType: "autoUpdate",
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
    runtimeCaching: [],
  },
  manifest: {
    name: "Graphle",
    short_name: "Graphle",
    description: "A client-side graph exploration and editing tool.",
    theme_color: PRIMARY_COLOUR,
    background_color: BACKGROUND_DARK,
    display: "standalone",
    scope: "./",
    start_url: "./",
    icons: [
      {
        src: "icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "icons/maskable-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  },
});

export default defineConfig({
  base,
  plugins: [react(), reactCompiler, vanillaExtractPlugin(), pwa],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    // Production builds ship without sourcemaps: they bloat the GitHub Pages
    // deploy for no runtime benefit. Dev keeps sourcemaps regardless — this
    // flag governs only the production build.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split stable vendor code into separately-cached chunks so a browser
        // cache survives app-code changes. The function form keys on the
        // resolved node_modules path.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@mantine")) return "vendor-mantine";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }
          if (
            id.includes("/dexie") ||
            id.includes("lz-string") ||
            id.includes("/zod/")
          ) {
            return "vendor-data";
          }
          if (id.includes("@xyflow")) return "vendor-flow";
          return undefined;
        },
      },
    },
  },
  test: {
    // Vitest 4 renamed the old top-level `environmentMatchGlobs` array to
    // per-project configs under `test.projects` (the `workspace` file /
    // `environmentMatchGlobs` split has been folded into projects, which is
    // now the supported way to run part of a suite under jsdom and the rest
    // under node from a single config). Each project uses `extends: true`
    // so it inherits the plugins/resolve/css config above, and declares its
    // own `environment`, `include`, and `setupFiles` explicitly rather than
    // relying on inheritance of the (deliberately unset) root test options.
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.{unit,integration}.test.ts"],
          exclude: ["src/ui/**", "src/**/*.smoke.test.ts"],
          setupFiles: ["./src/test/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: [
            "src/ui/**/*.{unit,integration}.test.ts",
            "src/**/*.smoke.test.ts",
          ],
          setupFiles: ["./src/test/setup.ts"],
        },
      },
    ],
  },
});
