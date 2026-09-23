# Contract: c2n Component Evaluation

## Deliverables

1. `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md`: complete report for this example.
2. Root `COMPONENT-FEEDBACK.md`: concise unresolved consumption findings, following its existing append-only format.
3. Tests or an audit script proving that every actually used c2n tag has an evaluation inventory entry.
4. Links from the example README and documentation entry to the evaluation report.

## Report header

The report records:

- Evaluation date and feature/spec link.
- Exact Next.js, React, browser, Node, and c2n package versions.
- Build/deployment mode and tested commands.
- Covered workflows, viewports, themes, browsers, and assistive-technology checks.
- Known limitations of the synthetic example.

## Component inventory

Every distinct shipped c2 tag has one row:

| Field                 | Requirement                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| Tag and package       | Exact published identity and evaluated version.                                   |
| Regions/workflows     | Every major location where used.                                                  |
| Public APIs exercised | Attributes, properties, events, slots, CSS variables, and parts actually used.    |
| Outcome               | `successful`, `successful-with-workaround`, `finding-open`, or `fixed-in-change`. |
| Positive pattern      | What worked well and should be preserved.                                         |
| Finding IDs           | Links to zero or more detailed findings.                                          |
| Evidence              | Test/source/visual links proving the assessment.                                  |

Coverage must equal 100% of the component usage registry.

## Finding schema

Each improvement finding uses a stable ID `C2N-NEXT-NNN` and contains:

- **Kind**: successful pattern or improvement.
- **Category**: Next.js integration, SSR/hydration, API/types, events/bindings, styling, composition, accessibility, documentation, performance, or developer experience.
- **Priority**: blocker, high, medium, or low.
- **Affected package/tag and exact version**.
- **Workflow/context**: route, component composition, viewport/input method, and relevant state.
- **Expected behavior**.
- **Actual behavior**.
- **Minimal reproduction steps**.
- **Evidence**: test, console output, source link, screenshot, or measurement when applicable.
- **Workaround**: concrete workaround or `None`.
- **Recommended change**: the smallest actionable library improvement.
- **Disposition**: open feedback link or fixed-in-change evidence.

## Priority rubric

| Priority | Meaning                                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Blocker  | Prevents a required workflow with no viable public-API workaround.                                                     |
| High     | Breaks accessibility, SSR/hydration correctness, data integrity, or a major workflow; workaround is costly or fragile. |
| Medium   | Common usage works only with avoidable app code or incomplete documentation.                                           |
| Low      | Minor ergonomic, consistency, or documentation improvement with a straightforward workaround.                          |

## Category coverage

The consolidated report includes a conclusion for every required category even when no defect was observed. “No issue observed” must name the exercised surface and evidence; it cannot be an empty assertion.

## Root feedback synchronization

- Append unresolved bugs, gaps, papercuts, documentation issues, and native-control fallbacks to `COMPONENT-FEEDBACK.md`.
- Keep root entries concise: severity, context, observed behavior, and smallest useful fix.
- Cross-link the report finding and root entry.
- If the component is fixed and regression-tested in the same change, do not add a new open root entry; mark the report finding `fixed-in-change` and link its tests/change.
- Never delete or rewrite another contributor's feedback entry.

## Evidence rules

- Findings are created from observed implementation behavior, not planning assumptions.
- Screenshots supplement but do not replace behavioral tests for interaction issues.
- Accessibility evidence distinguishes automated axe checks from manual keyboard/screen-reader review.
- Performance evidence records environment, repeat count, representative sample, and whether the result is deterministic-cost or wall-clock based.
- Proprietary SigNoz branding, assets, screenshots, or copied layout evidence must not appear.

## Completion audit

The feature is not complete until:

- Every shipped c2 tag appears in the inventory.
- Every improvement finding has every required field.
- Every open finding has a cross-linked root feedback entry.
- Every fixed-in-change finding links to verification evidence.
- Positive patterns are recorded, not only defects.
- All required evaluation categories have a conclusion.
