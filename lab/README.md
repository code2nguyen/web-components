# Component lab

The lab uses c2n components the way a real product does, then tests that product the way people use it. It has two
goals:

1. **Find component bugs**: problems a component's own suite misses because they only show up in a real app, with real
   input, a keyboard, a phone, a screen reader, dark mode or another language.
2. **Collect API feedback**: friction an app builder hits (workarounds, missing hooks, confusing defaults), filed in
   [`COMPONENT-FEEDBACK.md`](../COMPONENT-FEEDBACK.md).

It runs without a person. An agent (Claude Code, through the [`component-lab` skill](../.claude/skills/component-lab/SKILL.md))
explores and triages. The **oracles** below decide what counts as a finding: they are deterministic, so every finding
can be replayed and confirmed instead of trusted.

## Pieces

| Path                       | What it is                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `targets/<name>.json`      | A target: the app (today an `apps/examples/*` app), its URL, how to start it, and its **journeys** |
| `scripts/lab.mjs`          | The runner: every journey × every persona, the oracles watching                                    |
| `scripts/lib/personas.mjs` | Who is using the app, and how a step becomes real input for them                                   |
| `scripts/lib/steps.mjs`    | The journey step language                                                                          |
| `scripts/lib/oracles.mjs`  | Console, uncaught errors, failed requests, axe, overflow, the focus indicator check                |
| `scripts/lib/ax-tree.mjs`  | Chrome's accessibility tree (what a screen reader gets), and the checks read from it               |
| `known.json`               | Findings already triaged (`key → reason`): a ratchet, it only shrinks as components get fixed      |

## Run it

```bash
npm run build -w apps/examples/support-inbox-vue       # the app and the components it uses (wireit-cached)
node lab/scripts/lab.mjs list                          # targets, journeys, personas
node lab/scripts/lab.mjs run support-inbox-vue         # every persona × every journey
node lab/scripts/lab.mjs run support-inbox-vue --personas keyboard --journeys filter --repeat 3
node lab/scripts/lab.mjs run support-inbox-vue --personas mouse --steps my-steps.json --aria   # ad-hoc exploration
```

The runner starts the app's dev server when nothing answers at the target URL. In a container with a preinstalled
Chromium, set `CHROMIUM_PATH` (the session-start hook does). Output goes to `test-results/lab/<target>/`:
`report.md`, `findings.json`, `shots/` (end-of-journey screenshots, failure and focus clips) and `snapshots/`
(accessibility trees). The exit code is 1 when a **new, reproducible** finding appears.

## Personas

| Persona    | Set-up                                       | Input                                                                              |
| ---------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `mouse`    | desktop 1280×800                             | pointer clicks (Playwright hit-tests them), typing key by key                      |
| `keyboard` | desktop 1280×800                             | Tab to a control, arrow keys inside a widget, Enter/Space; checks every focus ring |
| `mobile`   | Pixel 7, touch                               | taps                                                                               |
| `dark`     | `prefers-color-scheme: dark`, `data-theme`   | pointer                                                                            |
| `fr`       | `fr-FR` locale, Paris time zone, `lang="fr"` | pointer                                                                            |

No step calls `el.click()` or assigns `.value`. Those shortcuts hide real bugs (a host that ignores a click, an overlay
that catches it), so every action goes through the browser's input pipeline.

## Journeys

A journey is a user task written as steps that name what a person **sees**, never a path into a shadow root:

```json
{ "fill": { "role": "textbox", "name": "Reply" }, "text": "Thanks!" }
{ "click": { "ax": "option", "name": "Closed", "exact": true } }
{ "expect": { "visible": { "text": "Reply sent." } } }
```

Steps: `goto`, `click`, `fill` (+ `text`), `press`, `type`, `hover`, `wait`, `snapshot` (+ label) and `expect` with
`visible` / `hidden` / `focused` / `count` (+ `equals`) / `text` (+ `contains`) / `value` (+ `equals`).

Targets, most faithful first:

- `{ ax, name }`: the role and name from Chrome's accessibility tree. Use it for every role a component states through
  `ElementInternals` (c2-list rows are `option`s, c2-sheet is a `dialog`). Playwright's `getByRole` cannot see those
  roles, so a check built on it reports bugs that are not there.
- `{ role, name }`, `{ label }`, `{ placeholder }`, `{ text }`: Playwright's locators.
- `{ css }`: last resort. Needing it is itself worth a note: the thing has no accessible handle.

Any target takes `nth` and `within`. A journey can list `personas` to run for only some of them.

## Oracles

| Kind                                                                          | Fires when                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `journey-broken`                                                              | a step could not be done or an expectation failed: the task did not work for this persona                    |
| `keyboard-unreachable`                                                        | neither Tab nor the arrow keys reach a control                                                               |
| `focus-invisible`                                                             | moving focus onto a control changes no pixel of it (compared across the component's whole box)               |
| `a11y-tree`                                                                   | the screen reader tree has something a person would notice: a name read twice, an invisible disabled control |
| `axe`                                                                         | an axe-core violation, attributed to the innermost `c2-*` host                                               |
| `overflow`                                                                    | the page scrolls sideways                                                                                    |
| `console-error` / `console-warning` / `uncaught-exception` / `request-failed` | what it says; warnings only when they mention a component, Lit or ARIA                                       |

Each finding is keyed `<target>/<kind>/<component>/<rule>` and merged across personas and journeys. Run with
`--repeat N` to separate reproducible findings from flaky ones.

## Adding a target

Write `targets/<name>.json` for any app under `apps/examples/` (or a new clone app built only from c2n): its URL, the
dev server command, the components it uses, and journeys covering the tasks a person does there. Start with a
`--aria` run of `[{ "goto": "./" }]` to read the accessibility tree, then write steps against the names you see.
