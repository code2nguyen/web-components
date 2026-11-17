---
name: component-lab
description: Run the component lab (lab/) against an app built with c2n components, test it like a person would (mouse, keyboard only, phone, dark mode, French, screen reader tree), explore beyond the scripted journeys, and triage the findings into component bugs, API feedback and app issues. Use when asked to run the lab, test an example app like a user, hunt for component bugs in real usage, or add a lab target or journeys.
argument-hint: '<target> [--personas …] [--explore]'
---

# Component lab

Read `lab/README.md` first: it documents the runner, the personas, the step language and the oracles. Running the lab
is an explicit request to drive a browser, so the CLAUDE.md "Browser usage" rule does not forbid it here.

The lab has two goals. Keep both in view:

1. **Component bugs**: confirmed by an oracle and reproducible.
2. **Feedback**: what was awkward, missing or surprising when using the components, even when nothing is broken.

## 0. Build from a spec (when asked to build, or when a spec has no build)

1. Read the spec (`lab/specs/**/<id>.md`) and `lab/capabilities.md`. Build each direction into
   `lab/apps/<id>/<direction>/` following the spec's builder rules: find every component with the c2n MCP server
   (`search_components`, then `get_component` in **json** for exact attribute types), check the docs gallery for a
   look, and run `validate_markup` on what you wrote.
2. Keep notes while building, not after: every search that did not find what exists, every `::part` override, every
   line of glue between two components, every plain HTML element. They are the report.
3. Write `lab/targets/<id>.json` with one journey per spec task (`t1-…`), targets taken from the build's accessibility
   tree (`--aria`). A task that only applies to a phone, or only to a desktop, lists its `personas`.
4. Run the lab (step 1 below) until every journey passes, fixing the build, not the journey, unless the journey is wrong.
5. Write `lab/reports/<id>/<direction>.md` from `lab/reports/TEMPLATE.md`: one row per requirement, the component the
   note is about listed first. Then run `node lab/scripts/gaps.mjs --check` and read the coverage section: a component
   it lists as unused may be the one you should have found (that is how `c2-chip-group` turned up).
6. File what the report found (step 3 below): `workaround`, `hand-rolled` and `failed` rows on an existing component
   go to `COMPONENT-FEEDBACK.md`; a missing component goes in the report's "Missing components" for review against
   `COMPONENT-ROADMAP.md`.

## 1. Run the scripted journeys

```bash
npm run build -w apps/examples/<app>          # wireit-cached; builds the components the app uses
node lab/scripts/lab.mjs run <target> --repeat 2
```

Read `test-results/lab/<target>/report.md`. A finding seen on only some repeats is flaky: look at it, but never file it
as it stands.

## 2. Explore

The journeys only cover what someone thought to write. Explore like a curious user would:

1. Read the accessibility tree: `node lab/scripts/lab.mjs run <target> --personas mouse --steps <file> --aria` with
   `[{ "goto": "./" }]`. That tree is what a screen reader user gets.
2. Pick tasks a real user of this kind of app would do and the journeys do not cover: edge inputs (very long text,
   emoji, an RTL name, pasting), doing things twice, undoing, cancelling halfway, Escape at every step, resizing, using
   the app with only the keyboard.
3. Write each as a step file in the scratchpad and run it under the personas it concerns. Look at the screenshots in
   `shots/`. Read them; don't assume.
4. When an exploration finds something, or covers a task worth keeping, add it to `lab/targets/<target>.json` as a
   journey so it becomes a regression check.

## 3. Triage every new finding

For each finding, decide whose it is before writing anything:

| Verdict                | Test                                                                                                     | Action                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component bug**      | It reproduces on a page with only that component (the component's `index.html` harness or its test page) | Write a failing test in `packages/components/<name>/test/`. Fix it when the fix is small and clear; otherwise add a `bug` entry to `COMPONENT-FEEDBACK.md` |
| **Component friction** | The app had to work around the component, or the obvious use was wrong                                   | `papercut`/`gap` entry in `COMPONENT-FEEDBACK.md`: what the app needed, what happened, the smallest change                                                 |
| **App bug**            | Only the app's own code or CSS is involved                                                               | Fix the example app, or note it in the report                                                                                                              |
| **Lab false positive** | The oracle is wrong (confirm with the screenshot or Chrome's accessibility tree)                         | Fix the oracle in `lab/scripts/lib/`. Do not hide it in `known.json`                                                                                       |
| **Tool disagreement**  | axe and Chrome's tree disagree (axe does not follow sectioning across shadow roots)                      | `known.json` with the reason                                                                                                                               |

Rules that keep the lab honest:

- Confirm a `focus-invisible` finding on its two screenshots (`*-focus-invisible-*.png` and `*-unfocused.png`) and a
  contrast finding on the end-of-journey screenshot before filing either.
- Use Chrome's accessibility tree (`--aria`, `snapshots/*.txt`) as the reference for what a screen reader announces.
  Playwright's `ariaSnapshot()` and `getByRole` miss `ElementInternals` roles and can show text twice that Chrome reads once.
- Check `COMPONENT-FEEDBACK.md` and open issues for duplicates first.
- Add a key to `lab/known.json` only for a finding that has been triaged and recorded somewhere (a feedback entry, an
  issue, or a stated reason). Remove the key when the component is fixed. The list only shrinks.

## 4. Report

End with a short report: journeys × personas passed, each new finding and its verdict, what was filed where, and the
feedback (what was awkward while exploring). If the run was scheduled, put the report in the pull request or issue it
opens. Never merge anything yourself.
