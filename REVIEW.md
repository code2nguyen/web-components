# Review guide

What a review of a c2n pull request looks for: `/code-review`, `/security-review` and human reviewers alike. This repo
publishes `@c2n/components`, `@c2n/mcp` and `@c2n/skill`, and apps we do not see depend on them. **A change that breaks
an app silently is the worst bug there is**: a public API removed, a hydration mismatch under SSR, an element that no
longer registers. Rank findings by that.

Report a finding with a concrete failure: the markup, framework or state that leads to it, and what the user of the
component sees. Leave out style nits that Prettier or ESLint already settle. Leave out generated output too, unless it
is stale or hand-edited: the umbrella's `src/` and the generated keys of its `package.json`, the skill catalog,
`CHANGELOG.md` and `changelog.json`, `custom-elements.json` and the MCP registry. `CLAUDE.md` explains each convention
below in full.

## 1. Public API

- The public surface of a component is its tag, attributes and properties, events (with their `detail`), slots,
  `--c2-*` CSS variables, `::part()` names, methods and its `@c2n/components/<name>` import path. Removing or renaming
  any of them, changing a default, or changing an event's `detail` or bubbling is a **breaking change**. It needs
  explicit sign-off and a `!` commit (`feat(table)!: …`). Flag it when it is unmarked.
- **The JSDoc is the API documentation.** Every public CSS variable has an `@cssproperty` line whose default matches the
  SCSS `$theme` map; every public event has an `@event` line matching its `<Class>EventMap` entry; slots have `@slot`.
  A public change whose committed `custom-elements.json` was not rebuilt is a finding.
- **Presentation goes through CSS variables, not attributes.** A new `@property` for a size, colour, spacing or
  duration should be a `--c2-<prefix>__<part>[__<state>]--<property>` variable instead. Never both.
- Variable names follow that grammar exactly: the docs site parses it.

## 2. SSR, hydration and frameworks

- **A component never writes attributes on its host** (`role`, `aria-*`, `slot`, anything the author did not write).
  Host semantics go through `this.internals` (`attachInternals()`), and light-DOM children are routed with manual slot
  assignment (`assignSlot`). React, Next.js and React Router report every such write as a hydration mismatch.
- A reflected property's default is not reflected. Styles for the default state must also match the bare element
  (`:host(:not([side]))`), never only `:host([size='m'])`.
- A child rendered inside another component's server-rendered shadow root hydrates after its parent. Writes to it
  before its first update are deferred.
- `customElement` comes from `@c2n/core/element-helper.js` and `property` from `@c2n/core/lit-helper.js`, never from
  `lit/decorators.js`. Boolean attributes must read `"false"` and `"0"` as false.
- `requestUpdate()` or reactive-property writes inside `firstUpdated()`, and slot state that relies only on
  `slotchange` (`npm run check:lifecycle`).
- Code that touches `window`, `document`, `customElements` or layout at module load or in the constructor breaks
  server rendering.

## 3. Behaviour, accessibility and text

- Keyboard: everything the mouse does can be done from the keyboard, focus is visible, and focus moves where the user
  expects after open, close and delete.
- Accessible names and roles are present, through `internals` or the shadow DOM. A form control takes part in the
  field protocol (`FieldContextConsumer`): label, description, invalid state.
- **No hard-coded interface text.** Labels, `aria-label`s, announcements and validation messages are in
  `src/messages.ts` (English) and rendered through `this.msg.t(...)`.
- Events: `selection-change` does not bubble. Form-associated components also fire plain `input` and `change`. Native
  events from inner controls are re-emitted with `redispatchEvent`.
- Listeners, observers, timers and animation frames added in `connectedCallback` are removed in
  `disconnectedCallback`. An element can be moved, removed and re-added.
- Light and dark themes both, right-to-left where the component lays out text, and narrow widths.

## 4. Packaging and size

- A component imports Lit from `lit`, never from `lit-html`, `lit-element` or `@lit/reactive-element`. Siblings are
  imported through their published subpath (`@c2n/core/dom-helper.js`), never by a relative path across packages.
- **A new runtime dependency ships to every user.** Question it: size, maintenance, licence, and whether it must stay
  external in the umbrella bundle. `npm run check:bundle-size` must pass. A raised budget needs a reason in the PR.
- In `exports`, `"types"` comes first in every condition.
- A new component is registered everywhere the generator registers it, each at its alphabetical place.
- **Ratchet lists only shrink:** the dogfooding `KNOWN` list and `apps/ui/gallery-audit.known.json`. A new entry there
  needs a reason.
- Pinned dependencies (`@lit-labs/ssr`, the Linux native binaries) stay pinned, and in step with their parents.

## 5. Docs site and examples

- Docs and code samples import from `@c2n/components/<name>`, never `@c2n/<name>`. `apps/ui` never mixes a workspace
  import with the bundle.
- The site's chrome uses `c2-*` components (`npm run check:dogfood`). Box styles left on a host after replacing a native
  control draw a second frame.
- Gallery cards style a class in a fence-local `<style>`, with neutral colours through `--c2-theme--*` tokens and their
  own colours as `light-dark()` pairs (`npm run check:example-theme`). No "Dark" cards.
- Component MDX has no `# Title` line.

## 6. Security

- **Content is untrusted.** `unsafeHTML`, `innerHTML` and `unsafeSVG` may carry only constants (icons, glyphs) or the
  highlighter's escaped output (`c2-code-viewer`). Flag any of them fed with an attribute, a slot, pasted content or
  data.
- Editors (`c2-page-editor`, `c2-notepad`, the code editors) parse pasted HTML and markdown: links must not keep
  `javascript:` or `data:` URLs, and pasted content must not keep scripts, event handlers or `<style>`.
- Chart tooltips and labels built as HTML strings (ECharts formatters) escape the data they show.
- `@c2n/mcp` and `@c2n/skill` run in users' repositories. `validate` and its `PostToolUse` hook only read the files
  named. `c2n-skill install` only writes the files it lists, inside the project and its marker-delimited blocks, and
  never runs a downloaded script.
- Workflows: no `pull_request_target` running PR code, secrets (`NPM_TOKEN`) only on the release environment's job, and
  actions from outside `actions/*` pinned to a commit SHA. A workflow change that widens permissions or exposes a secret is a finding.

## 7. Tests

- A behaviour change comes with a Playwright test in the package's `test/` suite: a bug fix's test fails without the
  fix. Assert host semantics with `toHaveHostAria`, not `getByRole`.
- Language tests register their translations from `test/translations.ts`.
- Tests wait on a state, not on fixed timeouts, unless the wait is the behaviour itself.

## 8. Commits

Subjects are Conventional Commits with the package as scope (`fix(page-editor): …`), written for a user of the
component: they become `CHANGELOG.md` and the docs site's changelog. Flag an internal or vague subject on a `feat` or
`fix` commit.
