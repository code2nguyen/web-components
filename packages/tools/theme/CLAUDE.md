# @c2n/theme

Guidance for `packages/tools/theme`. Claude Code loads this file when it works in this directory; the repo-wide rules are in the root `CLAUDE.md`. Paths are relative to the repository root.

`packages/tools/theme` — published `@c2n/theme`: the `--c2-theme--*` design tokens (`src/tokens.ts`, single source of truth) and a **generated** base theme. `scripts/theme-generator/` (Node 24 erasable TS) reads every `@c2n/*/custom-elements.json` of the workspace packages (`pnpm-workspace.yaml`, through `@c2n/config/workspace.js`), classifies each documented CSS variable (`classify.ts` rule table, hand-curated exceptions in `overrides.ts`) and writes `dist/tokens.css`, `dist/base.css` (`--c2-<component>…: var(--c2-theme--…, <original default>)` per mapped variable), `dist/theme.css`, `dist/tokens.json` (tokens + variable→token mapping) and `dist/report.json` (coverage, unmapped list). Output is build-only (not committed). Its wireit `build` depends on every component build so manifests are fresh; the plop generator appends new components to that list. Components are never modified by the theme.

The token grammar and how components get mapped is "Design tokens" in `packages/components/CLAUDE.md`.
