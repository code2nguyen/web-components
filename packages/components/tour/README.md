# Tour

`c2-tour` is a guided product tour: it spotlights one element of the page at a time and explains it in a panel
beside it. Each stop is a `c2-tour-step` child naming its `target` (a CSS selector), a `heading` and its explanation.

`c2-tour` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/tour'
```

```html
<c2-tour>
  <c2-button slot="trigger">Take the tour</c2-button>
  <c2-tour-step heading="Welcome">A quick look around.</c2-tour-step>
  <c2-tour-step target="#search" heading="Search">Find anything from here.</c2-tour-step>
  <c2-tour-step target="#filters" heading="Filters" placement="right">Narrow the results.</c2-tour-step>
</c2-tour>
```

- Start it with the `trigger` slot, the `open` attribute or `start(index)`; move with `next()`, `previous()`,
  `goTo(index)`; end it with `finish()` or `skip()`.
- Events: `step-change` (`{ index, previous }`), `finish`, `skip` (`{ index }`), `show`, `hide`.
- `storage-key="…"` remembers the progress in `localStorage` (`{ status, step, skips, skippedAt }`, read it from `progress`);
  `autostart` then opens the tour on the first visit, resumes the stored step after a reload and stays closed once
  finished or skipped `skip-limit` times (default 1; below it a skipped tour reopens from the first step, `0` never
  gives up), waiting `skip-delay` (`30m`, `12h`, `7d`, `2w`) after each skip. `reset()` forgets it.
- Skip, the close button and Escape all end the tour early; `--c2-tour__skip--display: none` hides the Skip button.
- A step without a target, or whose target is missing, shows centred over the dimmed page.
- Style the panel through `--c2-tour--*`, the dimming through `--c2-tour__backdrop--color` and the cut-out through
  `--c2-tour__spotlight--*`. The API page lists every variable.

## Beacon

`c2-beacon` is the tour's companion for tips that stand alone: a pulsing dot on each `c2-tour-step` target that opens
the step in the tour's panel when clicked, with no order, no progress and no dimming.

```js
import '@c2n/components/tour/beacon'
```

```html
<c2-beacon storage-key="reports-tips-v1">
  <c2-tour-step id="tip-export" target="#export" heading="Export to CSV">Download any view as a spreadsheet.</c2-tour-step>
  <c2-tour-step id="tip-share" target="#share" heading="Share a link">Anyone with the link sees a read-only copy.</c2-tour-step>
</c2-beacon>
```

- Got it dismisses a tip (`dismiss` event, `{ index, key }`) and moves focus to its target; the close button, Escape and
  a click outside close it and keep the dot.
- `storage-key` remembers the dismissed tips in `localStorage` (`{ dismissed: [...] }`, read it from `dismissed`), keyed
  by each step's `id` (give it one of its own, not its target's), else its index; `reset()` brings them back.
- Style the dot through `--c2-beacon__dot--*` and its pulse through `--c2-beacon__pulse--*`; the panel takes the
  tour's `--c2-tour--*` variables.
