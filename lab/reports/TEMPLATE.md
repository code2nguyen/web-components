---
spec: my-spec
direction: default
build: lab/apps/my-spec/default
target: my-spec
builder: agent (Claude Code, c2n MCP server)
date: YYYY-MM-DD
---

# Build report: my-spec / default

How it was built (framework or none, the tools used) and the lab run it passed: journeys × personas, repeats.

## Requirements

One row per requirement of the spec, none left out. **Outcome** is one of:

- `met`: a component does it as documented;
- `workaround`: met, but with extra code, a `::part` override, an undocumented trick, or a second component glued on;
- `hand-rolled`: no component fits, so it is plain HTML (with a `dogfood-exempt` comment);
- `failed`: it could not be done.

**Components**: the first one listed is the one the note is about; the gap matrix files the shortfall under it. List
the others that took part after it.

| Req | Outcome | Components | Notes |
| --- | ------- | ---------- | ----- |
| R1  | met     | c2-…       |       |

## Friction outside the requirements

What was awkward while building: documentation, the MCP server, an API that was right but hard to find.

## Missing components

Components that would have met a `hand-rolled` or `workaround` requirement outright.

## Proposed capabilities

New tags for `lab/capabilities.md`, if a requirement needed one. None, usually.
