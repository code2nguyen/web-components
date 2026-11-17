---
id: my-spec
title: One line saying what is built
size: scenario
focus: []
directions: [default]
---

<!--
size: scenario (one screen, a few components) | feature (one flow) | app (a whole product).
focus: for a scenario, the components it means to exercise, e.g. [c2-facet-list, c2-chip]. Leave it empty for a feature
       or an app: choosing the components is part of what the lab tests.
directions: the design directions to build. `default` is the theme as shipped; others are described under "Design
       directions" below and each becomes its own build in lab/apps/<id>/<direction>/.
Delete this comment in a real spec.
-->

## Purpose

What kind of product this is, who uses it, and what it is modelled on ("the filter sidebar of an online shop, as on
Zalando or REI"). Model the workflow and layout, not the branding.

## Screens

The regions of each screen and what changes on a phone.

## Data

The data model and the fixed sample data, written out in full, so every build shows the same records and the journeys
can expect exact values ("12 products", "3 in Tents").

## Requirements

One line each: an id, its capability tags from `lab/capabilities.md`, and what must be true in user terms.

- R1 [search.text] …
- R2 [filter.multi-value, filter.counts] …

## Tasks

What a person does, written in what they see. Each task names the requirements it proves. The lab journeys are written
from these, with the same ids (T1 → `t1-…`).

### T1 · Short task name (R1, R2)

- Given …
- When …
- Then …

## Design directions

Only when `directions` lists more than `default`: what each direction looks like (dense admin, a strong brand, roomy
consumer…). Style only through `--c2-theme--*` tokens, component `--c2-*` variables and documented `::part()` hooks.

## Builder rules

- Use `c2-*` components and `@c2n/theme` for every control and widget. Find them with the c2n MCP server
  (`search_components`, `get_component`, `get_examples`) and validate with `validate_markup`.
- Plain HTML only where no component fits, with a `<!-- dogfood-exempt: reason -->` comment. The requirement it serves
  is then `hand-rolled` in the build report.
- Never reach into a component's shadow root or override its internals. Needing to is a `workaround`.
