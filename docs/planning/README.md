# Planning documents

Research, roadmaps and plans: they record intent and history, **not the current rules**. Where one disagrees with the
code or with a `CLAUDE.md`, the code and the guidance win. Coding agents open these only for planning work (choosing
what to build next, triaging a missing component), never as instructions for how to build.

| File                       | What it is                                                                                                                           | Kept up to date?                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `COMPONENT-ROADMAP.md`     | Components still to build, with a decision column. The `new-component` skill deletes a row when its component ships.                 | Yes: the `new-component` and `component-lab` skills edit it       |
| `COMPONENT-CANDIDATES.md`  | The round-three long list of 410 candidates, researched 2026-11-07, checked against the library 2026-11-10                           | No: a dated snapshot, not edited (see `COMPONENT-ACTION-PLAN.md`) |
| `COMPONENT-ACTION-PLAN.md` | The accepted round-three recommendations turned into work items (2026-11-10)                                                         | Until the round is done                                           |
| `ARTICLE-ROADMAP.md`       | A planned article series about building applications in the AI era                                                                   | Maintainer's plan                                                 |
| `TABLE-VARIANTS.md`        | How `@c2n/table`'s features were sorted into the grid, variants and examples (measured 2026-11-14); every listed row is done         | No: a dated snapshot                                              |
| `TODO.md`, `spike.md`      | Early notes, moved here from the repository root on 2026-11-21. `TODO.md` predates the TypeScript 6 upgrade, so its items are stale. | No                                                                |
