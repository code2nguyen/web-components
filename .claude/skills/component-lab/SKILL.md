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

## The weekly run

The lab runs about once a week, in one session, when there is budget for it. Asked to "run the component lab" with no
more detail, do this, in order, and stop when the session's budget is spent; whatever is left waits for next week.

1. `git pull` the default branch into a new branch `lab/<yyyy-mm-dd>`; build what the targets serve
   (`npm run build -w packages/umbrella`, plus `npm run build -w apps/examples/support-inbox-vue`).
2. **Regressions first:** `node lab/scripts/lab.mjs replay`. It reruns every target in `lab/targets/` twice, writes a
   run record per target to `lab/runs/`, and compares each with the target's previous full run: findings that
   appeared, findings that are gone, journeys now passing or failing. A new reproducible finding is triaged before
   anything else (step 3 below). A known finding the summary lists as no longer seen means a component was fixed:
   confirm it, remove its key from `known.json` and move its `COMPONENT-FEEDBACK.md` entry to Fixed.
3. **One new build:** pick the first spec that `lab/GAPS.md` lists as "not built" (scenarios before features before
   apps), build one direction of it (step 0), write its journeys and its report, then record its first run with
   `node lab/scripts/lab.mjs run <target> --repeat 2 --record`.
4. `node lab/scripts/gaps.mjs --check`, then open a pull request against `develop` titled
   `chore(lab): weekly run <yyyy-mm-dd>` with the new run records committed. Its description lists: the replay
   summary (`test-results/lab/replay-summary.md`), targets run and their result, findings by verdict,
   what was filed in `COMPONENT-FEEDBACK.md`, the spec built and its outcome counts, and the top of the gap matrix.

## 0. Build from a spec (when asked to build, or when a spec has no build)

1. Build **one direction at a time**, and arm the MCP call log before each: `node lab/scripts/readiness.mjs --arm <id>/<direction>`.
   This repository's `.mcp.json` points the `c2n` server's `C2N_MCP_LOG` at `lab/.armed/mcp-calls.jsonl`, and
   the server appends to it only while it exists, so every search, lookup and validation you make while building is
   recorded (a server started before that setting existed needs a restart: the report then says no log was recorded).
   `--arm` also records the build's start, so the report keeps only this build's calls, and refuses while another
   build holds the log (`--force` when that build was abandoned). Right after arming, mark your own MCP server: call
   `search_components` with the query `c2n-lab <id>/<direction>` (the report then keeps only that server's calls, and
   leaves the marker out). Then read the spec (`lab/specs/**/<id>.md`)
   and `lab/capabilities.md`. Build the direction into
   `lab/apps/<id>/<direction>/` following the spec's builder rules: find every component with the c2n MCP server
   (`search_components`, then `get_component` in **json** for exact attribute types), check the docs gallery for a
   look, and run `validate_markup` on what you wrote.
2. Keep notes while building, not after: every search that did not find what exists, every `::part` override, every
   line of glue between two components, every plain HTML element. They are the report.
   When the build is done, before running anything else, close its window: `node lab/scripts/readiness.mjs --end
<id>/<direction>` (calls after it — the lab run, triage, the report — are not how the build found its components).
3. Write `lab/targets/<id>.json` with one journey per spec task (`t1-…`), targets taken from the build's accessibility
   tree (`--aria`). A task that only applies to a phone, or only to a desktop, lists its `personas`.
4. Run the lab (step 1 below) until every journey passes, fixing the build, not the journey, unless the journey is wrong.
5. Write `lab/reports/<id>/<direction>.md` from `lab/reports/TEMPLATE.md`: one row per requirement, the component the
   note is about listed first. Then run `node lab/scripts/gaps.mjs --check` and read the coverage section: a component
   it lists as unused may be the one you should have found (that is how `c2-chip-group` turned up).
   Then write the report's **AI readiness** section from the log:
   `node lab/scripts/readiness.mjs <id>/<direction> --log lab/.armed/mcp-calls.jsonl` (it keeps the calls made
   since `--arm` by the server your marker search names; if your server restarted during the build, pass every pid it
   used with `--pid a,b`). It
   copies the build's calls next to the report (`<direction>.calls.jsonl`, committed) and writes, between markers, the calls per tool, the search that
   found each component the build used (or **none**: you knew the name, so a developer using the spec's words may not
   find it), the components used without `get_component`, the searches that found none of them, and what
   `validate_markup` says about the build now. A component no search returned, for a requirement that needed it, goes
   to the `ai-readiness` skill as a discovery gap (a `keywords` fix on its docs page), not to `COMPONENT-FEEDBACK.md`. Then disarm the log (`node lab/scripts/readiness.mjs --disarm <id>/<direction>`) and arm it again for the next direction. To refresh a
   section later (after editing the report), run the script without `--log`: it reads the committed log.
6. File what the report found (step 3 below): `workaround`, `hand-rolled` and `failed` rows on an existing component
   go to `COMPONENT-FEEDBACK.md`; a missing component goes in the report's "Missing components" for review against
   `docs/planning/COMPONENT-ROADMAP.md`.

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

| Verdict                | Test                                                                                                     | Action                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Component bug**      | It reproduces on a page with only that component (the component's `index.html` harness or its test page) | `bug` entry in `COMPONENT-FEEDBACK.md` with the smallest repro, the root cause if found and the suggested fix. Do not fix it (see below) |
| **Component friction** | The app had to work around the component, or the obvious use was wrong                                   | `papercut`/`gap` entry in `COMPONENT-FEEDBACK.md`: what the app needed, what happened, the smallest change                               |
| **App bug**            | Only the app's own code or CSS is involved                                                               | Fix the example app, or note it in the report                                                                                            |
| **Lab false positive** | The oracle is wrong (confirm with the screenshot or Chrome's accessibility tree)                         | Fix the oracle in `lab/scripts/lib/`. Do not hide it in `known.json`                                                                     |
| **Tool disagreement**  | axe and Chrome's tree disagree (axe does not follow sectioning across shadow roots)                      | `known.json` with the reason                                                                                                             |

**The lab finds; it does not fix components.** Never change `packages/` (components, `@c2n/core`, the theme, the MCP
server) during a lab run, however small the fix looks. A lab pull request holds run records, lab builds, journeys,
reports, `known.json`, `GAPS.md` and `COMPONENT-FEEDBACK.md` entries only, so it needs no component review and the
session's budget goes to finding, not fixing. A fixed finding also disappears from the record, which is the evidence
the lab works. Investigate as far as it makes the entry actionable (isolate it, name the line, propose the change),
then file it; the fix is a separate branch and pull request. Fixing the lab's own build (`lab/apps/`) and oracles
(`lab/scripts/`) is still part of the run.

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
