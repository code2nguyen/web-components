---
id: long-claim-form
title: An insurance claim form of 300 fields
size: feature
focus: []
directions: [default]
---

## Purpose

The claim form of an insurer or a government service, as in a tax return or a property damage claim: twelve sections
of twenty-five questions each, every field validated, sections that open and close, and a summary of the errors on
submit. A **performance** feature: typing must stay instant with 300 form controls on the page, and validating them
all must not freeze it.

## Screens

- **Header:** "Property damage claim", a progress line "Section 3 of 12 · 41 of 97 required answers", and Save draft.
- **Sections:** twelve disclosures, the first open, the others closed; each heading shows its count of answered
  required questions ("6 of 8").
- **Fields:** each question is a labelled control with its hint and error line.
- **Footer:** Submit claim, sticky at the bottom of the window.
- **Error summary:** on a submit with errors, a list at the top of every unanswered or invalid field, each leading to
  it (opening its section).

## Data

Sections, in order: Policyholder, Property, Incident, Damage to building, Damage to contents, Temporary housing,
Contractors, Police report, Witnesses, Photos and documents, Bank details, Declaration.

Question `f` (1 to 25) of section `s` (1 to 12) is labelled "Question `f`" with the hint "Section `s`, question `f`",
and its control follows `f mod 5`:

| `f mod 5` | Control                                | Rule                   |
| --------- | -------------------------------------- | ---------------------- |
| 1         | text field                             | at most 200 characters |
| 2         | number from 0 to 1,000,000             | whole number           |
| 3         | select of 5 options, "Option 1" to "5" |                        |
| 4         | date                                   | not after today        |
| 0         | checkbox "I confirm"                   |                        |

A question is required when `f` is a multiple of 3 (8 per section, 96 in all, plus the Declaration's checkbox 25 =
97 answers needed). The draft is kept in memory; Save draft only confirms.

## Measurement

Measured by the lab under 4× CPU throttling at 1280×800, as the mouse persona, the median of 3 runs, served from a
production build (`vite build` + `vite preview`).

## Requirements

- R1 [perf.load, form.validation] All 300 fields are on the page and the first section answers input within 2,000 ms
  of opening, with no task longer than 500 ms and layout shift at most 0.05.
- R2 [perf.interaction] Typing in any text field answers each keystroke within 100 ms, including the 300th field.
- R3 [perf.interaction, layout.disclosure] Opening or closing a section answers within 150 ms; a closed section's
  questions are still found by find-in-page.
- R4 [perf.interaction, form.error-summary] Submitting with every required answer missing shows the summary of all 97
  within 800 ms, with no task longer than 400 ms, and moves focus to it.
- R5 [form.error-summary, layout.disclosure] Choosing an entry of the summary opens its section and focuses its field
  within 200 ms.
- R6 [perf.memory] Filling the first section, then resetting the form, five times after a warm-up, adds at most 3 MB of
  heap and no DOM nodes.
- R7 [a11y.keyboard, a11y.screen-reader] Every field is reachable with Tab and named by its label; errors are tied to
  their fields.

## Tasks

### T1 · Open the form (R1)

- When I open the page
- Then "Property damage claim" shows, Policyholder is open, and Question 1 takes typing

### T2 · Type at the end (R2, R3)

- When I open Declaration and type a 40-character sentence in its Question 1
- Then every keystroke answers within the budget

### T3 · Submit empty (R4)

- When I submit the empty form
- Then the summary lists 97 problems within the budget, and focus is on it

### T4 · Follow an error (R5)

- When I choose the summary's entry for Witnesses, Question 3
- Then Witnesses opens and that field has focus

### T5 · Fill and reset (R6)

- When I fill Policyholder and reset the form, five times after a first round
- Then memory stays within the budget

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules). Render the 300 fields in markup (no virtualization of the
form): this feature is about the cost of many real form controls.
