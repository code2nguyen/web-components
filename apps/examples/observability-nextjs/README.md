# Signal Forge Observability

A deterministic, static-exported Next.js App Router application that exercises c2n components through realistic service-health, trace, log, dashboard, alert, and incident workflows. The product and information design are original; only the general observability problem space is SigNoz-inspired.

The application uses synthetic local telemetry only. It has no authentication, backend, live ingestion, production alert evaluation, or external notification delivery.

## Architecture

- Server components emit a meaningful paused baseline. Focused client boundaries apply URL scope after hydration and own replay, local preferences, filters, overlays, and form interactions.
- `lib/data/generator.ts` produces the same normalized 16-service, 180-trace, 1,200-log corpus from one fixed seed and UTC baseline. It includes eight rules, six incidents, and fixed synthetic destinations.
- Canonical query codecs preserve environment, time, filters, sorting, page, and page size. Invalid parameters recover independently.
- Versioned browser stores are limited to alert overlays, desktop/tablet dashboard layouts, and theme. Reset demo data does not clear dashboard or theme preferences.
- The static export pre-generates every known service, trace, incident, and baseline rule route and is copied into the documentation site from `out/`.

## c2n integration patterns

`components/c2n/C2Registry.tsx` is the one runtime registration owner. Generated package `/react` declarations augment JSX but intentionally provide no wrapper runtime. Object properties such as table rows, chart data, selected values, and dashboard layout are assigned only after `customElements.whenDefined` through `useElementProperties`. Kebab-case or non-bubbling custom events are subscribed directly with `useCustomEvent`, which remains safe through React Strict Mode setup/cleanup.

All visual customization uses documented `--c2-*` variables bridged to the app's `--sf-*` tokens. The app does not query or style component shadow roots. Charts always have adjacent text or data alternatives; status color always has a visible label.

The in-app **Built with c2n** sheet maps each page region to package documentation and representative source. The typed registry in `lib/data/component-usage.ts` is also the source for the coverage audit.

## Workflows

- Overview → degraded service → failed/slow trace → correlated logs.
- Canonical, shareable trace and log searches with 25/50/100-row paging and detail return context.
- Seven-panel operational dashboard with deterministic replay and keyboard move/size commands persisted independently for desktop and tablet.
- Incident timelines plus locally created/edited alert rules, historical preview, fixed synthetic destinations, and bounded reset.
- Normal, Loading, Empty, and Error evaluator states that never enter the investigation URL or persistence.

## Commands

```bash
npm run dev -w apps/examples/observability-nextjs
npm run build -w apps/examples/observability-nextjs
npm run test:unit -w apps/examples/observability-nextjs
npm run test:e2e -w apps/examples/observability-nextjs
npm run test:e2e:all -w apps/examples/observability-nextjs
npm run test:a11y -w apps/examples/observability-nextjs
```

The preview is served under `/web-components/demo/observability-nextjs/`, matching GitHub Pages. No environment variables, account, database, secret, real address, arbitrary endpoint, or external telemetry service is accepted.

See [COMPONENT-EVALUATION.md](./COMPONENT-EVALUATION.md) for the complete c2n integration assessment and [`specs/003-nextjs-observability/quickstart.md`](../../../specs/003-nextjs-observability/quickstart.md) for end-to-end validation.
