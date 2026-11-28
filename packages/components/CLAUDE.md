# Components

Guidance for `packages/components/*`. Claude Code loads this file when it works in this directory; the repo-wide rules are in the root `CLAUDE.md`. Paths are relative to the repository root.

## Layout

`packages/components/*` — the component packages: private workspaces, published only through the `@c2n/components` bundle (`packages/umbrella`). Each has `src/<name>.ts`, `src/<name>.scss`, `index.html` (standalone dev harness with hand-written usage examples), and a Vite lib build. `design-board` lives here too but is WIP and excluded from the root build graph. `json-form` (`c2-json-form` + `c2-json-field`) renders a form from a JSON Schema, laid out by a JSON Forms-style `ui-schema` or by author markup; its controls are pluggable renderers (`registerRenderer`, ranked testers) and render inside its shadow root.

`packages/components/google-map` → `@c2n/google-map` wraps the Google Maps JavaScript API: `c2-google-map` (the map; `.map` is the `google.maps.Map`), the child overlays `c2-google-map-marker` (an Advanced Marker whose `PinElement` colours are read from its `--c2-google-map-marker__*` variables when drawn) and `c2-google-map-route` (`Route.computeRoutes` + a `google.maps.Polyline`, colours read from `--c2-google-map-route__*`), and `c2-google-street-view` (a `StreetViewPanorama`, optionally the map's own through `for`). Children find their map with `closest('c2-google-map')` and await its `ready` promise, so they never import the map module. The API is loaded once per page by `src/google-maps-loader.ts` from `configureGoogleMaps({ apiKey })` or an element's `api-key`; a key configured after an element rendered makes it retry. The key is a browser key — there is nothing to hide server-side; it is restricted by referrer in the Google Cloud console. Google types come from `@types/google.maps` (a runtime dependency, so consumers' declarations resolve). The suite runs against `test/fake-google.ts`, a DOM-drawing stand-in for the API, so it needs no key or network. The docs site reads `PUBLIC_GOOGLE_MAPS_API_KEY` at build time (`apps/ui/src/data/google-maps-config.ts`, loaded by `Main.astro`); `deploy.yml` passes the `GOOGLE_MAPS_API_KEY` secret, falling back to a development key written in the workflow. Without any key the map examples say a key is needed.

## The manifest pipeline (JSDoc → docs UI)

This is the least obvious part of the architecture. `vite-plugin-cem` (plus `scripts/cem-plugin-customize`) analyzes each component during `vite build` and emits `<package>/custom-elements.json`. The UI app imports those manifests via `@c2n/<name>/custom-elements.json` in `apps/ui/src/store/component-manifests.ts`, normalizes them in `apps/ui/src/utils/manifest-utils.ts`, and renders both `<ApiTable>` and the live theming panel (`apps/ui/src/components/configuration/`) from them.

Consequences:

- Component JSDoc tags are the API documentation source of truth: `@tag`, `@slot`, `@event`, and `@cssproperty {type} [--name=default]`. Every CSS custom property a consumer may set must have a `@cssproperty` line, or it will not appear in the demo's API table or config panel.
- The customize plugin also rewrites a derived attribute name to the spelling Lit actually observes. The analyzer names an attribute after the field when `@property()` carries no explicit `attribute`, but Lit lowercases the property, so `readOnly` is observed as `readonly` and `maxLength` as `maxlength`. The manifest's `name` is the real attribute and `fieldName` keeps the property spelling; anything generating markup from a manifest must read `name`.
- The customize plugin drops an event whose name is an unresolved constant (`dispatchEvent(new CustomEvent(COLUMN_CHANGE_EVENT))` is recorded as `COLUMN_CHANGE_EVENT`): those are undocumented parent/child protocol events, not public API. A public event needs an `@event` line with its real name.
- The custom plugin adds two non-standard tags: `@internalcomponent` and `@slotcomponent`, used by the demo to document composed/slotted children.
- After changing a component's public surface, rebuild that package so its `custom-elements.json` is regenerated; committed manifests are checked in.
- A new component must be added by hand (or by plop) to `apps/ui/src/store/component-manifests.ts` in both the import list and the `normalizedManifests` array.

## Component foundation

Six rules decide the shape of every component's public API. **Read `docs/agents/component-foundation.md` before designing a component or adding a feature to one**: it has each rule in full (slot and part conventions, the renderer signature, the three data forms and `dataSource`, action zones, message tokens, gallery proof), their scope, and when a variant becomes a companion element.

| Concern      | Mechanism                                                                 | Not                                                    |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Presentation | `--c2-*` CSS variables                                                    | a `size`/`color`/`variant` attribute for a look        |
| Extension    | named slots (wrapper exported as a `part`), then `render<Part>` functions | a flag or enum per content variation, a forked copy    |
| Data         | declarative markup **and** an in-memory property, plus a `dataSource`     | a property-only API, or a fetch built into the element |
| Actions      | an action zone: a named slot the app fills, plus methods and events       | a built-in button, flag and event per command          |
| Text         | message tokens in `src/messages.ts`, translated by the app                | a string literal in the template                       |
| Proof        | a live card in the component's gallery (`apps/ui/src/content/gallery/`)   | a feature that exists only in the API table            |

## Reachable through MCP and llms.txt

**Every component is reachable by a coding agent through the `@c2n/mcp` server and the docs site's `/llms.txt`**: a served docs page with a `description` and 3–5 `intents`, a complete manifest, and an `@c2n/components` entry. `pnpm run check:reachability` enforces it. The details are in `docs/agents/adding-a-component.md`.

## Theming convention

Every component is themed exclusively through CSS custom properties generated by `packages/tools/sass/css-variable.scss`. A component's SCSS opens with:

### CSS variables before presentation attributes

When creating or updating a component, **prefer CSS custom properties over HTML attributes or JavaScript properties for every presentation concern**. Before adding a public `@property`, ask whether CSS can express the value; if it can, expose it only as a documented `--c2-*` custom property.

- CSS variables own visual presentation: dimensions, spacing, colors, typography, borders, radii, shadows, opacity, transforms, decorative placement, and animation values such as duration, delay, size, line width, and outset.
- Attributes/properties own behavior and semantics: form values, selection, disabled/required state, data, accessibility, interaction modes, and choices that change the component's behavior or rendered structure.
- Do not expose the same presentation setting as both an attribute/property and a CSS variable. The CSS variable is the public API.
- Keep existing presentation attributes only when backward compatibility requires them; do not add new ones. Removing or migrating an existing public attribute requires explicit authorization for the breaking change.
- Every public CSS variable must be declared with `@cssproperty`, use the repository naming convention, and have its default in the SCSS `$theme` map.

```scss
@use '@c2n/sass/css-variable' as css with (
  $prefix: c2-checkbox,
  $theme: (
    container--width: 18px,
    checkmark--color: #ffffff,
    ...,
  )
);
```

then reads values as `css.cssVar(container--width)`, which expands to `var(--c2-checkbox__container--width, 18px)`. The name shape is meaningful and parsed by the demo (`manifest-utils.ts` splits on `--` then `__`):

`--<prefix>__<block>[__<state>]--<css-property>`

`__` separates the component prefix / element part / state (`__selected`, `__hover`); `--` separates the final CSS property name. Nested-state names like `container__selected--background-color` group into the demo's configuration panel automatically. Defaults live in the `$theme` map (not in the rule bodies) and must be mirrored in the `@cssproperty` JSDoc default.

**Design tokens (`@c2n/theme`).** On top of the component variables, `packages/tools/theme` defines ~35 shared tokens named `--c2-theme--<name>` (same grammar, pseudo-component prefix `c2-theme`, no part segment: `--c2-theme--color-primary`, `--c2-theme--radius-md`, `--c2-theme--border`, `--c2-theme--focus-ring`, …). The generated `base.css` sets every mapped component variable to `var(--c2-theme--<token>, <component default>)` at `:root`/`:host`, so an app themes everything by setting the tokens while any component variable set explicitly still wins. Component SCSS stays untouched. The generator maps by property name + default literal (colour ramp, border shorthands, radii 4/6/8/14/999px, font sizes 12/14px, weights 500/600, focus outlines, disabled opacity, durations, shadows); use the existing literals/scales in new components so they get mapped, and add an entry to `overrides.ts` for deliberate exceptions. Dark mode: `tokens.css` puts light values on `:root`, dark under `[data-theme='dark']` / `.c2-dark` and the `prefers-color-scheme` fallback.

## Changing a component

Before changing an existing one, open `docs/agents/changing-a-component.md`: one checklist per kind of change (attribute, CSS variable, slot, event, built-in text, bug fix), with what each needs beyond the source (manifest, framework glue, style-contract case, slot audit, gallery proof, readiness) and the commands that verify it.

## Adding a component

Scaffold with `pnpm run generate` and follow the `new-component` skill; `docs/agents/adding-a-component.md` says what the generator wires, what is left to fill in, and how a new component becomes reachable through MCP and `/llms.txt`.

## Component conventions

### Skeleton

Every component starts from this shape, which `pnpm run generate` writes (from `scripts/generator/files/wc/src/`) for a component named "Note Panel" (a made-up name: there is no `c2-note-panel`). `pnpm run check:component-template` (a `component-tests.yml` gate) renders that template, type-checks, lints and compiles it, and fails if a code line below no longer matches it, so this block and the generator cannot drift apart.

```ts
import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { notePanelMessages } from './messages'
import styles from './note-panel.scss?inline'

/**
 * @tag c2-note-panel
 * @slot - The content.
 * @slot actions - Commands the application adds (an action zone); hidden while empty.
 * @csspart content - The wrapper of the default slot.
 * @csspart actions - The wrapper of the `actions` slot.
 * @cssproperty {length} [--c2-note-panel__container--gap=8px] - Space between the content and the actions.
 */
@customElement('c2-note-panel')
export class NotePanel extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, notePanelMessages)
  private readonly slots = new SlotPresenceController(this, ['actions'])

  @property() label = ''

  protected override updated(): void {
    this.internals.role = 'group'
    this.internals.ariaLabel = this.label || this.msg.t('label')
  }

  override render() {
    return html`
      <div class="content" part="content"><slot></slot></div>
      <div class="actions" part="actions" ?hidden=${!this.slots.has('actions')}>
        <slot name="actions" @slotchange=${this.slots.handleSlotChange}></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-note-panel': NotePanel
  }
}
```

with `src/messages.ts` (`export const notePanelMessages = defineMessages('note-panel', { label: 'Note panel' })`) and `src/note-panel.scss` (the `$theme` map holding `container--gap: 8px`, read as `css.cssVar(container--gap)`). What it shows: the `@c2n/core` imports, host semantics through `internals` and never a host attribute, text through a message with an empty-default property falling back to it, a slot region wrapped in a documented `part` and hidden while empty, and a variable with its default in `$theme` and its `@cssproperty` line. The rules behind each line are the list below.

### Reference components by kind

The skeleton covers what every component has. For the patterns only some need, copy the component that does it, not a component of another kind (a badge built from `c2-checkbox` drags the form machinery along):

| The component…                                         | Reference                          | What to copy                                                                                                               |
| ------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| is a form control                                      | `c2-checkbox`, `c2-text-field`     | form association, `FieldContextConsumer`, `formDisabledCallback`/`formStateRestoreCallback`, `redispatchEvent`, `EventMap` |
| displays a collection                                  | `c2-table`, `c2-virtual-list`      | declarative children and JSON attribute, the in-memory property, `dataSource` with loading/empty/error slots               |
| draws content per item                                 | `c2-tree`, `c2-steps`              | `render<Part>` renderers taking one context object, narrow renderers beside the whole-item one                             |
| has a toolbar, header or footer for the app's commands | `c2-page-header`, `c2-table`       | action-zone slots hidden while empty, their wrapper parts, the methods and events an action needs                          |
| routes light-DOM children into per-item slots          | `c2-masonry`                       | `slotAssignment: 'manual'` with `assignSlot`, the declarative-shadow-root fallback                                         |
| announces itself as a group with a name                | `c2-audio-player`, `c2-action-bar` | `internals.role`/`internals.ariaLabel`, a `label` property falling back to a message                                       |

### Rules

- `@customElement('c2-<name>')`, styles via `import styles from './<name>.scss?inline'` + `static override styles = unsafeCSS(styles)`.
- `noImplicitOverride` is on — `override` is required on `render`, `update`, `styles`, `focus`, inherited ARIA props, etc.
- Always declare the tag in `declare global { interface HTMLElementTagNameMap }`.
- Re-emit native events from inner form controls with `redispatchEvent` from `@c2n/core/dom-helper.js` rather than constructing new events.
- **Never write an attribute on the host from the component** (`role`, `aria-*`, or anything else the author did not write). Under SSR (Next.js, React Router) the element upgrades before React hydrates, and React reports every attribute the server did not render as a hydration mismatch. State the host's own semantics through `private readonly internals = this.attachInternals()` (`this.internals.role`, `this.internals.ariaSelected`, `this.internals.ariaControlsElements`, …); an author-set attribute still wins in the accessibility tree. Keep the field named `internals`, which is where axe looks for it. Playwright's `getByRole`/`toHaveAttribute` do not read internals, so tests locate hosts by tag and assert with `toHaveHostAria` from `tests/component-fixture.ts`. The roving `tabindex` (tabs, list, menu, tree) and tooltip's `popover` still live on the host: internals has no equivalent.
- **The same holds for light-DOM children: never write `slot` on them to route them into per-item slots.** Create the shadow root with `slotAssignment: 'manual'` and put `assignSlot([node])` from `@c2n/core/lit-helper.js` on each `<slot>` (`c2-masonry`, `c2-reorder-list`, `c2-breadcrumb`; `c2-tabs` assigns by hand). Manual assignment also bypasses author-facing named slots (`placeholder`, `dragging-item`, `separator`), so route those children through `assignSlot` as well. A declarative shadow root is always in named mode, so check `shadowRoot.slotAssignment` and fall back to writing `slot` there.
- **A component rendered inside another component's server-rendered shadow root hydrates after its parent**, and anything the parent or a sibling writes on it before that (a field's label, a list's position or orientation) makes its first client render differ from the server's: a Lit hydration mismatch. Defer such writes until the receiver's first update when it was server-rendered (`this.shadowRoot !== null` in the constructor means a declarative shadow root): `FieldContextConsumer.attach`, `c2-form-field`'s control adoption and `c2-steps`' sync do. The docs site is the test bed: `c2-json-form` renders every control inside its own shadow root.
- **What to do instead of a reactive write in `firstUpdated()`** (such a write schedules a second update from inside the first, which Lit warns about; `pnpm run check:lifecycle` also follows the methods and arrow-function fields `firstUpdated()` calls synchronously, and counts an array method's callback as synchronous, but not another callback, which runs later):
  - State the first render needs and the browser knows before rendering (what it supports, a media query, a value read from the light DOM): set it in `willUpdate()` while `!this.hasUpdated`, guarded by `isServer` from `lit`. No second update.
  - A server-rendered element's hydrating render must draw what the server drew, so skip that while the controller's `hydrating` (server-rendered, first update still to come) is true and read the state once it has hydrated: `private readonly hydration = new SlotReplayController(this, () => this.detectSupport())` (`@c2n/core/lit-helper.js`) runs the handler after the hydrating update completes. `c2-video-player` (`detectSupport()`) does both; `test/hydration.spec.ts` in `month-planner` or `video-player` is the test to copy.
  - State that depends on the rendered shadow DOM (a size, a measurement): write it from a callback that runs after the first update, such as `void this.updateComplete.then(() => …)` in `firstUpdated()`, or an observer's callback.
  - Slot presence: `SlotPresenceController` (the skeleton above), or `SlotReplayController` beside the `@slotchange` handler.
- **A reflected property's default is not reflected.** `customElement` from `@c2n/core/element-helper.js` keeps a `reflect: true` property that still holds its class-field default off a host that does not carry the attribute (Lit would otherwise write `type="button" name=""` on upgrade, which React reports as a hydration mismatch). A value that was set, and an attribute already present, reflect as before. So write default-state styles against the attribute's absence as well — `:host([side='right']), :host(:not([side]))` — or on a class inside the shadow root; never rely on `:host([size='m'])` matching a bare element.
- Expose customization points as named `<slot>`s with inline SVG defaults (see the checkmark/mixedmark/uncheckmark slots).
- `@typescript-eslint/no-explicit-any` is an error; `noUnusedLocals`/`noUnusedParameters` are on (prefix intentionally unused args with `_`).
- Import `customElement` from **`@c2n/core/element-helper.js`**, not `lit/decorators.js`. It keeps the first definition and warns instead of throwing when a tag is already registered (two copies of a package, two micro-frontends, a hot reload), and when an element carries the lowercased spelling of a camelCase property whose attribute is kebab-case (`rowkey` for `rowKey`) it forwards the value to the real attribute and warns — the silent no-op a static attribute in an Angular or HTML template, or a server-rendered React prop, produces. `packages/icons/*` has its own older `safeCustomElement` doing the first half.
- Import `property` from **`@c2n/core/lit-helper.js`**, not `lit/decorators.js`. It gives every `type: Boolean` property a converter that reads the literal strings `"false"` and `"0"` as false — Lit's default is presence-based, so a framework that stringifies an attribute (Svelte 5, any server renderer) would turn the flag _on_ by writing `disabled="false"` — and it lets a converter declaring `fromProperty` (`jsonPropertyConverter`, `arrayPropertyConverter`) also parse a string assigned straight to the property, so `JSON.stringify(rows)` is one binding that works as an attribute on the server and as a property on the client. `type: Number` gets `numberPropertyConverter` the same way, so the `precision = "0"` Svelte 5 assigns for a static attribute is stored as `0`. An explicit `converter` always wins. A `type: Boolean` property that is `boolean | undefined` is tri-state for free: absent inherits, `"false"` opts out.
- A component that fires events declares them, next to the class, as an exported `<Class>EventMap` merged into the class through `TypedAddEventListener`/`TypedRemoveEventListener` from **`@c2n/core/event-helper.js`**; the map's entries must match the `@event` JSDoc, which is what the manifest and the generated Vue types read. Merging via `extends` does not compile (an interface merged onto a class may not extend a second type that redeclares `HTMLElement.addEventListener`), hence the two property signatures. `EventMapOf<T>` recovers a component's map for generic code. There is no global `HTMLElementEventMap` augmentation on purpose: `selection-change` carries a different detail on each of the five components that fire it. `@typescript-eslint/no-unsafe-declaration-merging` is off for this idiom.
- **A form control takes part in the field protocol** (`@c2n/core/contexts/field.js`): `private readonly field = new FieldContextConsumer(this, { kind })` in the class, then `this.field.label` as the fallback accessible name of the focusable element, `aria-describedby=${this.field.describedBy(...ownIds)}` on it with `${this.field.renderDescription()}` in the same shadow root, `aria-invalid` and the error look while `this.field.invalid`, and its own hint/error/counter line hidden while `this.field.managed`. That is how `c2-form-field` names and describes a control it cannot reach by id (the focusable element is in the control's shadow root); nothing is written on the host. `kind` picks the built-in message (`text`, `choice`, `check`); `selfLabelled: true` keeps a checkbox's or switch's own text as its name. A new form-associated control must do the same, and the matrix test in `packages/components/form-field/test/` lists it.
- **`selection-change` does not bubble** (`c2-list`, `c2-select`, `c2-table`, `c2-tabs`, `c2-virtual-list`). A bubbling one reaches a listener meant for the component it is nested in — a select in a tab panel reads as a tab switch, which is the bug `c2-tabs` had while its event was called `change`. Listeners go on the element itself. A form-associated component also fires plain `input`/`change` alongside its semantic event, because that is what `v-model`, a `ControlValueAccessor` and any generic two-way binding listen for. Those plain events bubble, so a control the app puts in another control's slot (a checkbox in a text field's `suffix-icon`) fires its `input`/`change` through that host too. **A listener on a form control checks `event.target === control`** to tell the control's own edit from one that bubbled out of its slots (`c2-form-field` and the generated `@c2n/angular` accessors do). A control's own events must therefore target its host: a shadow root retargets its inner input's event, and a group swallows its options' `input`/`change` and dispatches its own (`c2-radio-group`, `c2-checkbox-group`). A host whose `change` carries a typed `detail` may also stop the slotted controls' events at the slot's wrapper, so its own listeners never see another shape (`c2-date-selector`'s `footer`).
- In `exports`, `"types"` comes **first** in every condition object; `"default"` first makes esbuild warn that the types condition is unreachable.
- **Built-in text is in English, and translatable.** A component never hard-codes interface text (visible labels, `aria-label`s, live-region announcements, validation messages, default slot content): it lists it in `src/messages.ts` as `const en = {…}` (a function for text with values; called with `{0}`, `{1}`… it must read as the template a translation writes), registered with `defineMessages('<package>', en)` from `@c2n/core/localize.js`, and renders it through `private readonly msg = new LocalizeController(this, …)` and `this.msg.t(key, …args)`. Components ship English only: apps add their languages with `addTranslations({ fr: { '<package>': {…} } })` (JSON: `{0}` placeholders, plural and keyed choice objects) or `addMessages`, and the docs list every message on the component's API tab. Language tests register their translations from `test/translations.ts`. The language is the nearest `lang` attribute (through shadow roots), else the browser's; the host redraws when any `lang` changes. A public property whose default is text keeps an empty default and falls back to the message at render time (`this.label || this.msg.t('label')`). The exception is a property where `''` must stay "show nothing" (`c2-table`'s `empty-message`, `c2-description-item`'s `empty-text`): it is `prop?: string`, unset falls back with `??` (`(this.emptyMessage ?? this.msg.t('empty')) || nothing`), and its JSDoc says so; reading it while unset gives `undefined`, not the text. Text drawn outside Lit (ProseMirror views, CodeMirror, imperative DOM) must follow a language switch too; `Intl`-only components use `LocaleController`.

## Modern web platform

Components use the current platform, not the patterns it replaced. The `modern-web-review` skill
(`.claude/skills/modern-web-review/`) holds the guide map, the old → new pattern table and the scanner; read it when
designing, implementing or reviewing a component.

**Browser support policy.** The components support the latest two stable versions of Chrome, Edge, Firefox and Safari
(desktop and iOS), and nothing older. Check a feature against those versions, not against its Baseline label: a
_Newly available_ feature that all of them ship is used freely. A feature that one of them lacks (often _Limited
availability_) is only a progressive enhancement over a path that works in all of them, feature-detected, and never
through a polyfill. Write no fallback, polyfill or test for an older browser. Say which applies whenever a change
adopts a platform feature.

**Before choosing an approach**, look the behaviour up: `npx -y modern-web-guidance@latest search "<what it must do>"`,
then `retrieve` the guide and follow its rules and fallbacks.

**Rules that hold everywhere** (each was a bug the 2026-11 platform audit found in shipped components):

- An Enter handler on a text field returns early on `isComposingKey(event)` (`@c2n/core/dom-helper.js`).
- Focus drawn without an outline also has `@include focus.forced-colors-ring` (`@use '@c2n/sass/focus'`), so it
  survives Windows High Contrast; a visible focus style keys on `:focus-visible`, not `:focus`.
- Collapsed or inactive content stays findable by find-in-page: `<details>`/`::details-content` or
  `hidden="until-found"`, never `display: none` or an unrendered slot.
- No HTML string sinks (`innerHTML`, `insertAdjacentHTML`), constants included: render with Lit or clone a
  `<template>`, so pages enforcing Trusted Types work.
- Semantics that cross a shadow boundary use element references (`ariaDescribedByElements`, `ariaLabelledByElements`),
  not ids; nothing is written on author light-DOM children (the host rule above, extended to children).
- A layer that must show above an open modal lives in the top layer (`popover`), not `position: fixed` + `z-index`.
- A canvas has a name and a text alternative; a long list is virtualized or `content-visibility: auto`; a live feed
  pauses off-screen.
- `formDisabledCallback` keeps a disabled ancestor fieldset in effect even when the control carries its own
  `disabled` attribute; a form control implements `formStateRestoreCallback` and anchors `setValidity`.

`node .claude/skills/modern-web-review/scripts/scan.mjs` checks the lines a branch changed for these patterns (exit 1
on an error); a deliberate exception carries a `// modern-web-ignore: <rule> <reason>` comment.
