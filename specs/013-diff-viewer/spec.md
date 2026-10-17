# Feature: `c2-diff-viewer` — read-only line diff of two texts

**Status**: Implemented in `packages/components/diff-viewer` (v1 scope below).
**Roadmap**: row 39 (section B), `c2-diff-viewer`, P2. Accepted on 2026-10-17; the row is removed now that it ships.
**Related**: `c2-code-viewer` shows one text with syntax highlighting; `c2-diff-viewer` shows what changed between two.

## Problem

Apps that change text on the user's behalf need a review step: an AI repair of a configuration, a generated file, a
template edited by someone else, a document revision. The reviewer has to see what changed before accepting it. The
first consumer is My Plan's admin page, which shows a repaired scraping plan (YAML, 20–300 lines) against the version
it repairs before the plan is tested and made live.

Today an app has to pull in a diff library and draw the result by hand, with no theming or accessibility.

## Research

Checked on 2026-10-17.

| Option                                                 | What it is                                               | Fit                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`diff`](https://www.npmjs.com/package/diff) (jsdiff)  | Myers line, word and character diffs, BSD-3              | Good algorithm, but about 15 kB minified for the parts we need; drawing is still ours.    |
| [`diff2html`](https://www.npmjs.com/package/diff2html) | Renders a unified diff string as HTML, with highlight.js | Rejected: takes a patch, not two texts, writes HTML strings, and brings its own CSS.      |
| Monaco / CodeMirror merge view                         | Full editor with a diff mode                             | Rejected: hundreds of kilobytes, and an editor where only reading is needed.              |
| Own Myers implementation                               | Line diff with prefix/suffix trimming, then a word diff  | **Chosen.** About 250 lines, no dependency; the component is about 8 kB gzipped in total. |

What GitHub, GitLab and Bitbucket agree on, and so what v1 copies:

- **Unified and split layouts**, unified by default; within a change, removed lines come before added ones.
- **Folded context**: three unchanged lines around each change, the rest behind an "expand" row.
- **Two line-number columns** in unified, one per side in split; `+` / `−` markers in their own column so copying the
  text does not copy them.
- **Word highlights** inside a changed line pair, stronger than the row tint.
- **"No newline at end of file"** on a last line without a final break, which then differs from the same line with one.

## Scope

**In v1**

- `original` and `modified` as attributes or properties. `\r\n` and `\r` count as line breaks.
- Line diff: Myers' O(ND) algorithm after trimming the common prefix and suffix. Past 2,000 edits in the middle the
  middle is shown as removed then added, so memory stays bounded (a few megabytes at worst).
- Word diff of each removed line and the added line at the same position of its change, on tokens (letters/digits/`_`
  runs, white-space runs, single punctuation marks). Skipped when the two lines share less than 40% of their
  characters (Dice), so a rewritten line reads as a whole. Two changed runs separated by one shared character are joined.
- `mode="unified" | "split"`; split falls back to unified below `--c2-diff-viewer--split-min-width` (600px).
- `context` (default 3); a fold hides at least two lines; a negative value shows everything. Identical texts show
  "No changes" and fold every line.
- `line-numbers`, `original-label`, `modified-label` (header with `+N −M`), `label` (accessible name).
- `fold-expand` event, `expandAll()`, read-only `stats` and `diff`, custom states `changed` and `split`.
- `diffLines`, `diffWords`, `diffStats`, `foldLines` and `splitLines` exported for use outside the element.

**Later (not v1)**

- Syntax highlighting. `c2-code-viewer` loads shiki (tens of kilobytes plus grammars, async), and colouring per line
  would need its tokens split by line; not cheap enough for v1. A `language` attribute can come later.
- Expanding a fold step by step (20 lines at a time), collapsing again, and hunk headers (`@@ -10,5 +10,6 @@`).
- Ignore white space or case, character-level highlights, moved-line detection.
- Virtualised rendering for very large texts; v1 targets a few thousand lines.
- Inline comments, accept/reject per hunk, editing.

## Public API

### Properties and attributes

| Property        | Attribute        | Type                       | Default     | Purpose                                                                                            |
| --------------- | ---------------- | -------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `original`      | `original`       | `string`                   | `''`        | The text before the change                                                                         |
| `modified`      | `modified`       | `string`                   | `''`        | The text after the change                                                                          |
| `mode`          | `mode`           | `'unified' \| 'split'`     | `'unified'` | Layout. Split draws unified while the element is narrower than `--c2-diff-viewer--split-min-width` |
| `context`       | `context`        | `number`                   | `3`         | Unchanged lines kept around each change; negative shows every line                                 |
| `lineNumbers`   | `line-numbers`   | `boolean`                  | `false`     | Original and modified line numbers                                                                 |
| `originalLabel` | `original-label` | `string`                   | `''`        | Header name of the original text                                                                   |
| `modifiedLabel` | `modified-label` | `string`                   | `''`        | Header name of the modified text                                                                   |
| `label`         | `label`          | `string`                   | `''`        | Accessible name; falls back to the "Changes" message                                               |
| `stats`         | —                | `{ additions, deletions }` | —           | Read-only counts                                                                                   |
| `diff`          | —                | `readonly DiffLine[]`      | —           | Read-only, every line in reading order                                                             |

Method: `expandAll()` opens every fold (no event).

### Events

| Event         | Detail                                    | Bubbles | Notes                                        |
| ------------- | ----------------------------------------- | ------- | -------------------------------------------- |
| `fold-expand` | `{ originalStart, modifiedStart, count }` | no      | The reader opened a fold (click or keyboard) |

Declared in `DiffViewerEventMap` with `TypedAddEventListener`.

### Slots, parts and variables

No slots. Parts: `header`, `original-label`, `modified-label`, `stats`, `body`, `line`, `line-number`, `marker`,
`content`, `word`, `fold`, `no-newline`, `empty`.

Every colour, border, radius and focus variable maps onto `@c2n/theme`: the frame, header, line numbers and fold row
onto the surface, ink and outline roles; added rows onto `chart-positive` and removed rows onto `color-error`, as
translucent `color-mix` washes so they tint the surface in both themes; the green text is mixed toward the ink for
4.5:1 contrast. There is no success token, so `chart-positive` (rising values) stands in for "added". The full list is
on the API tab.

## Accessibility

- The host is a `figure` (through `ElementInternals`) named by `label` or "Changes".
- The lines are a `<table>` with visually hidden column headers and a caption with the counts ("2 additions, 1
  deletion"). Each changed line's marker cell reads "Added" or "Removed"; the `+` / `−` glyph is `aria-hidden`.
- Fold rows are native buttons ("Show 6 unchanged lines").
- When the body scrolls (`--c2-diff-viewer--max-height`), it becomes a focusable, named group so the keyboard can
  scroll it.
- Line numbers and markers are not selectable, so copying a range copies the text only.
- Built-in text is in `src/messages.ts` (`diff-viewer` catalog) and translatable with `addTranslations`.

## Tests

`packages/components/diff-viewer/test/diff-viewer.spec.ts`, Chromium, Firefox and WebKit: insert, delete, change with
word highlights, a rewritten line without them, identical texts, empty sides, both empty, a missing final newline,
CRLF, folding with keyboard and pointer and the event, `expandAll`, `context` 0 and negative, split vs unified, folds
across the split, the narrow fallback, screen-reader markers, host semantics, scroll focus, theming variables,
`diffLines` edge cases (including a 3,000-line edit), no host attributes written, and axe scans of five states.
