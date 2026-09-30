---
name: gallery-audit
description: Audit the docs gallery cards (apps/ui gallery pages) in the light and the dark theme for text contrast, unregistered c2-* tags, empty cards, overflow and console errors, then triage the findings. Use when asked to check, audit or validate the gallery, a component's gallery cards, dark mode readability or contrast, or to run the gallery audit (locally or in CI).
argument-hint: '[component-id…] [--ci]'
---

# Gallery audit

The audit walks every card of `/components/<id>/gallery` in both themes, the same walk as the gallery screenshots
(`apps/ui/scripts/gallery-shots.mjs --audit`). It is opt-in because it needs the built site and a few minutes for the
whole gallery, so run it when asked, or after changing gallery MDX, component styles, or the theme.

Running it is an explicit request to drive a browser: the CLAUDE.md "Browser usage" rule does not forbid it here.

## Choose where to run

- **Locally** (default): fastest feedback for a few components, and the screenshots can be opened with Read.
- **In CI** (`--ci`, or when the session cannot build the site): trigger the `Gallery audit` workflow
  (`.github/workflows/gallery-audit.yml`, `workflow_dispatch`, input `components`) on the branch with the GitHub
  tools, or add the `gallery-audit` label to the PR so it runs on every push until the label is removed. Read the
  job summary or the `gallery-audit` artifact (`report.md`, `report.json`, `shots/`).

## Run locally

1. Build what the audit serves and reads, skipping what is fresh:
   - components: `npm run build` (wireit-cached);
   - the site: `npm run ui:build`, or `cd apps/ui && npx astro build` when the example apps are already built or
     cannot build (Angular needs Node ≥ 22.22.3);
   - the registry (card order and slugs): `npm run build:tools`.
2. Audit, limited to the components in question when there are any:

   ```bash
   npm run gallery:audit -- --no-shots button tabs      # drop --no-shots to also write screenshots
   ```

   If Playwright reports a missing browser build (a container with a pinned Chromium), point it at the installed one:
   `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run gallery:audit -- …`. Do not run `playwright install` there.

3. Read `test-results/gallery-audit/report.md` (also printed). Exit code 1 means new findings or stale known entries.

## Triage

Each finding is keyed `<gallery>/<slug|*>/<theme>/<kind>`:

| kind           | usual cause and fix                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contrast`     | a card colour that does not flip in dark mode, or a weak accent. Route neutrals through the theme (see the gallery rules in CLAUDE.md); pick a stronger hue. |
| `unregistered` | a `c2-*` tag inside a `client:only` parent whose module does not import it. Register it from the parent's module or the page.                                |
| `empty`        | the card renders no visible box: a failed island, a zero height, an element waiting for data.                                                                |
| `overflow`     | content wider than the 274px card frame. Let it wrap or shrink, or give the card a wider layout.                                                             |
| `console`      | an error or uncaught exception on the gallery page, often a hydration mismatch. Fix the component.                                                           |
| `mismatch`     | page cards disagree with the registry order: rebuild the registry (`npm run build:tools`).                                                                   |

Confirm a contrast or layout finding on the screenshot before changing anything (run without `--no-shots`, then
Read `apps/ui/dist/gallery-shots/<id>/<slug>.<theme>.png`). The report also counts text axe could not measure (over
an image or a gradient the card paints); a sudden rise there means the check went blind, not that the cards got better.

## The known list

`apps/ui/gallery-audit.known.json` holds the findings that predate the audit (key → reason). It only shrinks:

- after fixing a card, delete its entries; a stale entry fails the run on purpose;
- add an entry only for a problem deliberately deferred, with the reason as its value, and say so to the user;
- never add entries to get a run green without that.

## Report

List the findings by kind with the card names, what you fixed (and the entries removed), what you deferred and why,
and anything that needs a design decision (a new accent colour, a token value) rather than a mechanical fix.
