# @c2n/progress

Progress built with Lit: a linear bar, indeterminate by default or filling to a value, with an optional label and count.

```bash
npm install @c2n/progress
```

```html
<script type="module">
  import '@c2n/progress'
</script>

<c2-progress></c2-progress>
<c2-progress>Uploading files</c2-progress>
<c2-progress value="65" show-value>Uploading files</c2-progress>
<c2-progress value="3" max="5">Onboarding<span slot="value">Step 3 of 5</span></c2-progress>
```

- **Indeterminate**: a short indicator sweeps the track; `--c2-progress--animation-duration` sets one cycle.
- **Determinate**: `value` (out of `max`, default 100) fills the track from the start edge and animates between values; clear it to sweep again.
- **Label and count**: slotted text sits above the track and is the accessible name; without it, `label` (default "Loading") names the bar. `show-value` prints the percentage on the opposite side, and the `value` slot replaces that text for counts such as "3 of 5" or "1.2 / 4 MB". The label row is absent entirely when there is neither, so a bare bar is exactly `--c2-progress--height` tall.
- **Accessibility**: the track is `role="progressbar"` with `aria-valuenow` when determinate. The printed count is presentational, so it is free to differ from the announced number.
- **Reduced motion**: the sweep slows and drops its easing, and the determinate fill jumps instead of transitioning.

Theme it with `--c2-progress--height`, `--c2-progress--width`, `--c2-progress--border-radius`, `--c2-progress__track--background-color`, `--c2-progress__indicator--background-color`, `--c2-progress--gap` and the `--c2-progress__label--*` / `--c2-progress__value--*` text variables. The full list is in `custom-elements.json` and on the docs site.

Reach for [`@c2n/spinner`](../spinner) when the wait has no natural width to fill.
