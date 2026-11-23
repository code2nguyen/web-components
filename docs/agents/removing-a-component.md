# Removing a component

The counterpart of `adding-a-component.md`: what to touch when a component package goes, so nothing keeps pointing at
it. Removing `c2-chatbot` touched about 45 files; most of them are listed here by kind. Paths are relative to the
repository root.

## Before you start

- **It is a breaking change.** `@c2n/components` ships every component as `@c2n/components/<name>`, so removing one
  removes a public import path. It needs the maintainer's sign-off and a `feat(<scope>)!:` commit whose
  `BREAKING CHANGE:` footer says what to use instead (that footer is what the changelog lists).
- Search first, and search again at the end: `git grep -n -I -e '<name>' -e 'c2-<name>'`. History (`CHANGELOG.md`,
  `apps/ui/src/data/changelog.json`) stays as it is; `docs/planning/` gets a note rather than a silent edit.

## 1. The package and its wiring

1. Delete `packages/components/<name>/`, its docs page `apps/ui/src/content/components/<name>.mdx` and its gallery
   `apps/ui/src/content/gallery/<name>.mdx`.
2. Remove `"./packages/components/<name>:build"` from the root `package.json` `wireit.build.dependencies`, and the
   component's `:build` from `packages/tools/theme/package.json`. Remove it from any sibling's `wireit` dependencies
   too (`git grep -n '<name>:build'`).
3. Remove `@c2n/<name>` from `apps/ui/package.json` and from `packages/umbrella/package.json` `devDependencies`, and
   its import and `normalizedManifests` entry from `apps/ui/src/store/component-manifests.ts`, its side-effect import
   from `apps/ui/src/data/component-modules.ts`, and its entries in `component-previews.ts` and
   `component-presets.ts`.
4. `pnpm install`, which drops the package's `importers` entry from `pnpm-lock.yaml`; `git grep -c 'components/<name>'
pnpm-lock.yaml` should then find nothing.

## 2. Regenerate what is generated

Run them in this order (each reads what the one before wrote):

```bash
pnpm --dir packages/tools/framework-types run generate   # umbrella src/, exports, react/vue typings
pnpm run build && pnpm run build:tools                 # manifests, MCP registry, skill catalog
pnpm run mcp:readiness --full                      # packages/tools/mcp/readiness/ drops the component
node lab/scripts/gaps.mjs                            # lab/GAPS.md
```

Then remove the component's entry from `packages/umbrella/size-budget.json` by hand (`size:update` would rewrite every
budget), and regenerate `scripts/data/slot-styling-audit.json` with `node scripts/generate-slot-styling-audit.mjs`. CI
regenerates that file and fails on any difference, so commit its output as written; if it also changes other
components' entries, put that drift in a commit of its own.

## 3. Exceptions and fixtures that name it

- `KNOWN` lists: `packages/tools/mcp/scripts/check-reachability.ts`, `scripts/check-dogfooding.mjs`,
  `apps/ui/gallery-audit.known.json`. Remove its entry (the reachability check fails on an entry for a component that
  no longer fails).
- The AI readiness tasks (`packages/tools/mcp/scripts/readiness/tasks.json` and `heldout.json`, whose `expect` and
  `tags` name component ids and tags) and the lab (`lab/specs/`, `lab/reports/`): drop or retarget each task and
  requirement that expects it, then regenerate `lab/GAPS.md`.
- Unit-test fixtures that use it as an example (`scripts/*.test.mjs`): switch them to a component that still exists
  rather than deleting the case.
- Doc comments and guidance that cite it as an example: `git grep` finds them.

## 4. Verify

`pnpm run check:pr` (the full run, not `--fast`: the builds must regenerate without it), then the final `git grep`.
The umbrella suite (`pnpm exec playwright test packages/umbrella`) proves every remaining tag still registers from the
bundle.
