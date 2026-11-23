---
name: fix-component-feedback
description: Work through the open component feedback (the `## Open` table of COMPONENT-FEEDBACK.md and GitHub issues labelled `component-feedback`), fix the entries that have a contained fix, prove each with a test, verify it in a real browser on the built docs site, and move the entries to `## Fixed`. Use when asked to check, triage or fix component feedback.
argument-hint: '[component or issue number…]'
---

# Fix component feedback

The feedback log is where apps record friction with `c2-*` components (see "Report back what you hit" in `apps/ui/CLAUDE.md`).
This skill clears it. Follow `packages/components/CLAUDE.md` and `docs/agents/component-foundation.md` throughout: the component foundation rules, theming grammar, message tokens,
and "never write an attribute on the host".

## 1. Collect the open entries

```bash
sed -n '/^## Open/,/^## Fixed/p' COMPONENT-FEEDBACK.md
gh issue list --label component-feedback --state open
```

With `$ARGUMENTS`, take only the entries for those components or issues.

## 2. Triage before touching code

Put each entry in one of three groups and say which in the report:

- **Fix now.** The fix is contained and its shape is clear: a bug with a reproduction, a missing variable, a lifecycle
  ordering problem, a warning.
- **Needs sign-off.** The fix changes a visible default, removes or renames public API, or changes ARIA semantics
  in a way two reasonable designs disagree on (e.g. `group`/`button` vs `radiogroup`/`radio`). Do not implement it:
  list the options and ask.
- **Too big for this pass.** A new controller, a cross-component protocol, a size budget trade-off. Leave it open.

Check the entry's "smallest fix" before trusting it: it was written by someone who hit the problem, not by someone who
tested the fix (`contain-intrinsic-inline-size: auto 720px` only applies while content is skipped, for instance).

## 3. Fix, one entry at a time

For each entry:

1. **Reproduce it in a test first**, in the package's own suite (`packages/components/<pkg>/test/`), and run it
   against the unchanged source to see it fail. An SSR/hydration bug needs a hydration test: copy
   `packages/components/week-planner/test/hydration{.spec.ts,-server.ts,.ts,.html}` and render the case on the server.
   A Lit dev warning (`scheduled an update after an update completed`) is caught with a `page.on('console')` listener.
2. Fix the component. A new public surface (CSS variable, slot, part, property) gets its JSDoc tag, its `$theme`
   default and a gallery card in `apps/ui/src/content/gallery/<id>.mdx` (rule 4). A new variable with no default
   (`null` in `$theme`) is not mapped by `@c2n/theme`; one with a default gets `:root` values from `base.css` that
   beat any fallback chain, so a shorthand that should win over per-side variables must come first in `cssVar(...)`
   and have no default.
3. `pnpm --dir packages/components/<pkg> run build` (regenerates `custom-elements.json`), then
   `pnpm exec playwright test packages/components/<pkg> --project=chromium`. When a test fails, check whether it also fails on
   the unchanged source before blaming the change (`git stash push <src path>`), and report a pre-existing failure.

## 4. Verify in a real browser

A passing test proves the case it covers, not the page a reader opens. After the fixes, check each one in the built
docs site in a real browser:

```bash
LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 pnpm run ui:build
LC_ALL=en_US.UTF-8 node .claude/skills/new-component/scripts/doc-screenshots.mjs <id> [--press "<button name>"]…
```

Build under an English locale, as CI does: the server render of a component that formats with `Intl` and no
`locale` uses Node's default locale, so on a machine set to French every `c2-format-number`/`c2-delta` page reports a
"Hydration value mismatch" that CI never sees. Before blaming a fix for an error the script reports, check whether a page
of an untouched component reports the same one.

Run it for every component the pass touched, and **look at each image** under `test-results/doc-screenshots/<id>/`
(both themes, every gallery card, `aria.txt`). For each fix, find the card or state that shows it and say what you saw:
the new gallery card renders, the hidden arrow leaves no gap, the planner marks the right day, there is no console
error (the script exits 1 on one). When no card shows the fix (a lifecycle bug, a hydration race), say so and name the
test that covers it instead. A fix that looks wrong in the browser is not done: go back to step 3.

Follow the repo's browser rule: use this headless script, not interactive browser tools, unless the user asks for them.

## 5. Review until clean

Run `/code-review high --max-findings all develop...<branch>`: by default it reports at most 10 findings, which can
hide the rest. Fix what it confirms (each with a test that fails before the fix), then **run it again on the whole
branch**: the fixes are new code and get reviewed like the rest. Stop when a pass reports nothing new to fix, and say
why for any finding left unfixed. Run `/security-review` once on the final branch.

## 6. Record

- Move each fixed entry from `## Open` to `## Fixed` in `COMPONENT-FEEDBACK.md`, with what changed and the branch or
  PR. For an entry partly fixed, edit it in place to say what remains.
- A fixed GitHub issue is closed by the PR (`Closes #<n>` in its description), never by hand before merge.
- Conventional Commit subjects with the package as scope (`fix(scheduler): …`, `feat(card): …`); one commit per
  component keeps the changelog readable.

## Report

A table: entry, group (fixed / needs sign-off / left open), the test that proves it, what the browser check showed.
Then the questions for the sign-off group, and any pre-existing failure you met.
