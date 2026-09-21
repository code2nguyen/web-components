# Quickstart: Validate the Slot Styling Contract

## Prerequisites

- Node.js 24
- Repository dependencies installed with `npm ci`
- Playwright browsers installed for full cross-browser validation

## 1. Validate the audit registry and documentation

```sh
npm run test:changed:unit
npm run docs:check
```

Expected outcome:

- Every published `(tag, slot)` has exactly one valid audit decision.
- The final report covers 91 custom elements, 296 public slots, and 296 documented CSS parts.
- Every publishable package has a runnable UI example using at least one documented CSS custom property or CSS part.
- All referenced parts, variables, and delegated tags resolve.
- Every slot-region part has explicit semantic documentation.
- No stale audit entries remain.

## 2. Verify the representative MVP packages

```sh
npm run build -w @c2n/card
npm run build -w @c2n/status-panel
npx playwright test packages/components/card/test packages/components/status-panel/test --project=chromium
```

Expected outcome:

- `custom-elements.json` for both packages contains the documented semantic parts.
- External `::part()` rules visibly affect the component-owned regions.
- Named/default slot assignment, visible fallbacks, conditional regions, and accessibility behavior still pass.

## 3. Verify conditional regions through SSR hydration

```sh
npm run test:hydration -w apps/ui
```

The Playwright project builds and serves the static Astro output, then hard-reloads `/web-components/components/pie-chart/gallery` and the representative Card page.

Expected outcome:

- All seven Pie Chart gallery examples are visible and measurable after custom-element upgrade.
- Card `media`, `header`, `body`, and `footer` regions reflect authored content rather than server-default absence.
- Every direct `hasSlottedContent` consumer and confirmed slotchange-only presence component passes its assigned, empty, insertion, removal, and whitespace scenario.
- The wider reactive slot-presence audit contains no authored region that remains hidden after hydration.

## 4. Verify chart lifecycle behavior

```sh
npm run check:lifecycle
npx playwright test packages/components/chart/test --project=chromium
```

Expected outcome:

- Line, Area, Bar, Sparkline, Pie, Gauge, Radar, Scatter, and Candlestick charts produce no Lit `change-in-update` warning.
- Initial engine options use committed CSS theme values.
- A runtime theme signal updates engine options and legend presentation exactly once.
- Breadcrumb, Menu, Step, Radio Group, Code Viewer, and Reorder List produce no avoidable Lit `change-in-update` warning in their first-update scenarios.

## 5. Check generated-manifest freshness

```sh
npm run build
git diff --exit-code -- ':(glob)packages/components/*/custom-elements.json' ':(glob)open-packages/*/custom-elements.json'
```

Expected outcome: the build produces no additional manifest diff beyond the intentional source-contract changes already staged for the feature.

## 6. Build consumer-facing documentation and examples

```sh
npm run ui:build
npm run examples:build
npm run test:browser -w apps/examples/support-inbox-vue
```

Expected outcome:

- API pages list the same slot-region parts and descriptions as the manifests.
- The scoped Vue example builds with a local class on assigned content and a public `::part()` rule for its component-owned region.

## 7. Rebuild AI-facing metadata

```sh
npm run build -w packages/tools/mcp
npm run mcp:smoke
```

Expected outcome: the AI registry exposes the same CSS-part names and semantic descriptions and the MCP smoke test passes.

## 8. Run repository-wide release gates

```sh
npm run build
npm run test:type-check
npm test
npm run docs:check
npm run lint:check
npm run format:check
```

For release validation, repeat component browser suites on Chromium, Firefox, and WebKit.

## Boundary check

The Astro hydration and Vue scoped-style Playwright projects automate these boundaries. When manually investigating a failure, confirm all of the following:

1. The consumer-owned assigned node receives its local/scoped class.
2. The host `::part(region)` rule affects the documented component-owned wrapper.
3. Removing the part rule leaves assigned-node styling intact.
4. Styling the parent part does not reach inside an assigned custom element's shadow root.
5. The slot's fallback appears and remains styleable when assigned content is removed.
6. A hard reload of an SSR page does not leave authored conditional slot regions hidden.
7. The console contains no `scheduled an update` warning for any chart example.
