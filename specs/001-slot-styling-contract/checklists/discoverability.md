# Slot Styling Discoverability Walkthrough

**Date**: 2026-09-20  
**Representative component**: `c2-card`  
**Success criterion**: Identify and apply both styling routes in under five minutes without reading component source.

## Reproducible procedure

- [x] Search the framework guide, Card API guide, and package README for `assigned`, `::part()`, `default slot`, and `body`.
- [x] Identify consumer-owned styling: apply an ordinary class to the node assigned to the default or named slot.
- [x] Identify component-owned styling: apply `c2-card::part(media|header|body|footer)` to the corresponding wrapper.
- [x] Confirm that `footer` is conditional and that a part selector cannot cross a slotted custom element's shadow root.
- [x] Run the Card browser assertion that applies both routes without changing slot assignment.

## Commands and evidence

```sh
/usr/bin/time -p rg -n "assigned|::part\(|default slot|body" \
  apps/ui/src/content/guides/frameworks.mdx \
  apps/ui/src/content/components/card.mdx \
  packages/components/card/README.md

/usr/bin/time -p npx playwright test \
  packages/components/card/test/card.spec.ts \
  --project=chromium --grep='public parts'
```

The documentation search completed in `0.00s`. The runtime application check passed in `1.87s` (`1 passed`). Total measured execution time was `1.87s`, comfortably below the five-minute target. The first command exposes both routes in all three documentation surfaces; the second verifies `media`, `header`, `body`, and `footer` public parts plus direct assigned-node styling.
