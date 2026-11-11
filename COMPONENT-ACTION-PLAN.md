# Action plan for the round-three candidates

On 2026-11-10 the maintainer accepted every recommendation of [`COMPONENT-CANDIDATES.md`](COMPONENT-CANDIDATES.md). This file turns them into work that several sessions can do at the same time without stepping on each other.

It schedules 266 rows that need code (186 extensions and companions of existing packages, 6 helpers for `@c2n/core`, 74 new packages) and 26 rows that are examples of another row's extension. The other rows are not scheduled: 104 compositions wait for the blocks collection and 8 are already covered. They are listed at the end.

The rows themselves are not repeated here. A step names its rows by number; the brief for each is its line in the candidates file, where **How it fits** says where the code goes and **Estimated cost** what it may weigh.

## How to run it with several sessions

- **A track is one package.** Its steps are numbered and run in order: `table-1`, then `table-2`. Two sessions never work on the same track at the same time, because they would edit the same source files and the same committed `custom-elements.json`.
- **Different tracks run in parallel.** Start as many sessions as there are free tracks.
- **A step is one session and one pull request.** It holds at most two rows that need code, and a medium or high risk row is alone in its step.
- **Take the lowest wave first.** Wave 1 is the P1 rows and what they depend on, wave 2 the P2 rows, wave 3 the P3 rows. A step that says "after" waits for that step to be merged.
- **The plan shrinks as work lands.** Each pull request deletes its own step line from this file. What is left is what is still to do.

To start a session, give it this:

```text
Implement step <step-id> of COMPONENT-ACTION-PLAN.md.

Read "Rules for every step" in that file first. The brief for each row of the step is its
line in COMPONENT-CANDIDATES.md: "How it fits" says where the code goes, "Estimated cost"
what it may weigh. Work on a new branch from develop. Open one pull request to develop whose
title ends with [<step-id>], and delete the step's line from COMPONENT-ACTION-PLAN.md in it.
```

### Where to start

These wave-1 steps depend on nothing and sit on different tracks, so they can all start today: `table-1`, `description-list-1`, `pivot-table-1`, `highlight-1`, `filter-builder-1`, `recurrence-editor-1`, `import-mapper-1`, `camera-capture-1`, `date-selector-1`, `month-picker-1`, `scheduler-1`, `form-1`, `list-item-1`, `tree-1`, `banner-1`. Their lines are under wave 1 below.

`table` is the longest track (10 steps) and the one most other rows lean on, so keep a session on it continuously.

## Rules for every step

1. **Scope.** Build the rows of the step and nothing else. A row marked "example" is first a gallery card (and a docs usage row when useful) that shows the extension doing that job. If writing the card shows the extension lacks a small hook the row's brief names (a computed column, a row rule, a sum constraint), add that hook in the same step, under the same limits.
2. **Nothing changes for existing users.** Every addition is opt-in. Defaults, rendered output, events and CSS variables of the existing API stay as they are, and the existing tests pass untouched. `REVIEW.md` section 1 applies: anything else is a breaking change and needs sign-off.
3. **Put the code where the recommendation says.**
   - _Extend_: in the component, behind an attribute or property.
   - _Extend (lazy)_: in a module the component loads with `import()` the first time the feature is used, as `c2-image` loads `@c2n/modal`. Only the hook stays in the entry.
   - _Companion_: a new element in the same package, with its own source file, Vite entry and `exports` subpath, as `c2-table-column` sits beside `c2-table`.
   - _Core_: a controller or function in `packages/core`, exported from its own subpath.
   - _New_: scaffold with `npm run generate` and follow the `new-component` skill and the definition of done in `COMPONENT-ROADMAP.md`.
4. **Measure what the estimate guessed.** Run `npm run build`, `npm run build -w packages/umbrella` and `npm run check:bundle-size`, and write the measured growth next to the estimate in the pull request. Then:
   - within twice the estimate: carry on;
   - more than twice the estimate, or the host passes its total in "Growth per host" of the candidates file: stop and move code into a lazy module or a companion before asking for review;
   - a lazy feature: check that its chunk is not in the entry's static imports (the entry size barely moves).
5. **Prove the hot path is untouched.** For a row whose cost reads "Hot path" or "While active", add a test that the feature costs nothing when it is off. For `c2-table`: with 50,000 rows the number of rendered rows is the same as before, with and without the new attribute at its default.
6. **Touch only your lines of `packages/umbrella/size-budget.json`.** Change your entry (and `lazy` when you add a lazy chunk) by hand or with `npm run size:add -w packages/umbrella` for a new entry. Do not commit the full rewrite `size:update` produces: it edits every entry and conflicts with every other open step.
7. **Finish the package.** Tests in the package's `test/` directory (keyboard paths included), the docs usage row, one gallery card per example row, the rebuilt `custom-elements.json`, and what `npm run build:tools` regenerates. Then the checks CI runs: `npm run lint`, `npm run format:check`, `npm run ui:build`, `npm run mcp:smoke`.
8. **Review before the pull request**, as `CLAUDE.md` requires: `/code-review`, `/security-review`, and the docs screenshot review when a component or its docs changed.
9. **If the recommendation does not survive contact with the code**, do not force it. Say so in the pull request, propose the alternative (lazy, companion or new package), and leave the step line in place with a note.

## Shared files and merge order

Steps on different tracks edit different packages, but a few generated files are shared. Merge pull requests one at a time; after each merge, the other open branches rebase on `develop` and regenerate:

| File                                                                                                                           | Who edits it                          | On conflict                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/umbrella/size-budget.json`                                                                                           | Every step, one or two lines          | Keep both sides' lines                                                                                         |
| `packages/umbrella/package.json`, `packages/umbrella/src/*`                                                                    | New packages and companions           | Take either side, then `npm install && npm run build:tools && npm install`                                     |
| The skill catalog and plugin manifests                                                                                         | Every step that changes a description | Same regeneration                                                                                              |
| `package-lock.json`                                                                                                            | New packages, new dependencies        | Same regeneration                                                                                              |
| The sorted registries (`component-manifests.ts`, `component-modules.ts`, `component-previews.ts`, root and theme wireit lists) | New packages                          | Entries are alphabetical, so two additions rarely touch; re-sort with `node scripts/generator/sorted-lists.ts` |
| This file                                                                                                                      | Every step deletes one line           | Keep both deletions                                                                                            |

`COMPONENT-CANDIDATES.md` is not edited by the steps. Its tables are padded by Prettier, so deleting one row can re-pad a whole table and collide with every open branch. Clean it up once per wave, in a pull request of its own.

## Reading a step line

`**step-id** · host or "new package" · rows · estimate · risk · conditions`

- **Rows** are named with their number in the candidates file. "(lazy)" and "(companion)" repeat the recommendation; "example" rows follow the code rows.
- **Estimate** is the sum of the step's in-place growth against the host's entry today, then lazy chunks and companion entries.
- **Risk** is the highest of the step's rows.
- **After** names steps on other tracks that must be merged first. **Needs** names a roadmap item outside this plan that the step depends on or absorbs.

## Wave 1: the P1 rows and what they depend on

### Existing packages

- **table-1** · `c2-table` · tree grid #239 · +2.5 kB on 31.4 kB · risk medium
- **table-2** · `c2-table` · row detail #240 · +1.5 kB on 31.4 kB · risk medium
- **table-3** · `c2-table` · data editor #241 (lazy), example: timesheet grid #307, example: journal entry grid #328 · +0.6 kB on 31.4 kB, 9 kB lazy · risk medium
- **table-4** · `c2-table` · status matrix #247, ledger #331 · +1.3 kB on 31.4 kB · risk low
- **table-5** · `c2-table` · example: line items editor #329, example: allocation editor #330
- **description-list-1** · `c2-description-list` · comparison matrix #249, example: record diff #250 · +1.2 kB on 5.6 kB · risk low
- **pivot-table-1** · `c2-pivot-table` · financial statement #332 · +2 kB on 32.3 kB · risk medium
- **highlight-1** · `c2-highlight` · find bar #258 (companion) · 2.5 kB new entry · risk low
- **filter-builder-1** · `c2-filter-builder` · rule builder #260 (lazy) · +0.6 kB on 66.8 kB, 7 kB lazy · risk medium
- **date-selector-1** · `c2-date-selector` · calendar #289 · +1.5 kB on 4.7 kB · risk low
- **date-input-1** · `c2-date-input` · date picker #290 (lazy) · +0.5 kB on 3.1 kB, 17 kB lazy · risk low · after `date-selector-1`
- **month-picker-1** · `c2-month-picker` · period picker #294 · +1 kB on 5.4 kB · risk low
- **scheduler-1** · `c2-scheduler` · absence calendar #349 · +1.2 kB on 38.1 kB · risk low
- **form-1** · `c2-form` · field array #442 (companion) · 3 kB new entry · risk low
- **list-item-1** · `c2-list-item` · nav list #464 · +0.3 kB on 3.3 kB, 1.5 kB new entry · risk low
- **tree-1** · `c2-tree` · sortable tree #465 (lazy) · +0.4 kB on 15.3 kB, 6 kB lazy · risk medium
- **banner-1** · `c2-banner` · callout #494 · +0.2 kB on 2.6 kB · risk low

### New packages

- **recurrence-editor-1** · new package · recurrence editor #262 · absorbs roadmap #22 `c2-cron-input`: one editor, RRULE and cron outputs
- **import-mapper-1** · new package · import mapper #271
- **camera-capture-2** · new package · barcode scanner #281

## Wave 2: the P2 rows

### Existing packages

- **table-6** · `c2-table` · value filter #242 (lazy), payroll review grid #355 · +1.2 kB on 31.4 kB, 17 kB lazy · risk low
- **table-7** · `c2-table` · flowsheet #419 · +1 kB on 31.4 kB · risk low
- **table-8** · `c2-table` · example: allocation grid #306, example: goal tree #358, example: gradebook #422
- **virtual-list-1** · `c2-virtual-list` · infinite scroll #471 · +0.5 kB on 17.1 kB · risk low
- **view-options-1** · `c2-view-options` · saved views #246 · +1.5 kB on 66.1 kB · risk low
- **choice-matrix-1** · `c2-choice-matrix` · input matrix #248 (companion), record merge #251 · +0.8 kB on 4.8 kB, 3 kB new entry · risk low
- **choice-matrix-2** · `c2-choice-matrix` · scorecard #316, example: rubric #317, example: inspection checklist #318 · +1.2 kB on 4.8 kB · risk low
- **description-list-2** · `c2-description-list` · property list #253 (lazy), calculation breakdown #337, example: pay stub #354 · +1.2 kB on 5.6 kB, 6 kB lazy · risk low
- **autocomplete-1** · `c2-autocomplete` · record picker #252 · +2.5 kB on 26.0 kB · risk low
- **select-1** · `c2-select` · select panel #254, status select #255 · +2.2 kB on 24.7 kB · risk low
- **select-2** · `c2-select` · native select #443 (companion) · 3 kB new entry · risk low
- **pivot-table-2** · `c2-pivot-table` · planning grid #256 (lazy) · +0.5 kB on 32.3 kB, 6 kB lazy · risk high
- **pivot-table-3** · `c2-pivot-table` · aging table #333 · +0.8 kB on 32.3 kB · risk low
- **kanban-1** · `c2-kanban` · matrix board #257 · +1.5 kB on 9.4 kB · risk medium
- **highlight-2** · `c2-highlight` · annotation layer #277 · +0.7 kB on 2.9 kB · risk medium
- **highlight-3** · `c2-highlight` · text annotator #279 · +0.3 kB on 2.9 kB · risk low
- **key-value-editor-1** · `c2-key-value-editor` · tier editor #264 · +1.2 kB on 7.2 kB · risk low
- **textarea-1** · `c2-textarea` · expression input #265 · +0.5 kB on 2.9 kB, 5 kB lazy · risk medium · needs the `triggers` API listed for `c2-textarea` and `c2-text-field` in the roadmap
- **rich-text-editor-1** · `c2-rich-text-editor` · merge field input #266 · +1 kB on 54.6 kB · risk low
- **rich-text-editor-2** · `c2-rich-text-editor` · track changes #278 (lazy) · +0.4 kB on 54.6 kB, 8 kB lazy · risk medium
- **upload-1** · `c2-upload` · document checklist #272, image uploader #282 · +2.5 kB on 13.0 kB · risk low
- **attachment-1** · `c2-attachment` · file preview #273 (lazy) · +0.4 kB on 5.3 kB, 8 kB lazy · risk low · absorbs roadmap #46 `c2-pdf-viewer` and the `c2-image` gallery extension (#42)
- **image-annotator-1** · `c2-image-annotator` · extraction review #275, pinned comments #276, example: image pins #368 · +1.4 kB on 26.1 kB · risk low
- **core-1** · `@c2n/core` · drop zone #284 (core), sync status #384 (core)
- **core-2** · `@c2n/core` · session timeout #399 (core), live region #495 (core)
- **scroll-area-1** · `c2-scroll-area` · scroller #472 · +1 kB on 3.4 kB · risk low
- **date-selector-2** · `c2-date-selector` · date compare picker #295 · +1.2 kB on 4.7 kB · risk low
- **date-input-2** · `c2-date-input` · memorable date #293 (companion) · 2.5 kB new entry · risk low
- **month-planner-1** · `c2-month-planner` · agenda view #298, change calendar #303 · +2.3 kB on 10.9 kB · risk low
- **month-planner-2** · `c2-month-planner` · rate calendar #304 · +0.8 kB on 10.9 kB · risk medium
- **scheduler-2** · `c2-scheduler` · availability grid #300 · +1 kB on 38.1 kB · risk low
- **scheduler-3** · `c2-scheduler` · dispatch board #305 · +1.2 kB on 38.1 kB · risk medium
- **scheduler-4** · `c2-scheduler` · shift board #352 · +0.8 kB on 38.1 kB · risk medium
- **scheduler-5** · `c2-scheduler` · example: on call schedule #302
- **week-planner-1** · `c2-week-planner` · schedule paint grid #301 · +1.5 kB on 36.7 kB · risk low
- **slider-1** · `c2-slider` · time scrubber #311 · +0.6 kB on 5.5 kB · risk low
- **steps-1** · `c2-steps` · task list #319, stage path #321 · +1.2 kB on 11.3 kB · risk low
- **steps-2** · `c2-steps` · lesson list #626 · +0.6 kB on 11.3 kB · risk low
- **confirm-dialog-1** · `c2-confirm-dialog` · typed confirm #323, prompt dialog #324 · +0.9 kB on 8.1 kB · risk low
- **button-1** · `c2-button` · hold button #325 (companion), progress button #448 · +0.3 kB on 2.4 kB, 1.2 kB new entry · risk low · needs the success and error states listed for `c2-button` in the roadmap
- **format-number-1** · `c2-format-number` · live value #338 (lazy) · +0.2 kB on 3.2 kB, 1.5 kB lazy · risk medium · needs the rolling-digit mode listed for `c2-format-number` in the roadmap (#37): build both in one module
- **format-number-2** · `c2-format-number` · delta #505 · +0.3 kB on 3.2 kB · risk low
- **chart-1** · `@c2n/chart` · spc chart #366 · +0.2 kB on 34.0 kB, 2 kB lazy · risk low
- **chart-2** · `@c2n/chart` · combo chart #524 · +1 kB on 37.2 kB · risk medium
- **chart-3** · `@c2n/chart` · histogram chart #525 · +0.8 kB on 37.2 kB · risk low
- **chart-4** · `@c2n/chart` · small multiples #526 (companion) · 3 kB new entry · risk medium
- **chart-5** · `@c2n/chart` · chart navigator #527 (companion), forecast chart #528 · +1 kB on 34.0 kB, 4 kB new entry · risk low
- **number-input-1** · `c2-number-input` · unit input #364 · +1 kB on 3.6 kB · risk low
- **checkbox-1** · `c2-checkbox-group` · modifier group #365 · +0.5 kB on 6.1 kB · risk low
- **meter-1** · `c2-meter` · seat meter #400, range indicator #421 (companion) · +0.3 kB on 3.5 kB, 2.5 kB new entry · risk low
- **secret-field-1** · `c2-secret-field` · totp code #397 · +1 kB on 25.3 kB · risk low
- **password-field-1** · `c2-password-field` · password generator #398 (lazy) · +0.3 kB on 6.0 kB, 3 kB lazy · risk low
- **reorder-list-1** · `c2-reorder-list` · ranking #444 · +0.6 kB on 12.2 kB · risk low
- **reorder-list-2** · `c2-reorder-list` · sortable grid #474 · +1.5 kB on 12.2 kB · risk medium
- **emoji-picker-1** · `c2-emoji-picker` · icon picker #445 · +1 kB on 45.2 kB · risk medium
- **shortcut-1** · `c2-shortcut` · shortcut sheet #499 (companion) · 2.5 kB new entry · risk low
- **list-item-2** · `c2-list-item` · settings row #476 · +0.3 kB on 3.3 kB · risk low
- **page-header-1** · `c2-page-header` · nav bar #467 · +0.6 kB on 29.8 kB · risk low
- **tabs-1** · `c2-tab` · tab nav #468, code tabs #510 · +0.7 kB on 1.9 kB · risk low
- **details-1** · `c2-details` · collapse #469 · +0.3 kB on 3.9 kB · risk low
- **table-of-contents-1** · `c2-table-of-contents` · index bar #470 · +1.2 kB on 5.1 kB · risk low
- **action-bar-1** · `c2-action-bar` · floating toolbar #473 · +0.5 kB on 2.3 kB · risk low
- **sticky-1** · `c2-sticky` · sticky cta #475 · +0.3 kB on 1.5 kB · risk low
- **progress-1** · `c2-progress` · navigation progress #496 (companion), milestone progress #506 · +0.6 kB on 2.7 kB, 1.2 kB new entry · risk low
- **tour-1** · `c2-tour` · beacon #497 · +0.8 kB on 16.1 kB · risk low
- **comment-thread-1** · `c2-comment-thread` · comment tree #508 · +1.5 kB on 47.8 kB · risk medium
- **json-viewer-1** · `c2-json-viewer` · schema tree #553 (lazy) · +0.3 kB on 7.0 kB, 4 kB lazy · risk low
- **json-viewer-2** · `c2-json-viewer` · json editor #554 (lazy) · +0.3 kB on 7.0 kB, 6 kB lazy · risk medium
- **log-viewer-1** · `c2-log-viewer` · build log #555 (lazy) · +0.4 kB on 16.5 kB, 4 kB lazy · risk medium
- **citation-1** · `c2-citation` · sources #570 (companion) · 2.5 kB new entry · risk low
- **questionnaire-1** · `c2-questionnaire` · agent question #571 · +0.8 kB on 4.7 kB · risk low
- **selection-toolbar-1** · `c2-selection-toolbar` · inline prompt #574 · +1 kB on 13.2 kB · risk low

### New packages

- **form-builder-1** · new package · form builder #269
- **field-placer-1** · new package · field placer #274
- **bank-account-field-1** · new package · bank account field #340
- **captcha-1** · new package · captcha #446
- **dictation-button-1** · new package · dictation button #447
- **navigation-stack-1** · new package · navigation stack #466
- **lottie-1** · new package · lottie #519
- **session-replay-1** · new package · session replay #550
- **generative-ui-1** · new package · generative ui #576

## Wave 3: the P3 rows

### Existing packages

- **table-9** · `c2-table` · bulk select #244 · +0.4 kB on 31.4 kB · risk low
- **table-10** · `c2-table` · example: mitre matrix #411, example: dose grid #424, example: requirement tree #433
- **virtual-list-2** · `c2-virtual-list` · data view #245 · +1.5 kB on 17.1 kB · risk medium
- **choice-matrix-3** · `c2-choice-matrix` · example: rotation editor #353
- **highlight-4** · `c2-highlight` · example: token heatmap #581, example: text suggestion #585
- **cascader-1** · `c2-cascader` · column browser #259 · +0.8 kB on 17.0 kB · risk low
- **textarea-2** · `c2-textarea` · sms field #391 · +0.3 kB on 2.9 kB, 1 kB lazy · risk low
- **json-form-1** · `c2-json-form` · calculated field #268 · +1.5 kB on 140.8 kB · risk medium
- **image-annotator-2** · `c2-image-annotator` · plan measure #379 (lazy), image labeler #583 (lazy) · +0.6 kB on 26.1 kB, 8 kB lazy · risk low
- **image-annotator-3** · `c2-image-annotator` · mask brush #584 (lazy) · +0.3 kB on 26.1 kB, 3 kB lazy · risk medium
- **core-3** · `@c2n/core` · selection area #463 (core), sliding indicator #484 (core)
- **pan-zoom-1** · `c2-pan-zoom` · deep zoom #285 (lazy) · +0.4 kB on 13.4 kB, 6 kB lazy · risk medium
- **scroll-area-2** · `c2-scroll-area` · acceptance gate #288, minimap #489 (lazy) · +0.5 kB on 3.4 kB, 2.5 kB lazy · risk low
- **date-selector-3** · `c2-date-selector` · example: year view #299
- **time-range-picker-1** · `c2-time-range-picker` · dynamic date range #296 · +1 kB on 29.1 kB · risk low
- **slider-2** · `c2-slider` · example: schedule strip #624 · needs the multi-thumb `c2-slider` listed in the roadmap
- **timeline-1** · `c2-timeline` · milestone timeline #312 · +0.4 kB on 2.9 kB · risk low
- **format-date-1** · `c2-format-date` · clock #314 · +0.3 kB on 1.9 kB · risk low
- **steps-3** · `c2-steps` · example: work instructions #382 · needs the wizard panels listed for `c2-steps` in the roadmap ("Extend instead of adding")
- **gantt-1** · `c2-gantt` · phase schedule #339 (lazy) · +0.4 kB on 14.6 kB, 6 kB lazy · risk medium
- **gantt-2** · `c2-gantt` · schedule windows #425 · +0.6 kB on 14.6 kB · risk low
- **org-chart-1** · `c2-org-chart` · metric tree #342, org position card #361 · +0.8 kB on 11.2 kB · risk low
- **chart-6** · `@c2n/chart` · allocation drift #346 · +0.4 kB on 45.0 kB · risk low
- **chart-7** · `@c2n/chart` · trend pens #376 · +0.8 kB on 2.6 kB · risk medium
- **chart-8** · `@c2n/chart` · range bar chart #529, waffle chart #530 (companion) · +0.6 kB on 37.2 kB, 4 kB new entry · risk low
- **chart-9** · `@c2n/chart` · polar chart #531 (companion), bump chart #532 · +0.6 kB on 34.0 kB, 4 kB new entry · risk low
- **chart-10** · `@c2n/chart` · horizon chart #533 (companion), violin chart #534 · +1.5 kB on 41.9 kB, 4 kB new entry · risk low
- **chart-11** · `@c2n/chart` · strip chart #535, density chart #536 (companion) · +0.6 kB on 30.8 kB, 5 kB new entry · risk low
- **chart-12** · `@c2n/chart` · mosaic chart #537 (companion), packed bubble chart #538 (companion) · 9 kB new entry · risk low
- **chart-13** · `@c2n/chart` · parallel chart #539 (companion), streamgraph #540 (companion) · 6 kB new entry · risk low
- **chart-14** · `@c2n/chart` · tree chart #541 (companion), vector chart #543 (companion) · 7 kB new entry · risk low
- **chart-15** · `@c2n/chart` · string line chart #544, interval chart #545 · +1.4 kB on 34.0 kB · risk low
- **chart-16** · `@c2n/chart` · vega chart #549 · +0.3 kB · risk medium
- **chart-17** · `@c2n/chart` · embedding explorer #582 · +0.3 kB on 30.8 kB, 3 kB lazy · risk medium
- **time-slot-picker-1** · `c2-time-slot-picker` · slot signup #363 · +0.8 kB on 11.9 kB · risk low
- **checkbox-2** · `c2-checkbox-group` · example: ballot #440
- **meter-2** · `c2-meter` · example: linear gauge #373
- **state-timeline-1** · `c2-state-timeline` · duty status graph #374 · +1 kB on 11.5 kB · risk low
- **flow-1** · `c2-flow` · energy flow #375 · +0.8 kB on 77.0 kB · risk medium
- **text-effect-1** · `c2-text-effect` · split flap #377 (lazy) · +0.2 kB on 4.2 kB, 1.5 kB lazy · risk low
- **text-effect-2** · `c2-text-effect` · text proximity #641 (lazy) · +0.2 kB on 4.2 kB, 1.5 kB lazy · risk medium
- **keypad-1** · `c2-keypad` · virtual keyboard #385 (lazy) · +0.5 kB on 4.8 kB, 2 kB lazy · risk low
- **money-input-1** · `c2-money-input` · example: discount input #395 · needs the secondary unit listed for `c2-money-input` in the roadmap
- **secret-field-2** · `c2-secret-field` · recovery codes #402 · +0.8 kB on 25.3 kB · risk low
- **mask-input-1** · `c2-mask-input` · ip input #401 · +0.2 kB on 6.2 kB, 1.5 kB lazy · risk low
- **truncate-1** · `c2-truncate` · fingerprint #406 (companion), content gate #518 · +0.3 kB on 2.1 kB, 1.5 kB new entry · risk low
- **terminal-1** · `c2-terminal` · terminal player #413 (lazy) · +0.3 kB on 8.2 kB, 3 kB lazy · risk low
- **date-time-picker-1** · `c2-date-time-picker` · restore point picker #415 · +0.6 kB on 29.2 kB · risk low
- **quantity-picker-1** · `c2-quantity-picker` · ticket selector #438, add to cart #617 · +1 kB on 19.9 kB · risk low
- **form-2** · `c2-form` · smart paste #590 · +0.4 kB on 4.9 kB · risk low
- **emoji-picker-2** · `c2-emoji-picker` · example: gif picker #613
- **shortcut-2** · `c2-shortcut` · key recorder #449 (companion) · 2 kB new entry · risk low
- **color-select-1** · `c2-color-select` · color field #450 (companion), color swatch #451 (companion) · 4 kB new entry · risk low
- **color-slider-1** · `c2-color-slider` · color wheel #452 · +1 kB on 9.3 kB · risk low
- **copy-button-1** · `c2-copy-button` · paste button #460 · +0.5 kB on 5.8 kB · risk low
- **link-button-1** · `c2-link-button` · download button #461 · +0.4 kB on 1.9 kB · risk low
- **tabs-2** · `c2-tabs` · transition panel #483 · +0.5 kB on 6.3 kB · risk low
- **sticky-2** · `c2-sticky` · sticky scope #490 · +0.4 kB on 1.5 kB · risk low
- **carousel-1** · `c2-carousel` · snap pager #482, coverflow #644 · +1 kB on 7.5 kB · risk low
- **modal-1** · `c2-modal` · dialog stack #485, morph dialog #486 · +0.9 kB on 2.9 kB · risk low
- **modal-2** · `c2-modal` · responsive dialog #487 · +0.6 kB on 2.9 kB · risk low
- **float-button-1** · `c2-float-button` · floating bubble #488 (lazy) · +0.2 kB on 5.8 kB, 2 kB lazy · risk low
- **progress-2** · `c2-progress` · harvey ball #512 · +0.2 kB on 2.7 kB · risk low
- **masonry-1** · `c2-masonry` · image collage #513 (lazy) · +0.2 kB on 9.9 kB, 2 kB lazy · risk low
- **change-review-1** · `c2-change-review` · merge editor #557 (lazy) · +0.3 kB on 16.7 kB, 7 kB lazy · risk medium
- **image-compare-1** · `c2-image-compare` · visual diff #558 · +0.8 kB on 3.7 kB, 2 kB lazy · risk low
- **code-viewer-1** · `c2-code-viewer` · blame view #559 · +0.5 kB on 6.5 kB · risk low
- **questionnaire-2** · `c2-questionnaire` · quiz #627 · +1 kB on 4.7 kB · risk low
- **working-indicator-1** · `c2-working-indicator` · job status #579 · +0.4 kB on 4.9 kB · risk low
- **transcript-1** · `c2-transcript` · captions #587 · +0.5 kB on 13.1 kB · risk low
- **audio-player-1** · `c2-audio-player` · media trimmer #594 (lazy), mini player #599 · +0.9 kB on 7.3 kB, 3 kB lazy · risk low
- **video-player-1** · `c2-video-player` · video preview #600, interactive video #601 · +1.2 kB on 33.2 kB · risk low
- **backdrop-1** · `c2-backdrop` · ambient backdrop #602 (lazy) · +0.2 kB on 3.5 kB, 2 kB lazy · risk medium
- **backdrop-2** · `c2-backdrop` · particles #645 (lazy) · +0.2 kB on 3.5 kB, 4 kB lazy · risk medium
- **backdrop-3** · `c2-backdrop` · shader backdrop #646 (lazy) · +0.2 kB on 3.5 kB, 6 kB lazy · risk medium
- **signature-pad-1** · `c2-signature-pad` · drawing pad #603 · +1 kB on 4.9 kB · risk low
- **image-cropper-1** · `c2-image-cropper` · focal point #605 · +0.5 kB on 6.4 kB · risk low
- **context-menu-1** · `c2-context-menu` · pie menu #606 (lazy) · +0.2 kB on 24.2 kB, 3 kB lazy · risk low
- **card-1** · `c2-card` · tilt #637 (lazy) · +0.1 kB on 2.1 kB, 1 kB lazy · risk medium · needs the pointer glow listed for `c2-card` in the roadmap (#173): build both in one module
- **scroll-progress-1** · `c2-scroll-progress` · scroll path #642 · +0.5 kB on 2.5 kB · risk low

### New packages

- **block-editor-1** · new package · block editor #270
- **add-to-calendar-1** · new package · add to calendar #313
- **slide-to-confirm-1** · new package · slide to confirm #326
- **quote-tile-1** · new package · quote tile #345
- **planogram-1** · new package · planogram #378
- **serp-preview-1** · new package · serp preview #390
- **post-preview-1** · new package · post preview #392
- **heat-overlay-1** · new package · heat overlay #393
- **certificate-viewer-1** · new package · certificate viewer #403
- **hex-viewer-1** · new package · hex viewer #407
- **port-panel-1** · new package · port panel #408
- **rack-elevation-1** · new package · rack elevation #409
- **waveform-viewer-1** · new package · waveform viewer #426
- **image-stack-viewer-1** · new package · image stack viewer #427
- **sequence-viewer-1** · new package · sequence viewer #430
- **molecule-viewer-1** · new package · molecule viewer #431
- **quick-exit-1** · new package · quick exit #441
- **curve-editor-1** · new package · curve editor #456
- **permission-request-1** · new package · permission request #459
- **grid-picker-1** · new package · grid picker #462
- **dock-layout-1** · new package · dock layout #479
- **resizable-1** · new package · resizable #480
- **transform-handles-1** · new package · transform handles #481
- **status-island-1** · new package · status island #502
- **ripple-1** · new package · ripple #503
- **page-loader-1** · new package · page loader #504
- **reading-time-1** · new package · reading time #517
- **model-viewer-1** · new package · model viewer #520
- **panorama-viewer-1** · new package · panorama viewer #521
- **surface-chart-1** · new package · surface chart #542
- **tile-map-1** · new package · tile map #547
- **graphviz-1** · new package · graphviz #548
- **element-picker-1** · new package · element picker #567
- **agent-screen-1** · new package · agent screen #580
- **read-aloud-button-1** · new package · read aloud button #588
- **redaction-text-1** · new package · redaction text #591
- **clip-timeline-1** · new package · clip timeline #595
- **image-editor-1** · new package · image editor #604
- **piano-roll-1** · new package · piano roll #608
- **video-scope-1** · new package · video scope #609
- **viewport-gizmo-1** · new package · viewport gizmo #610
- **joystick-1** · new package · joystick #611
- **reader-1** · new package · reader #612
- **danmaku-1** · new package · danmaku #615
- **prize-wheel-1** · new package · prize wheel #618
- **route-player-1** · new package · route player #621
- **breathing-guide-1** · new package · breathing guide #622
- **day-arc-1** · new package · day arc #623
- **ephemeral-media-1** · new package · ephemeral media #625
- **word-bank-1** · new package · word bank #630
- **match-pairs-1** · new package · match pairs #631
- **crossword-1** · new package · crossword #632
- **letter-grid-1** · new package · letter grid #633
- **chessboard-1** · new package · chessboard #634
- **branching-scenario-1** · new package · branching scenario #635
- **parallax-1** · new package · parallax #636
- **magnetic-1** · new package · magnetic #638
- **cursor-1** · new package · cursor #639
- **text-path-1** · new package · text path #640
- **physics-field-1** · new package · physics field #647
- **theme-panel-1** · new package · theme panel #648

## Not scheduled

### Folded into roadmap items

These rows have no host of their own: each is a mode of a component the roadmap already proposes, to build with it.

- live code #564: Roadmap #97 `c2-web-preview` beside a `c2-code-editor`
- code walkthrough #565: Roadmap `c2-scrolly` with a `c2-code-viewer` as the sticky graphic
- push to talk #589: Part of the proposed `c2-audio-recorder` (#85)
- video recorder #596: Build the proposed `c2-audio-recorder` (#85) media-agnostic
- flashcard #628: A mode of the proposed `c2-card-stack` (#234)
- scroll sequence #643: A mode of the proposed `c2-scrolly`

### Blocks, waiting for the blocks collection

Compositions of existing components. They need a place to live before they can be written: the blocks collection the roadmap plans (its wave-2 gate). Opening that collection is one step of its own, not listed here because it is a docs-site decision.

| Section                                                  | Rows                                                                                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules, formulas and automation                           | ordered rule list #261, sequence editor #263, sentence builder #267                                                                                                                                   |
| Import, documents and capture                            | signing order editor #286, esignature prompt #287                                                                                                                                                     |
| Dates, schedules and time                                | event calendar #297, time clock #308, time entry #309, timezone planner #310, opening hours #315                                                                                                      |
| Reviews, checklists and approvals                        | decision queue #320, status transition #322, acknowledgement #327                                                                                                                                     |
| Finance and accounting                                   | transaction matcher #334, three way match #335, payment schedule #336, score breakdown #341, options chain #343, order ticket #344, entity match review #347, per diem grid #348                      |
| Human resources and workforce                            | balance projection #350, time off request #351, merit grid #356, vesting schedule #357, meeting agenda #359, effective history #360, payroll calendar #362                                            |
| Operations, supply chain and industry                    | kds ticket #369, alarm list #370, andon tile #371, tree diff #372, dimensions input #380, tolerance input #381, cash count #383                                                                       |
| Sales, marketing and customer support                    | variant matrix #386, mail thread #387, reply composer #388, call panel #389, conversation player #394, rollout control #396                                                                           |
| IT, security and compliance                              | token inspector #404, public key field #405, process tree #412, cvss vector #414, retention editor #416, dns record card #417, queue position #418                                                    |
| Healthcare, legal, public sector, education and property | occupancy grid #423, well plate #429, field query #432, question navigator #434, attendance roll #435, stacking plan #436, amount picker #437, bid card #439                                          |
| Forms and inputs                                         | gradient editor #453, sides input #454, anchor picker #455, font picker #457, language select #458                                                                                                    |
| Navigation and layout                                    | app launcher #477, user menu #478, status bar #491, title bar #492, dropdown bar #493                                                                                                                 |
| Feedback, status and guidance                            | checklist launcher #498, whats new #500, feedback widget #501                                                                                                                                         |
| Data display and content                                 | persona #507, vote control #509, mention #511, filter grid #514, journey #515, glossary term #516, endpoint #522, page actions #523                                                                   |
| Charts and data visualisation                            | stock chart #546                                                                                                                                                                                      |
| Developer and data tools                                 | stack trace #551, notebook cell #552, field summary #556, query plan #560, search results #561, film strip #562, api playground #563, markdown editor #566                                            |
| AI and agent interfaces                                  | artifact panel #568, conversation list #569, ai label #572, chat launcher #573, prompt editor #575, message actions #577, message queue #578, dialogue editor #586, voice picker #592, ai button #593 |
| Media, voice and creative tools                          | device check #597, call controls #598, mixer #607, thread composer #614                                                                                                                               |
| Commerce, consumer and mobile patterns                   | variant picker #616, reward calendar #619, departure board #620                                                                                                                                       |
| Learning, quizzes and games                              | cloze #629                                                                                                                                                                                            |

### Covered today

Nothing to build. A gallery card that shows the existing component doing the job is welcome but optional.

- group bar #243: `c2-view-options`
- file input #283: `c2-upload`
- date field #291: `c2-date-input`
- time picker #292: `c2-time-input`
- image map #367: `c2-map-chart`
- unit map #410: `c2-treemap-chart`
- body map #420: `c2-map-chart`
- tooth chart #428: `c2-map-chart`
