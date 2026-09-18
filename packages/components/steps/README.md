# @c2n/steps

A vertical list of steps: the trace of a task as it runs, or a wizard's progress.

A step with sub-steps is a **group**, and a group is a disclosure — its own row is the summary, its sub-steps are
the detail. Every step is a row and every row is visible: a group starts expanded and nothing folds one away on its
own. A sub-step is indented until its marker sits under its parent's label, and that is the whole tree — no chevron
column, no rules, unless you ask for them. `collapsed` in the markup starts a stage folded, and the run only ever
brings a folded stage back into view when it starts running or something in it fails.

A parent that authors no `status` takes the most urgent one under it, so a stage reports that it is running, or
that something below it failed, on its own.

```bash
npm install @c2n/steps
```

## Markup

```html
<script type="module">
  import '@c2n/steps'
</script>

<c2-steps aria-label="Pipeline">
  <c2-step label="build" trailing="24 s">
    <c2-step status="success" label="install dependencies" trailing="19 s"></c2-step>
    <c2-step status="success" label="compile" trailing="5 s"></c2-step>
  </c2-step>
  <c2-step label="test">
    <c2-step status="success" label="unit" trailing="8 s"></c2-step>
    <c2-step status="running" label="e2e"></c2-step>
  </c2-step>
</c2-steps>
```

## Data

```js
const trace = document.querySelector('c2-steps')

trace.steps = [
  { id: 'build', label: 'build', children: [{ id: 'install', label: 'install dependencies' }] },
  { id: 'test', label: 'test', children: [{ id: 'e2e', label: 'e2e' }] },
]

// One step at a time, without rebuilding the array.
trace.updateStep('install', { status: 'running' })
trace.updateStep('install', { status: 'success', trailing: '19 s' })
```

`collapseAll()` folds every group away and `expandAll()` brings them back; a `step-toggle` event bubbles to the
list whenever a group is folded or unfolded.

A step that arrives while the list is already on screen grows into place, and a marker gives one beat as its
status settles — both only for things that actually change, so a trace drawn complete sits still.
`--c2-step--enter-duration: 0s` turns the arrival off and `prefers-reduced-motion` turns both off. Give every node
a stable `id`, or a step is identified by its position and inserting one recreates every row after it.

Everything the markup fills with a slot, the data-driven mode fills with a renderer handed the same node: `marker`
→ `renderMarker`, `label` → `renderLabel`, `detail` → `renderDetail`, `trailing` → `renderTrailing`, `toggle` →
`renderToggle`, plus `renderItem` for a row's text all at once. The marker and the disclosure are their own
columns, so they keep their renderers alongside `renderItem`.

Statuses are `pending`, `current`, `running`, `success`, `error`, `warning` and `skipped`. `marker` is `icon`
(default), `number` — which draws a dotted path, so `3.1` is the first sub-step of the third step — or `none`.
`current` is the wizard shortcut: the index of the active top-level step.

Everything visual is a CSS custom property; the full list is in `custom-elements.json` and on the docs site.
