---
name: new-component
description: Scaffold a new c2-* Lit web component with the repo's plop generator (scripts/generator), then implement it and wire the UI app (apps/ui, the docs site) (manifest, gallery preview, module import, doc page), and score it for AI readiness. Use when asked to create, add, scaffold or generate a new component or package.
argument-hint: <Component Name> [npm|open] [category] [one-line description]
---

# New component

Create a new `@c2n/<name>` package with the repo's plop generator, implement the element, and wire everything the generator does not touch. Follow the conventions in `packages/components/CLAUDE.md` throughout (theming, JSDoc manifest tags, `override`, `redispatchEvent`, code style).

## 1. Collect inputs

From `$ARGUMENTS` and the conversation, determine:

| Input                       | Notes                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                    | Title Case words, e.g. `Dropdown List`. Plop derives `dashCase` (`dropdown-list`, tag `c2-dropdown-list`, package `@c2n/dropdown-list`), `pascalCase` (`DropdownList`), `camelCase` (`dropdownList`).                                           |
| **Category**                | One of the enum in `apps/ui/src/schemas/index.ts` (`Inputs`, `Buttons`, `Navigation`, `Layout`, `Data display`, `Table`, `Editors & viewers`, `Chart`, `Planning`, `Feedback`, `Chat`). Drives sidebar grouping, landing gallery and ⌘K search. |
| **Description + behaviour** | One sentence for the doc frontmatter, plus what the element does: attributes, slots, events, states, which existing components it composes.                                                                                                     |

If only the name is given, pick the most fitting category yourself, and ask a single question only if the behaviour is genuinely unclear. Check the name is not already taken: `ls packages/components`.

Then settle the six foundation decisions (`docs/agents/component-foundation.md`) before writing code, and state them in the design doc or the first message about the component:

| Decision         | Write down                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Presentation** | The parts and states that get `--c2-<name>__<part>[__<state>]--<property>` variables. No attribute for a look.                                                                             |
| **Extension**    | Which regions are named slots (icons, toolbar, footer, `empty`/`loading`/`error`) and which per-item content takes a `render<Part>` function.                                              |
| **Data**         | Collection components only: the declarative form (child elements and/or a JSON attribute), the in-memory property, the `dataSource` interface, and which wins when two are given.          |
| **Actions**      | Complex components: the action zones (`toolbar`, `actions`, `footer` slots) the app fills, and the methods and events those actions use. Which actions, if any, must be built in, and why. |
| **Text**         | Every string the component draws or announces, as a key in `src/messages.ts`.                                                                                                              |
| **Gallery**      | The list of cards: one per feature above, and which of them need an `<Name>ExamplesRuntime.astro` because the feature is property-only.                                                    |

Then settle the **platform decisions** the same way (`packages/components/CLAUDE.md`, "Modern web platform"; step 1 of the `modern-web-review` skill): for each behaviour the component needs (a popup, a dialog, a collapsible region, a growing field, Enter to submit, a long list, drag, a canvas, motion), search the modern-web-guidance guides, read the matching one, and write down the feature you will use, its Baseline status and its fallback. Prefer the platform feature over hand-written JavaScript, and an existing `@c2n/core` helper (`isComposingKey`, `lockPageScroll`, the overlay) over a new copy.

## 2. Design mock screen (complex components)

For a complex component, draw it before building it. A mock is the cheapest place to get the look and the layout
right, and the user sees the design as a picture, not only as prose. A component is complex when any of these hold:
it has more than one region or pane, it composes several `c2-*` elements, it opens a popup or overlay, it supports
drag, resize or live data, or it has four or more visual states. A glyph, a pill or a single-control input skips
this step.

```bash
node .claude/skills/new-component/scripts/mock-screenshots.mjs <name> --init     # writes design-mocks/<name>.html from the template
node .claude/skills/new-component/scripts/mock-screenshots.mjs <name> [--mobile] # one PNG per state and theme in test-results/design-mocks/<name>/
```

`design-mocks/` is ignored by Git: the mock is a working drawing, and the component replaces it. The script serves the
repo with the test Vite server, which resolves every `@c2n/*` import to source, and loads `@c2n/theme`'s
`theme.css` (build it with `npm run build -w packages/tools/theme` if it is missing).

- **Draw the new element with plain HTML and CSS**, and use the real `c2-*` elements for the parts it composes (a
  `c2-select` in a toolbar, a `c2-button` in a footer) through a `<script type="module">` import, so the mock shows
  them as they are.
- **One `<section data-mock="State name">` per state worth reviewing**: the default, empty, loading, error,
  selected or open states, a long-content or overflow case, and RTL where direction matters. Each section is
  screenshotted on its own, in both themes; `--mobile` adds the full page at 390px for anything that has to
  reflow.
- **Use the tokens and the library's literals** (step 4 lists them): `var(--c2-theme--color-on-surface, #18181b)`,
  `var(--c2-theme--radius-lg, 8px)`. The mock then reads in dark mode as is, and its values move into the
  component's `$theme` map unchanged.
- **Name the parts as the component will** (`.header`, `.row`, `.row__selected`): those class names are the
  `--c2-<name>__<part>--<property>` variables to come.

Look at every image, fix the mock until it reads well in both themes and at narrow widths, then send the
screenshots to the user with the design doc (`SendUserFile` when available). Build only after that. The mock is also
the reference for step 8: the built component's screenshots should match it, or the difference should be a
deliberate change.

## 3. Run the generator (non-interactive)

Plop accepts the prompt answers as positional bypass args, so never run it interactively:

```bash
npm run generate -- "<Name>"
npm install                    # link the new workspace into node_modules/@c2n
```

`pregenerate` recompiles `scripts/generator/plopfile.ts` → `plopfile.js` first. The generator then:

- copies `scripts/generator/files/wc/**` to `packages/components/<name>` (`package.json`, `vite.config.ts`, tsconfigs, `index.html` harness, `README.md`, `src/<name>.ts`, `src/<name>.scss`, `src/vite-env.d.ts`)
- adds `"./packages/components/<name>:build"` to the root `package.json` `wireit.build.dependencies`
- adds the component's `:build` to `packages/tools/theme/package.json` `wireit.build.dependencies` (the theme generator reads its manifest)
- scaffolds the Playwright suite `<package>/test/` (`scenarios.html`, `scenarios.ts`, `fixture.ts`, `<name>.spec.ts`)
- creates the doc stub `apps/ui/src/content/components/<name>.mdx`
- the `custom-elements.json` import and `normalizedManifests` entry in `apps/ui/src/store/component-manifests.ts`, the `@c2n/<name>` dependency in `apps/ui/package.json` and in `packages/umbrella/package.json`'s `devDependencies`, the side-effect import in `component-modules.ts`, a placeholder entry in `component-previews.ts`, and the gallery stub `apps/ui/src/content/gallery/<name>.mdx`

`npm install` afterwards is not optional: it creates the `node_modules/@c2n/<name>` workspace symlink. Without it
`npm run ui:build` fails with `failed to resolve import "@c2n/<name>/custom-elements.json"`.

Each registry entry lands at its alphabetical place (`scripts/generator/sorted-lists.ts`), so a component PR does not conflict with another one open at the same time; keep it there if you touch those lists by hand.

Verify with `git status --short` that exactly those files changed (`scripts/generator/plopfile.js` and `sorted-lists.js` are git-ignored and rebuilt by `pregenerate`, so they never show up).

## 4. Implement the component

Edit `src/<name>.ts` and `src/<name>.scss` in the new package. Use `packages/components/checkbox/src/checkbox.ts` as the reference shape; `label` is a good minimal example.

- Replace the scaffold body. Keep `@customElement('c2-<name>')`, `static override styles = unsafeCSS(styles)` and the `declare global { interface HTMLElementTagNameMap }` block.
- Declare every public CSS variable in the SCSS `$theme` map (`part--css-property`, `part__state--css-property`) and read it with `css.cssVar(...)`. Mirror **every** entry as a `@cssproperty {type} [--c2-<name>__part--prop=default]` JSDoc line, or it will not appear in the API table / inspector. Document `@slot` and `@event` the same way; use `@internalcomponent` / `@slotcomponent` for composed children.
- Reuse the library's default literals so `@c2n/theme` maps the variables automatically: accent `rgb(2, 101, 220)`, text `#18181b` / `#71717a`, borders `1px solid #bcbcc6` (resting) / `#a1a1aa` (hover) / `#e4e4e7` (hairline), radii 4/6/8/14/999px, font sizes 12/14px, weights 500/600, focus outline `2px solid rgba(2, 101, 220, 0.4)`, disabled opacity `0.38`.
- **Extension points** (foundation rule 2): a named `<slot>` with a built-in default for each author-written region, its wrapping element exported as a CSS part named after the slot (`part="footer"`, documented with `@csspart`), and for content repeated per item an `@property({ attribute: false }) render<Part>?: <Class><Part>Renderer` whose exported type is `(context: <Class><Part>Context) => unknown`. The component keeps the item's container, ARIA, keyboard and selection; the renderer returns content only. See `packages/components/virtual-list/src/virtual-list-types.ts`.
- **Action zones** (foundation rule 5): give a complex component `toolbar`/`actions`/`footer` slots and the public methods and events an app's own buttons need, instead of built-in buttons behind flags. Build an action in only when the widget's own pattern requires it, and keep it replaceable through a slot.
- **Text** (foundation rule 6): no string literal in the template. Each label, `aria-label`, announcement and message is a key in `src/messages.ts` rendered with `this.msg.t(…)`; a text property defaults to empty and falls back to its message.
- **Data** (foundation rule 3, collection components): the declarative form (child elements read on `slotchange`, and/or a `jsonPropertyConverter` attribute) and the in-memory property feed one internal model; `@property({ attribute: false }) dataSource?: <Class>DataSource` (one async `get<Things>(request)` returning the items and `total`) replaces it for remote or paged data, with `loading`/`empty`/`error` slots and superseded responses dropped. Say in the JSDoc which form wins. See `TableDataSource` in `packages/components/table/src/table-types.ts`.
- Re-emit native events with `redispatchEvent` from `@c2n/core/dom-helper.js`. Import sibling components by package name (`@c2n/list-item`), never by relative path, and add them to `dependencies` in the package's `package.json` as `"*"` **and** to its `wireit.type-check.dependencies` as `../<sibling>:build` (see `select`). Without the wireit entry a clean `npm run build` type-checks this package before the sibling has emitted its declarations and fails with `Cannot find module '@c2n/<sibling>'` - and it only shows up on a fresh checkout, never on a warm one.
- `override` is mandatory on `render`/`update`/etc.; no `any`; prefix unused params with `_`.
- **An API an agent can read** (AI readiness, below): the class JSDoc says what the element is and when to use it; every public member a consumer may set from script (`render<Part>`, `dataSource`, methods, public getters) has a JSDoc description and a type, and an internal that is public only for TypeScript's sake (a `@query` handle, a handler, internal state) gets `/** @internal */` so the manifest and `get_component` leave it out. A `@cssproperty` whose last segment is not a CSS property (`--size`, `--icon-size`, `--visible-rows`) gets a `- description` saying what it sets (`Width and height of the thumb`). A `@slot` description names the components it typically holds (`a c2-list of c2-list-item links`); a child element's JSDoc names its parent.
- **Modern platform** (`packages/components/CLAUDE.md`, "Modern web platform"): the platform decisions from step 1, with their fallbacks. In particular: Enter on a text field guarded by `isComposingKey(event)`; focus that has no outline gets `@include focus.forced-colors-ring` (`@use '@c2n/sass/focus'`) and keys on `:focus-visible`; collapsed content stays findable (`::details-content`, `hidden="until-found"`); popups and anything above a modal in the top layer (`popover`, `<dialog>`); no `innerHTML` strings; cross-shadow ARIA through element references; form controls implement `formDisabledCallback` with the fieldset check, `formStateRestoreCallback` and an anchored `setValidity`; a reduced-motion path for every animation.
- Replace the scaffold's `<c2-<name>>` in `index.html` with a few hand-written usage examples (states, slots, themed variant).

## 5. Write the test suite

The generator leaves a passing placeholder in `<package>/test/`. Replace it with real coverage before calling the
component done — `tests/README.md` has the conventions, and `packages/components/button/test/` is the reference.

- `scenarios.ts` owns each state, branching on the `scenario` query parameter; the spec drives the element through
  real pointer and keyboard input rather than mutating properties.
- Cover the states and transitions that matter, plus an axe scan of the representative ones.
- Use the shared `tab` fixture for focus order. No arbitrary sleeps, no synthetic clicks.
- `npm test` runs the suites of changed packages; `npm run test:all` runs everything on three engines.

For a component where cost matters more than behaviour — anything virtualized or holding a large dataset — see
`packages/components/table/test/` for the split between a machine-independent `*.perf.spec.ts` and an opt-in
wall-clock `*.bench.spec.ts` with a committed baseline.

## 6. Fill in the UI app wiring the generator stubbed

- `apps/ui/src/data/component-previews.ts` — replace the placeholder with real markup keyed by doc id (use `<div class="preview-row">` for several elements).
- `apps/ui/src/content/gallery/<name>.mdx` — replace the two stub cards with styled variants worth drawing from; delete the file if the component has no meaningful variants and the Gallery tab should not appear.
- `apps/ui/src/content/components/<name>.mdx` — fill frontmatter (`title`, `description`, `category`), one intro sentence, `## Import` (` ```typescript tag=CodeBlock ` with `import '@c2n/components/<name>'`; no install section, `@c2n/components` is installed once from Getting started; when the Usage or Gallery markup uses icon tags, add a one-line note installing that icon-set package, e.g. `npm install @c2n/feather-icons`), and a single `## Usage` card: one ` ```html tag=UsageBlock,package=@c2n/<name> ` fence whose body is an optional `<style>` block plus one `<div data-label="Row name">…</div>` per row of live elements. No `# Title`, no `<ApiTable>` (the API tab renders it), no `PresetGallery`.
  Gallery fences are ` ```html tag=MdxCodeBlock,label=<Card name> ` inside `<GalleryGrid>` (blank lines around each), each a fence-local `<style>` class plus the element — never an inline `style` attribute, which the studio would read as the authored state. Pick the cards per row from the component's size (`columns="2"` or `columns="1"` for anything wider than a small control), as "Gallery cards" in `apps/ui/CLAUDE.md` says.
- **Every feature gets a gallery card** (foundation rule 4): each slot, each renderer, each data form and each variable group worth restyling. Markup-reachable features are plain fences. For a property-only feature (`renderItem`, `dataSource`), put `data-<name>-example="<case>"` on the element in the fence, assign the property from a new `apps/ui/src/components/<Name>ExamplesRuntime.astro` (copy `KanbanExamplesRuntime.astro`), render `<<Name>ExamplesRuntime />` once in the gallery MDX, and add a ` ```ts tag=CodeBlock ` fence with the consumer's code. A `dataSource` card uses a delayed in-page source, never the network.
- Optional but encouraged: 2–3 curated presets under `'c2-<name>'` in `apps/ui/src/data/component-presets.ts` (they feed the inspector's Presets tab and the MCP `get_presets` tool).
- Landing gallery, sidebar and search pick the page up automatically from the collection.
- **For agents** (AI readiness, below): the frontmatter `description` says what the component is in one sentence a developer's need would match; `keywords: ['…']` lists the other names developers use for it (`snackbar`, `segmented control`, `kebab menu`), which `search_components` weighs like its name; `intents:` (a block list of 3–5 sentences) says what a developer is trying to achieve when this component is the right choice, worded as a requirement without naming the widget (`- 'Let users turn a setting on or off with immediate effect.'`), and where a sibling serves a nearby need says what sets this one apart — search reads them and `get_component` prints them. The usage card has at least three rows, each showing a state or option a reader can see (copy the first row and change one attribute; a row that looks like its neighbour misleads). Name canvas-like elements and icon-only buttons with `aria-label` in the examples: agents copy them. Use every named slot in a gallery card.

## 7. Verify (match CI)

```bash
npm run build -w packages/components/<name>   # type-check + vite build; regenerates custom-elements.json (commit it)
npm run build -w packages/tools/theme         # regenerate the base theme; read the coverage table / dist/report.json
npm run build:tools                           # regenerate the MCP registry (ignored), the skill catalog and the @c2n/components entries (commit those)
npm install                                   # again if build:tools changed packages/umbrella/package.json (e.g. a third-party dependency the package imports)
npm run check:reachability                    # served docs page, description, 3+ intents, umbrella entry, tags resolve (docs/agents/adding-a-component.md)
npm run size:add -w packages/umbrella         # record the new entry's bundle-size budget (only missing entries; commit size-budget.json)
node packages/tools/mcp/src/cli.ts validate apps/ui/src/content/components/<name>.mdx apps/ui/src/content/gallery/<name>.mdx  # plus any example-app file you touched: catches an attribute or slot a c2-* element does not have
node .claude/skills/modern-web-review/scripts/scan.mjs packages/components/<name>   # legacy-pattern scan: fix each error or justify it with a modern-web-ignore comment
npm run lint && npm run format:check          # or: npm run fix
npm run ui:build                              # catches a missing apps/ui dependency, which ui:dev does not
npm test                                      # the new package's Playwright suite
npm run ui:dev                                # open /components/<name>; check example, gallery, API table, inspector
```

`build:tools` rewrites the dependency keys of `packages/umbrella/package.json` from what the bundle imports. The generator already added the `@c2n/<name>` devDependency, which the first `npm install` recorded; a third-party library the new package imports lands in the umbrella's `dependencies` only now. Whenever that file changed, run `npm install` again and commit `package-lock.json` with it, or the lockfile disagrees with `package.json` and `npm ci` in CI rejects the install. `build:tools` fails when a docs page has no built package or a preset names an unknown tag. The MCP registry is an ignored build artifact included at package time; commit the regenerated skill catalog and `packages/umbrella` entries. `npm run docs:check` also requires complete public API descriptions and a CSS-unchanged Default gallery sample.

Confirm every `$theme` variable appears in the API table and Design tab. In the theme report, every colour/border/radius/focus variable of the new component with a concrete default should be mapped; add an `overrides.ts` entry (token or `exclude` with a reason) for deliberate exceptions. Use `npm run dev -w packages/components/<name>` for the standalone Vite harness.

### AI readiness

The component is done when an agent can find it, read its API and use it correctly. After `npm run build:tools`, score it
(the `ai-readiness` skill has the details and a fix for every check):

```bash
npm run mcp:readiness                         # scores what changed since the committed baseline: the new component shows as "new"
```

- **Grade A (≥ 90)**, and no check lost that has an honest fix: read the component's section of
  `packages/tools/mcp/readiness/changes.md` ("What is still missing") and fix it in the component's JSDoc, its docs
  page or its gallery. A check that only filler would satisfy (a usage row with no visible effect, a description that
  repeats a CSS property name) is not a gap: leave it and say so.
- **Discovery:** add one or two requirements for it to `packages/tools/mcp/scripts/readiness/tasks.json`, written as a
  developer would ask without naming it (`"Let customers leave a 1 to 5 star review"`, `expect: ["rate"]`,
  `tags: ["c2-rate"]`), and check the run's discovery misses: the component should rank first, or at least in the top 3,
  for them. If not, sharpen its `description` or `intents`, not the requirement. Do not look at or tune against the
  held-out requirements (`readiness/heldout.json`): the report prints only their number, which a new component's
  intents should not lower.
- **No regression elsewhere:** a sibling the new component changed (a shared base class, a parent it slots into) shows
  up in the same run; `--fail-on-regression` makes it an error.
- Commit `packages/tools/mcp/readiness/` with the component. The agent run (`npm run readiness:agent -w
packages/tools/mcp`, about $10) is not part of adding a component; offer it, with its cost, for a component agents
  will reach for often.

## 8. Review it in the docs app by screenshot

Passing checks do not show what a reader sees. Before the pull request — and again after any fix that changes the
component's look or its docs — build the site and screenshot the component's pages, then look at every image yourself:

```bash
npm run ui:build
node .claude/skills/new-component/scripts/doc-screenshots.mjs <name> [--press "<button name>"]…
```

The script serves `apps/ui/dist` with `astro preview` and writes `test-results/doc-screenshots/<name>/` (ignored by
Git): the Docs usage card and the Gallery in the light and the dark theme, the API tab, the landing card,
`aria.txt` (the usage card's accessibility tree) and `report.json`. It fails on any page or console error. Each
`--press` clicks the first button with that accessible name on the Docs page and screenshots the page, for a state
that only shows after interaction: an open popup, a revealed value, a pressed toggle.

Read each screenshot, then check:

- **Both themes:** text and surfaces readable in dark mode, no light literal left on a dark surface.
- **Every gallery card and usage row:** nothing clipped, overlapping or cut off, especially in the narrow gallery
  frames; icons drawn in every state (an SVG built with Lit's `html` instead of `svg` draws nothing).
- **Interactive states** through `--press`: the popup placed beside its trigger, the state actually changed.
- **`aria.txt`:** every control and the component itself have the name you intended; no stray text is read.
- **Landing card:** the preview reads at that size.
- **Against the mock** (complex components, step 2): the built look matches it, or the difference is deliberate.

Fix what you find, re-run the step, and send the user the screenshots that show the component (with
`SendUserFile` when available), saying what was fixed after they were taken. The pull request description notes
that the review was done and what it caught.

## Checklist to report

- foundation decisions met: presentation only through CSS variables, extension through slots and `render<Part>` functions, declarative + in-memory + `dataSource` data for a collection component, action zones instead of built-in commands, all text through message keys, and a gallery card for every feature (property-only ones through `<Name>ExamplesRuntime.astro`)
- `packages/components/<name>/` scaffolded, implemented, built, `custom-elements.json` generated
- the package stays private (`"private": true`): it ships only inside `@c2n/components`; `npm run build:tools` regenerates the umbrella's `src/**` entries (the runtime `.js` and its `.d.ts` declaration, per package and per element module) and its `package.json` exports; commit all of them, and write the README's install and import lines as `npm install @c2n/components` / `import '@c2n/components/<name>'`
- root `package.json` wireit build list entry + `packages/tools/theme/package.json` build dependency
- `@c2n/theme` regenerated, new variables mapped or listed in `overrides.ts`
- `npm run size:add -w packages/umbrella` run and `packages/umbrella/size-budget.json` committed (one new line, nothing else changed)
- `npm run build:tools` run (then `npm install` again if it changed `packages/umbrella/package.json`, with `package-lock.json` committed); generated MCP registry verified and `packages/tools/skill/skills/c2n-components/references/component-catalog.md` committed
- the component's row deleted from `docs/planning/COMPONENT-ROADMAP.md` when it has one (the roadmap lists only what is still to build)
- `npm run docs:check` passes (tag, attribute, slot, event and CSS-part descriptions; Default gallery baseline)
- AI readiness: `npm run mcp:readiness` scores the component A (≥ 90) with no honestly fixable check left, its discovery requirements in `tasks.json` rank it in the top 3, nothing else regressed, and `packages/tools/mcp/readiness/` is committed
- `apps/ui/src/store/component-manifests.ts` import + entry
- `apps/ui/package.json` dependency on `@c2n/<name>`, and `npm install` run so the workspace is linked
- `apps/ui/src/data/component-modules.ts`, `component-previews.ts` (+ `component-presets.ts` if presets)
- `apps/ui/src/content/components/<name>.mdx` and `gallery/<name>.mdx` filled in (or the gallery deliberately deleted)
- `<package>/test/` suite written and passing
- platform decisions recorded (feature, Baseline status, fallback) and `modern-web-review` passed: scanner clean, diff reviewed against its old → new pattern table
- lint + format clean, `npm run ui:build` green
- complex components: design mock drawn and reviewed in both themes, and shared with the design doc before building (step 2)
- docs app reviewed by screenshot (step 8) in both themes, problems fixed, screenshots shared
