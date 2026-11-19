---
name: ai-readiness
description: Measure and fix how well an AI agent can use the c2n components — find the right one for a requirement, understand its API, write valid markup and use it correctly — with the AI readiness score (packages/tools/mcp/readiness). Use when asked to check, score, measure or improve AI readiness, AI-friendliness or how agents understand the components, after adding or changing a component or its docs, or before a release. By default it scores only the components new or modified since the last run and compares them with their last score; pass --full for every component.
argument-hint: '[--full] [component-id…] [--agent]'
---

# AI readiness

The question the score answers: **given a user requirement, can an AI independently find the correct c2n component,
understand its API, generate valid code and use it correctly?** It measures what `@c2n/mcp` serves an agent (the
registry built from the manifests and the docs site), not the source code.

| Part                | What it measures                                                                                                                                                       | Cost          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Component readiness | Six weighted dimensions per component, from deterministic checks: identity 15, API docs 25, usage examples 20, composition 15, framework integration 15, validation 10 | ~20 s, free   |
| Discovery           | 85 requirements written as a developer would, through `search_components`: mean reciprocal rank, hit@1, hit@3                                                          | included      |
| Agent run           | Claude Code headless with only the c2n MCP server builds 28 fixed requirements; graded with `validate_markup`                                                          | ~10 min, ~$10 |

The headline is component readiness 50%, discovery 20% and the agent run 30% (70/30 without an agent run). The code is
`packages/tools/mcp/scripts/readiness.ts`, `readiness/score.ts` (the checks), `readiness/tasks.json` (the
requirements) and `readiness/agent.ts`; the MCP README has the reference.

## Results live in the repository

`packages/tools/mcp/readiness/` is committed:

- `baseline.json` — the last run: the commit it measured, the library scores, and per component its score, its
  dimensions and every check that loses points (one line per component, so a diff shows what a run changed).
- `report.md` — the last full run: dimensions, where the points go, discovery misses, the agent run, every component.
- `changes.md` — the last changed-only run: each scored component against its last score.
- `agent.json` — the last agent run.

Commit them with the change they measure, so the next run compares against it.

## Run

1. **Build what changed**, so the manifests are fresh: the changed packages (`npm run build -w packages/components/<name>`)
   or everything (`npm run build`, wireit-cached). Docs-only changes need no build. The script rebuilds the registry
   itself.
2. **Score**:
   - `npm run mcp:readiness` — **changed-only** (default): the components whose package (outside `test/`), docs page or
     gallery changed since `baseline.json`'s commit, committed or not, plus new components. Each is compared with its
     last score; their new scores go into the baseline and `changes.md`. A change to the scoring itself (the
     readiness scripts, `build-registry.ts`, `packages/tools/mcp/src/`, `component-presets.ts`) can move every score,
     so the run goes full on its own and says why.
   - `npm run mcp:readiness -- --full` — every component; writes `report.md`. Use it after changing the scoring, before
     a release, or when asked for the whole picture.
   - `npm run mcp:readiness -- <id> <id>` — just those components, compared like a changed run.
   - `--fail-on-regression` exits 1 when a scored component lost points (for a gate); `--min <score>` when the library
     score is below it.
3. **Agent run** (only when asked, or before a release — it costs money; say the cost first):
   `npm run readiness:agent -w packages/tools/mcp` (the fixed `agentSet`, comparable between runs; `--all` for every
   requirement, ~$30). Then `npm run mcp:readiness` again so the headline includes it. Watch the tool calls per task in
   `report.md` as well as the pass rate: an agent that needs more calls found the component the hard way.
4. **Read the result**: the terminal summary, then `changes.md` (or `report.md`) — "What is still missing" lists each
   failing check with what is missing.

## Fix

Work from the checks that cost the most points. Every fix must make the component easier for an agent to use, not just
raise the number: if a fix would only satisfy the check, change the check instead (and say so), as was done for
CSS variables named after a CSS property and for generic slot content.

| Check (`dimension/check`)                                            | What it means                                                                                           | Fix                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity/description`, `when-to-use`, `element-descriptions`        | The one-liner, the intro and each element's JSDoc say what it is and when to use it                     | Write the docs page `description` and intro; the element's class JSDoc                                                                                                                    |
| `identity/distinguishable`                                           | Searching for the need (description minus the name) finds it                                            | Sharpen the description; add `keywords`                                                                                                                                                   |
| Discovery misses (report)                                            | A requirement does not rank the right component first                                                   | Add the words developers use to the docs page frontmatter `keywords: ['snackbar', …]`, then add a **new** requirement to `tasks.json` written before tuning, to check the fix generalizes |
| `api/attributes-*`, `events-*`, `slots-described`, `parts-described` | JSDoc of the element                                                                                    | `@property` comments, `@event`, `@slot`, `@csspart` lines                                                                                                                                 |
| `api/properties-*`, `methods-described`                              | Script-only API (renderers, data sources, methods) has a type and a description                         | JSDoc on the member. An internal that leaks (`@query` handle, handler, internal state) gets `/** @internal */` instead — its type stays, the manifest drops it                            |
| `api/css-described`                                                  | A variable whose name is not a CSS property (`--size`, `--token-*`, `--visible-rows`) says what it sets | `- description` on its `@cssproperty` line, read from what the SCSS does with it                                                                                                          |
| `api/fits`                                                           | `get_component` answers in full without shortening                                                      | Shorter element descriptions; move long notes to the docs page                                                                                                                            |
| `examples/usage`                                                     | At least 3 rows in the Docs `UsageBlock`                                                                | Rows that each show a **visible** state or option (disabled, loading, a variant). Copy the page's own first row (directives such as `client:only` included) and change one attribute      |
| `examples/gallery`, `elements-shown`, `attributes-shown`             | A gallery, every element and most attributes appear in an example                                       | Gallery cards; an `aria-label` on charts and icon buttons (agents copy it)                                                                                                                |
| `composition/slots-shown`                                            | Every named slot is used in an example                                                                  | A "Slots" gallery section built from the Default card: custom icons, slotted content, loading / empty / error states                                                                      |
| `composition/related-documented`, `children-linked`                  | Components the examples nest are named in the docs; a child element names its parent                    | Name the typical children in the `@slot` description; a child's JSDoc names its parent (or any element of its package)                                                                    |
| `framework/*`                                                        | Install line, React and Vue types, Angular accessor, `HTMLElementTagNameMap`                            | `npm run build:tools` regenerates the framework types; a form control needs `name`, `value`/`checked` and an `input`/`change` event                                                       |
| `validation/examples-valid`, `examples-clean`                        | Examples pass `validate_markup`                                                                         | Fix the markup — or the component, when the markup is right and the API is missing something (a `value` the parent reads)                                                                 |

Rules learned the hard way:

- **Look at every row and card you add** (step 4 of the new-component skill, or the helper below), in both themes. A
  row identical to its neighbour, an option with no visible effect (`renderer="svg"`, `required`), or an attribute
  that changes data rather than display (`time-unit`, which reinterprets the input) misleads more than it helps.
- **Never edit generated files** (the icon sets' `src/icons/`, framework types, the umbrella): change the generator.
- **An MDX fence label may not contain a comma** (the meta parser splits on it); inline text next to injected markup
  on one line breaks MDX parsing; a `>` inside an attribute value is not the end of the tag.
- **A docs row that fails `validate_markup` may be a component gap**: check the component before "fixing" the docs.
- **Component bugs found on the way** get a failing test first, then the fix (this is how the chart SSR, tag-input
  slot and chart locale bugs were found).

Check the rows and cards you changed, in both themes, after `npm run ui:build`:

```bash
node .claude/skills/ai-readiness/scripts/shots.mjs <id> <id>:"<row label>"      # usage rows
node .claude/skills/ai-readiness/scripts/shots.mjs <id> --gallery               # gallery cards
```

Screenshots go to `test-results/ai-readiness/shots/`; open them with Read. Console errors are printed (exit 1).

## Finish

1. Re-run (`npm run mcp:readiness`) until the changed components no longer lose points you can fix honestly.
2. Run the checks your changes touched: `node --test packages/tools/mcp/scripts/*.test.ts`, `npm run mcp:smoke`, the
   component tests, `npm run lint`, `npm run format:check`, `npm run ui:build` for docs changes.
3. Commit `packages/tools/mcp/readiness/` with the change. In the summary, give the score before and after, what each
   fix was, and what is left and why (a check that would only be satisfied by filler is not a gap to close).
