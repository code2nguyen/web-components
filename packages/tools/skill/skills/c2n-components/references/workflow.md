# The c2n application workflow

Build screens from `@c2n/*` web components with as little code as possible. Three layers, applied in this order.

## 1. Theme once

- Install `@c2n/theme` next to the component packages you use.
- Import `@c2n/theme/theme.css` once at the application root (tokens + base theme). If the app already owns a token system, import only `@c2n/theme/base.css` and bridge your tokens onto the `--c2-theme--*` names.
- Override the tokens that differ from the defaults on `:root` (light) and under your dark-mode selector. About 35 tokens (`--c2-theme--color-primary`, `--c2-theme--radius-md`, `--c2-theme--font-family`, `--c2-theme--focus-ring`, …) drive every component.
- Never set component variables globally when a token exists for the job.

## 2. Use the tags directly

- Register an element with a side-effect import (`import '@c2n/button'`) at the application entry, or in the module that renders it.
- Write plain markup: `<c2-button>Save</c2-button>`. Attributes, slots and events come from the component API (MCP `get_component`, or `node_modules/@c2n/<name>/custom-elements.json`).
- Icons are components: `c2-feather-<name>` from `@c2n/feather-icons/icons/<name>.js`, sized and coloured through `--c2-feather-icon--size|color|stroke-width`.
- A component that appears once with the themed default look needs nothing else.

## 3. Name what repeats

The decision rule, cheapest first:

| Situation                                                                         | Do this                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The element appears once, default look is fine                                    | plain tag                                                                                                    |
| Same look repeats, markup is otherwise plain                                      | **CSS-class variant**: a class that sets `--c2-<component>__…` variables                                     |
| Same look **and** the same attributes / slots / accessible name repeat            | **wrapper component** in your framework (Astro/React/Vue/Lit) that renders the c2 element                    |
| The variant must be its own tag (used from strings, other Lit templates, shipped) | **Lit subclass** of the component with the variables baked into `static styles`                              |
| Several c2 components plus some logic repeat                                      | **composed component**: children's variables set on `:host`/a class, attributes forwarded, events re-emitted |
| No c2 component fits                                                              | app-level component styled with the same `--c2-theme--*` tokens; never fork a package                        |

Every variant lives in one directory (`src/components/ui/`, `src/ui/`…), one file per variant, under the app's own prefix (`app-*`, `site-*`, `my-*`), never `c2-*`.

## 4. Verify

- Every element used is registered (no `HTMLUnknownElement`, no empty tags).
- `@c2n/theme` is imported exactly once; tokens overridden on `:root` and the dark selector.
- No `::part()` selectors (the components do not expose parts), no repeated inline `style="--c2-…"`.
- Every variable, attribute, slot and event name exists in the component API.
- Variant tags contain a hyphen and do not start with `c2-`.
- Light and dark both look right; build, lint and type-check pass.
