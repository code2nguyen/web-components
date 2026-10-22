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
- `storage-key="…"` remembers the progress in `localStorage` (`{ status, step }`, read it from `progress`);
  `autostart` then opens the tour on the first visit, resumes the stored step after a reload and stays closed once
  finished or skipped. `reset()` forgets it.
- Skip, the close button and Escape all end the tour early; `--c2-tour__skip--display: none` hides the Skip button.
- A step without a target, or whose target is missing, shows centred over the dimmed page.
- Style the panel through `--c2-tour--*`, the dimming through `--c2-tour__backdrop--color` and the cut-out through
  `--c2-tour__spotlight--*`. The API page lists every variable.
