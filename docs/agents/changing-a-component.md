# Changing a component

Read this before changing an existing component: one checklist per kind of change, gathering the steps that are otherwise spread over the root `CLAUDE.md`, `packages/components/CLAUDE.md`, `docs/agents/component-foundation.md`, `tests/README.md` and the `ai-readiness` skill. Not loaded automatically. A new component starts from `docs/agents/adding-a-component.md` instead. Paths are relative to the repository root; `<name>` is the package directory under `packages/components/`.

## Every change

1. Read `docs/agents/component-foundation.md` when the change adds public API: the six rules decide its shape (a look is a CSS variable, a content variation a slot, an app command an action zone).
2. Change the source, then `pnpm --dir packages/components/<name> run type-check` (seconds; it builds `@c2n/core` and the sibling packages it lists first).
3. Test: `pnpm exec playwright test packages/components/<name>/test --project=chromium` (seconds; tests run from source, no build needed). A behaviour change comes with a test, and a bug fix's test fails without the fix. The test server has a fixed port (4175) and a run reuses one already listening there, so two sessions running browser tests at once share it: when another session's server stops mid-run, the run fails with `ERR_CONNECTION_REFUSED`, and running it again is the fix.
4. A public change (attribute, property, event, slot, part, CSS variable, method) rebuilds the package so its committed `custom-elements.json` is regenerated: `pnpm --dir packages/components/<name> run build`. CI fails on a stale manifest.
5. A public change also regenerates the committed framework glue (`packages/components/<name>/react.d.ts`, `vue.d.ts`, the umbrella's `src/`, the Angular value accessors): `pnpm --dir packages/tools/framework-types run generate`, or `pnpm run build:tools` after the root build. Commit what it writes; never edit those files by hand.
6. `node scripts/check-component-lifecycle.mjs` (`pnpm run check:lifecycle`). If the change fixes a listed violation, delete its line from `scripts/data/lifecycle-known.json`; "What to do instead of a reactive write in `firstUpdated()`" in `packages/components/CLAUDE.md` has the patterns.
7. Docs and AI readiness: `pnpm run mcp:readiness <name>` compares the component with its last score; fix what it says is missing ("Fix" in `.claude/skills/ai-readiness/SKILL.md`) and commit `packages/tools/mcp/readiness/` with the change.
8. Before a pull request: "Before opening a pull request" in the root `CLAUDE.md` (reviews, screenshot review, `pnpm run check:pr`).

## Adding an attribute or property

- Behaviour or semantics only: a look belongs in a CSS variable (below). A text default is `''` and falls back to a message at render time (`this.label || this.msg.t('label')`), unless `''` must mean "show nothing": then it is `prop?: string` with a `??` fallback (the built-in text rule in `packages/components/CLAUDE.md`).
- `property` from `@c2n/core/lit-helper.js`, a JSDoc comment on it (type, default, what it does): the manifest, `get_component` and the API table read it. A camelCase property follows the existing convention of an explicit kebab-case `attribute` (`attribute: 'row-key'`).
- A reflected attribute is styled against its absence too (`:host(:not([side]))`): its default is not reflected.
- Changing a default or renaming is breaking: explicit sign-off and a `!` commit with a `BREAKING CHANGE:` footer.
- Show it: a row in the docs page's `UsageBlock` (`apps/ui/src/content/components/<name>.mdx`) or a gallery card, when it changes what the user sees.

## Adding a CSS variable

- The name follows `--<prefix>__<block>[__<state>]--<css-property>`; follow the component's existing spelling when it predates the grammar.
- The default goes in the SCSS `$theme` map and is read with `css.cssVar(...)`; the same default goes in the `@cssproperty {type} [--name=default] - description` line of the class JSDoc. A name that is not a CSS property (`--size`, `--visible-rows`) needs the description.
- Use the existing literals and scales (radii 4/6/8/14/999px, the colour ramp, font sizes 12/14px): `@c2n/theme` maps them to tokens automatically. A deliberate exception goes in `packages/tools/theme/scripts/theme-generator/overrides.ts`.
- Add a browser case to `scripts/data/style-contract-cases.json` (the component's other variables show the shape; "Styling-contract verification" in `tests/README.md`), then `pnpm run test:style-contracts --project=chromium --grep <name>-`. `node scripts/check-style-contracts.mjs --json` lists the whole library's open failures; filter it for your tag.
- A gallery card that uses it (rule 6, proof), readable in both themes (`light-dark()` for a colour that must flip).

## Adding a slot or part

- `@slot name - what goes in it` (name the typical child elements) and, for its wrapper, `@csspart`. A region that is empty without content is hidden while empty with `SlotPresenceController`.
- Never write `slot` on author children: manual assignment (`slotAssignment: 'manual'`, `assignSlot`). Slot state read only from `slotchange` misses server-rendered children: pair it with `SlotReplayController`.
- `node scripts/generate-slot-styling-audit.mjs` adds the slot to `scripts/data/slot-styling-audit.json`; write its decision, run the generator again, commit the file (`pnpm run docs:check` checks it).
- A "Slots" gallery card that fills it (AI readiness counts named slots shown in an example).

## Adding an event

- An `@event name - detail and when` line, and the entry in the exported `<Class>EventMap` merged through `TypedAddEventListener`/`TypedRemoveEventListener`: the two must match.
- Decide bubbling deliberately (`selection-change` does not bubble); a form control also fires plain `input`/`change` targeted at its host.

## Adding built-in text

- A key in `src/messages.ts`, rendered through `this.msg.t(key)`; never a literal in the template, an `aria-label` or an announcement.

## Fixing a bug

- Write the failing test first, in the package's `test/` suite; then fix. A hydration bug gets a `test/hydration.spec.ts` (copy `month-planner`'s or `video-player`'s).
- The commit subject is for a user of the component: `fix(<name>): <what the user saw, now right>`.
- A bug that came from component feedback also moves its entry in `COMPONENT-FEEDBACK.md` (the `fix-component-feedback` skill).
