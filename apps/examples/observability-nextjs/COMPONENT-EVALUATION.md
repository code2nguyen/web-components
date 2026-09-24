# c2n Evaluation: Signal Forge Observability

- **Evaluation date:** 2026-09-21
- **Feature:** [`specs/003-nextjs-observability/spec.md`](../../../specs/003-nextjs-observability/spec.md)
- **Runtime:** Node 24.15.0, Next.js 16.3.3, React 19.3.0, TypeScript 6.0.3, c2n 0.0.14
- **Deployment:** Next.js App Router static export at `/web-components/demo/observability-nextjs/`
- **Coverage:** Node unit tests; Playwright Chromium routine and Chromium/Firefox/WebKit portability sources; axe WCAG A/AA; keyboard, focus return, 200% zoom, 1280/768 px, reduced motion, themes, malformed URL/storage, bounded DOM, and offline requests
- **Commands:** app `type-check`, `test:unit`, `build`, and Playwright scripts
- **Limitations:** telemetry and destinations are deterministic and synthetic. There is no authentication, live ingestion, production evaluation, external delivery, or secret handling. Manual VoiceOver and NVDA checks were unavailable and are not claimed.

## Component inventory

`test/unit/component-usage.test.ts` derives rendered tags from source and requires one complete registry record per tag. Every component below is version 0.0.14.

| Tag · package                                   | Regions / public APIs exercised                                         | Outcome / positive pattern                                   | Findings             | Evidence                                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c2-header` · `@c2n/header`                     | Shell; slots, sticky/blurred, CSS variables                             | successful — semantic header composes with light-DOM links   | —                    | `components/app-shell/AppShell.tsx`                                                                                                                                 |
| `c2-side-nav` · `@c2n/side-nav`                 | Shell; `opened`, `opened-change`, responsive modes                      | successful — public state supports desktop/tablet navigation | —                    | `components/app-shell/AppShell.tsx`                                                                                                                                 |
| `c2-theme-select` · `@c2n/theme-select`         | Global scope; modes/value, `theme-change`                               | successful-with-workaround — one control covers all themes   | C2N-NEXT-004         | `components/scope/GlobalScopeControls.tsx`                                                                                                                          |
| `c2-icon-button` · `@c2n/icon-button`           | Shell/replay; toggle, selected, tooltip, click                          | successful — compact controls retain accessible names        | —                    | `components/app-shell/AppShell.tsx`                                                                                                                                 |
| `c2-button` · `@c2n/button`                     | Scope/dashboard/alerts; click, selected, slots                          | successful-with-workaround — styling/focus stay consistent   | C2N-NEXT-003/006     | `components/scope/GlobalScopeControls.tsx`                                                                                                                          |
| `c2-button-group` · `@c2n/button-group`         | Scope/dashboard; selection, appearance, change                          | successful-with-workaround — grouping/event model are useful | C2N-NEXT-003         | `components/scope/GlobalScopeControls.tsx`                                                                                                                          |
| `c2-link-button` · `@c2n/link-button`           | Details/recovery; href, target, rel                                     | successful-with-workaround — link semantics survive export   | C2N-NEXT-009         | `app/not-found.tsx`                                                                                                                                                 |
| `c2-select` · `@c2n/select`                     | Scope/filters; value, options, input/selection-change                   | successful-with-workaround — typed events work after upgrade | C2N-NEXT-004         | `features/services/ServiceFilters.tsx`                                                                                                                              |
| `c2-list-item` · `@c2n/list-item`               | Selects; value, selected, slot                                          | successful — readable light-DOM options preserve fallback    | —                    | `components/scope/GlobalScopeControls.tsx`                                                                                                                          |
| `c2-text-field` · `@c2n/text-field`             | Search/rules; value, input, clearable                                   | successful — native-like events simplify filters             | —                    | `features/services/ServiceFilters.tsx`                                                                                                                              |
| `c2-number-input` · `@c2n/number-input`         | Trace/rule thresholds; value/min/max/input                              | successful — bounded numeric state stays typed               | —                    | `features/alerts/AlertRuleForm.tsx`                                                                                                                                 |
| `c2-date-input` · `@c2n/date-input`             | Absolute range; value/min/max/input                                     | successful — constraints compose with URL state              | —                    | `components/scope/GlobalScopeControls.tsx`                                                                                                                          |
| `c2-checkbox` · `@c2n/checkbox`                 | Alert destinations; checked/value/change                                | successful — multi-selection remains explicit                | —                    | `features/alerts/AlertRuleForm.tsx`                                                                                                                                 |
| `c2-switch` · `@c2n/switch`                     | Rule enabled state; checked/change                                      | successful — boolean semantics are non-color-dependent       | —                    | `features/alerts/AlertRuleForm.tsx`                                                                                                                                 |
| `c2-card` · `@c2n/card`                         | Overview/dashboard; href, interactive, slots                            | successful — server-visible content is useful fallback       | —                    | `features/overview/OverviewDashboard.tsx`                                                                                                                           |
| `c2-stat` · `@c2n/stat`                         | Overview/service/dashboard; label/value/tone                            | successful — concise values need no wrapper API              | —                    | `features/overview/OverviewDashboard.tsx`                                                                                                                           |
| `c2-badge` · `@c2n/badge`                       | Health/severity/state; tone/text                                        | successful — visible labels accompany tone                   | —                    | `features/services/ServiceDetail.tsx`                                                                                                                               |
| `c2-table` · `@c2n/table`                       | Result sets; rows/columns/rowKey, sort/page/row events                  | successful-with-workaround — controlled large datasets work  | C2N-NEXT-004/007/008 | `features/services/ServiceTable.tsx`                                                                                                                                |
| `c2-table-column` · `@c2n/table`                | Trace/log columns; field/header/width/sortable                          | successful — declarative columns remain server-visible       | —                    | `features/traces/TraceResults.tsx`                                                                                                                                  |
| `c2-pagination` · `@c2n/pagination`             | Trace/log results; page/size/totals/events                              | successful — controlled paging maps to canonical URLs        | —                    | `features/traces/TraceResults.tsx`                                                                                                                                  |
| `c2-tabs` · `@c2n/tabs`                         | Alerts; value/selection-change                                          | successful — two collections share one keyboard surface      | —                    | `features/alerts/AlertsWorkspace.tsx`                                                                                                                               |
| `c2-tab` · `@c2n/tabs`                          | Alerts; value/selected/slot                                             | successful — labels remain in light DOM                      | —                    | `features/alerts/AlertsWorkspace.tsx`                                                                                                                               |
| `c2-details` · `@c2n/details`                   | Trace/dashboard/alert preview/developer guidance; label/expanded/toggle | successful — progressive detail reduces density              | —                    | `features/traces/TraceDetail.tsx`, `features/dashboards/OperationalDashboard.tsx`, `features/alerts/AlertRulePreview.tsx`, `components/built-with/BuiltWithC2n.tsx` |
| `c2-tree` · `@c2n/tree`                         | Trace waterfall; value/expandedItems                                    | successful — hierarchy accepts consumer timing labels        | —                    | `features/traces/TraceWaterfall.tsx`                                                                                                                                |
| `c2-tree-item` · `@c2n/tree`                    | Spans; value, label slot, expanded                                      | successful — slots support aligned timing evidence           | —                    | `features/traces/TraceWaterfall.tsx`                                                                                                                                |
| `c2-line-chart` · `@c2n/chart`                  | Service/dashboard; data, series, axes/grid/legend                       | successful — updates retain chart host                       | C2N-NEXT-002         | `features/services/ServiceMetrics.tsx`                                                                                                                              |
| `c2-area-chart` · `@c2n/chart`                  | Dashboard; data/revision/series                                         | successful — replay composition stays public                 | C2N-NEXT-002         | `features/dashboards/DashboardPanel.tsx`                                                                                                                            |
| `c2-bar-chart` · `@c2n/chart`                   | Dashboard; data/revision/series/legend                                  | successful — ranked comparisons stay declarative             | C2N-NEXT-002         | `features/dashboards/DashboardPanel.tsx`                                                                                                                            |
| `c2-sparkline` · `@c2n/chart`                   | Service table; data/auto tone                                           | successful — compact trend fits rich cell slot               | —                    | `features/services/ServiceTable.tsx`                                                                                                                                |
| `c2-chart-series` · `@c2n/chart`                | Service/dashboard; field/label/axis                                     | successful — named series remain readable                    | C2N-NEXT-002         | `features/services/ServiceMetrics.tsx`                                                                                                                              |
| `c2-dashboard` · `@c2n/dashboard`               | Dashboard; layout/resize/reset                                          | successful-with-workaround — track resizing is accessible    | C2N-NEXT-001/002     | `features/dashboards/OperationalDashboard.tsx`                                                                                                                      |
| `c2-dash-card` · `@c2n/dashboard`               | Panels; stable ID, placement, slots                                     | successful-with-workaround — DOM/visual order agree          | C2N-NEXT-001/002     | `features/dashboards/OperationalDashboard.tsx`                                                                                                                      |
| `c2-steps` · `@c2n/steps`                       | Incident/rule lifecycle; value/orientation                              | successful — lifecycle is understandable                     | —                    | `features/alerts/IncidentDetail.tsx`                                                                                                                                |
| `c2-step` · `@c2n/steps`                        | Lifecycle events; label/description/status                              | successful — each state is textual/chronological             | —                    | `features/alerts/IncidentDetail.tsx`                                                                                                                                |
| `c2-sheet` · `@c2n/sheet`                       | Log detail/developer guidance; open, close/cancel, slots                | successful — overlays preserve list context/focus            | —                    | `features/logs/LogDetailSheet.tsx`, `components/built-with/BuiltWithC2n.tsx`                                                                                        |
| `c2-modal` · `@c2n/modal`                       | Alert reset; open, close/cancel, actions                                | successful — local destructive reset is confirmed            | —                    | `features/alerts/AlertActions.tsx`                                                                                                                                  |
| `c2-toast` · `@c2n/toast`                       | Alert save/delivery; tone/message/duration                              | successful — feedback is concise/non-blocking                | —                    | `features/alerts/AlertsWorkspace.tsx`                                                                                                                               |
| `c2-status-panel` · `@c2n/status-panel`         | Empty/error/not-found; status/heading/actions                           | successful-with-workaround — recovery content is consistent  | C2N-NEXT-005         | `app/not-found.tsx`                                                                                                                                                 |
| `c2-skeleton` · `@c2n/skeleton`                 | Loading regions; CSS variables                                          | successful — page context stays stable                       | —                    | `app/loading.tsx`                                                                                                                                                   |
| `c2-progress` · `@c2n/progress`                 | Dashboard/alerts; value/max/label                                       | successful — progress has text label                         | —                    | `features/dashboards/DashboardPanel.tsx`                                                                                                                            |
| `c2-feather-activity` · `@c2n/feather-icons`    | Brand/trace nav; size/color                                             | successful — decorative beside text                          | —                    | `components/app-shell/AppShell.tsx`                                                                                                                                 |
| `c2-feather-home` · `@c2n/feather-icons`        | Overview nav; decorative                                                | successful — base styling is predictable                     | —                    | `components/app-shell/AppNavigation.tsx`                                                                                                                            |
| `c2-feather-server` · `@c2n/feather-icons`      | Service nav; decorative                                                 | successful — granular import works                           | —                    | `components/app-shell/AppNavigation.tsx`                                                                                                                            |
| `c2-feather-file-text` · `@c2n/feather-icons`   | Log nav; decorative                                                     | successful — no wrapper required                             | —                    | `components/app-shell/AppNavigation.tsx`                                                                                                                            |
| `c2-feather-bar-chart-2` · `@c2n/feather-icons` | Dashboard nav; decorative                                               | successful — cue never replaces text                         | —                    | `components/app-shell/AppNavigation.tsx`                                                                                                                            |
| `c2-feather-bell` · `@c2n/feather-icons`        | Alert nav; decorative                                                   | successful — shared size token aligns                        | —                    | `components/app-shell/AppNavigation.tsx`                                                                                                                            |
| `c2-feather-clock` · `@c2n/feather-icons`       | Baseline note; decorative                                               | successful — stroke inherits color                           | —                    | `components/app-shell/AppNavigation.tsx`                                                                                                                            |
| `c2-feather-menu` · `@c2n/feather-icons`        | Nav open; icon slot                                                     | successful — composes with icon-button                       | —                    | `components/app-shell/AppShell.tsx`                                                                                                                                 |
| `c2-feather-x` · `@c2n/feather-icons`           | Nav close; icon slot                                                    | successful — action has text alternative                     | —                    | `components/app-shell/AppShell.tsx`                                                                                                                                 |
| `c2-feather-play` · `@c2n/feather-icons`        | Replay start; prefix slot                                               | successful — icon and text update together                   | —                    | `components/scope/GlobalScopeControls.tsx`                                                                                                                          |
| `c2-feather-pause` · `@c2n/feather-icons`       | Replay pause; prefix slot                                               | successful — state is non-color-dependent                    | —                    | `components/scope/GlobalScopeControls.tsx`                                                                                                                          |
| `c2-feather-refresh-cw` · `@c2n/feather-icons`  | Replay reset; icon slot                                                 | successful — compact action retains name                     | —                    | `components/scope/GlobalScopeControls.tsx`                                                                                                                          |

## Findings

### C2N-NEXT-001 — Application-owned dashboard order and named sizes

- **Kind:** Improvement
- **Category:** Composition
- **Priority:** Medium
- **Affected package/tag and exact version:** `@c2n/dashboard@0.0.14`, `c2-dashboard`, `c2-dash-card`
- **Workflow/context:** `/dashboards/`, 1280/768 px, pointer/keyboard arrangement, reload/reset
- **Expected behavior:** One versionable layout contract represents stable card order and named whole-panel sizes.
- **Actual behavior:** `layout` applies placement and splitters resize tracks, but `storage-key` persists only track sizes.
- **Minimal reproduction steps:** Reorder six cards, assign a named card size, reload, and reconstruct both using only `storage-key`.
- **Evidence:** `features/dashboards/dashboard-layout.ts`, `OperationalDashboard.tsx`, `test/unit/dashboard-layout.test.ts`.
- **Workaround:** Persist stable IDs/named sizes in a validated app store and derive `DashCardPlacement`.
- **Recommended change:** Add an optional ordered-card value/event and serializer hook.
- **Disposition:** Open; synchronized root feedback entry “Dashboard persistence cannot represent ordered panels and named sizes”.

### C2N-NEXT-002 — Dashboard/chart composition succeeds through public contracts

- **Kind:** Successful pattern
- **Category:** API/types, accessibility, performance
- **Priority:** Low
- **Affected package/tag and exact version:** `@c2n/dashboard@0.0.14`, `@c2n/chart@0.0.14`
- **Workflow/context:** `/dashboards/`, seven panels, replay, keyboard resizing, reduced motion, text alternatives
- **Expected behavior:** Updates retain chart/dashboard engines and accessible alternatives.
- **Actual behavior:** Typed `layout`, `data`, and `revision` updates keep stable hosts; slots/CSS variables need no shadow access.
- **Minimal reproduction steps:** Advance replay, resize a separator, inspect adjacent text alternative.
- **Evidence:** `DashboardPanel.tsx`, `OperationalDashboard.tsx`, `test/dashboard-performance.spec.ts`.
- **Workaround:** None.
- **Recommended change:** Preserve the current data-update and semantic splitter/card contracts.
- **Disposition:** Successful pattern; no root entry.

### C2N-NEXT-003 — Button-group child identity is absent from button React types

- **Kind:** Improvement
- **Category:** API/types
- **Priority:** Medium
- **Affected package/tag and exact version:** `@c2n/button@0.0.14`, `c2-button`; `@c2n/button-group@0.0.14`, `c2-button-group`
- **Workflow/context:** Typed Next.js segmented time-mode control.
- **Expected behavior:** Each child exposes the stable `value` consumed by the group.
- **Actual behavior:** group reads child values while button React types reject `value`; state falls back to indexes.
- **Minimal reproduction steps:** Type-check `<c2-button-group><c2-button value="relative">`.
- **Evidence:** `components/scope/GlobalScopeControls.tsx`; root feedback.
- **Workaround:** Couple selection to documented child order/index.
- **Recommended change:** Expose/document child value or add a typed item-key API.
- **Disposition:** Open; synchronized root feedback entry “React types omit the c2-button value consumed by c2-button-group”.

### C2N-NEXT-004 — Serialized converter values are absent from React attribute types

- **Kind:** Improvement
- **Category:** Next.js integration, SSR/hydration, API/types
- **Priority:** Medium
- **Affected package/tag and exact version:** `@c2n/select@0.0.14`, `c2-select`; `@c2n/theme-select@0.0.14`, `c2-theme-select`
- **Workflow/context:** SSR environment/range/filter/theme controls and production hydration.
- **Expected behavior:** Documented serialized attributes type-check in server JSX and hydrate unchanged.
- **Actual behavior:** declarations accept property arrays only; scalar serialized attributes need post-upgrade assignment.
- **Minimal reproduction steps:** Type-check `c2-select value="production"` or serialized theme modes.
- **Evidence:** `components/c2n/element-bindings.ts`, `GlobalScopeControls.tsx`, `test/hydration.spec.ts`.
- **Workaround:** Render a matching default then assign after `customElements.whenDefined`.
- **Recommended change:** Generate the documented attribute representation alongside property types.
- **Disposition:** Open; synchronized root feedback entry “Serialized select and theme-select values are rejected by generated React types”.

### C2N-NEXT-005 — Status tone cannot encode loading and empty semantics

- **Kind:** Improvement
- **Category:** API/types, accessibility
- **Priority:** Low
- **Affected package/tag and exact version:** `@c2n/status-panel@0.0.14`, `c2-status-panel`
- **Workflow/context:** Loading/Empty/Error demonstration states across primary routes.
- **Expected behavior:** Loading and empty are distinct first-class states.
- **Actual behavior:** apps map loading to info and empty to neutral.
- **Minimal reproduction steps:** Type-check `status="loading"` or `status="empty"`.
- **Evidence:** `OverviewDashboard.tsx`, `AlertsWorkspace.tsx`.
- **Workaround:** Use `c2-skeleton` for loading and neutral panel with explicit empty heading.
- **Recommended change:** Add loading/empty or separate semantic state from visual tone.
- **Disposition:** Open; synchronized root feedback entry “c2-status-panel cannot describe loading or empty states semantically”.

### C2N-NEXT-006 — Button lacks native form submission semantics

- **Kind:** Improvement
- **Category:** Composition, accessibility, developer experience
- **Priority:** High
- **Affected package/tag and exact version:** `@c2n/button@0.0.14`, `c2-button`
- **Workflow/context:** New/edit alert rule, keyboard validation/save.
- **Expected behavior:** A design-system button can submit/reset a form with native Enter behavior.
- **Actual behavior:** no form association or button `type`; explicit handlers are required.
- **Minimal reproduction steps:** Put `c2-button` in a form and press Enter.
- **Evidence:** `features/alerts/AlertRuleForm.tsx`, `test/alerts.spec.ts`.
- **Workaround:** Explicit click/keyboard validation with error summary and first-invalid focus.
- **Recommended change:** Add ElementInternals form association and type/name/value semantics.
- **Disposition:** Open; synchronized root feedback entry “c2-button cannot submit a form through native form semantics”.

### C2N-NEXT-007 — Property-driven table action slots race upgrade/rendering

- **Kind:** Improvement
- **Category:** Events/bindings, composition
- **Priority:** High
- **Affected package/tag and exact version:** `@c2n/table@0.0.14`, `c2-table`
- **Workflow/context:** alert rule and incident row actions with rows/columns assigned after custom-element upgrade.
- **Expected behavior:** `cell:{rowKey}:{field}` interactive light-DOM slots deterministically attach after controlled property updates.
- **Actual behavior:** action controls were not consistently actionable during the property-driven upgrade/render sequence.
- **Minimal reproduction steps:** SSR a table with action-slot children, assign rows/columns after `whenDefined`, then keyboard/click the action immediately after hydration.
- **Evidence:** `features/alerts/AlertsWorkspace.tsx`, `test/alerts.spec.ts`; root feedback.
- **Workaround:** Keep dense row data in `c2-table` and put stable c2 row actions in an adjacent control region.
- **Recommended change:** Make slot redistribution deterministic after property updates and add a framework hydration regression test for interactive cells.
- **Disposition:** Open; synchronized root feedback entry “Property-driven table cell action slots are not reliably actionable during upgrade”.

### C2N-NEXT-008 — Property-driven tables have no meaningful static HTML projection

- **Kind:** Improvement
- **Category:** Next.js integration, SSR/hydration, accessibility
- **Priority:** High
- **Affected package/tag and exact version:** `@c2n/table@0.0.14`, `c2-table`
- **Workflow/context:** static-export trace/log/service result pages before JavaScript or component upgrade.
- **Expected behavior:** result headings and rows are meaningful in initial HTML and adopted during hydration.
- **Actual behavior:** rows/columns are property-only, so the exported custom element is empty until the client assigns them.
- **Minimal reproduction steps:** static-render a controlled table, disable JavaScript, and inspect the element's content.
- **Evidence:** `app/traces/page.tsx`, `app/logs/page.tsx`, `test/hydration.spec.ts`; root feedback.
- **Workaround:** Render a separate server light-DOM baseline and hide it after the URL-aware client mounts.
- **Recommended change:** Add a declarative/server renderer or hydration-friendly fallback/adoption contract.
- **Disposition:** Open; synchronized root feedback entry “Property-driven tables produce no meaningful static-export HTML”.

### C2N-NEXT-009 — Custom-element links require explicit framework base paths

- **Kind:** Improvement
- **Category:** Next.js integration, documentation, developer experience
- **Priority:** Medium
- **Affected package/tag and exact version:** `@c2n/link-button@0.0.14`, `c2-link-button`
- **Workflow/context:** trace/log correlations and recovery links under the static deployment base path.
- **Expected behavior:** application-local component links reach the same URL as framework-resolved links.
- **Actual behavior:** Next.js does not rewrite a custom element's href with `basePath`; consumers must construct the prefix.
- **Minimal reproduction steps:** render `c2-link-button href="/logs/"` with a Next basePath and follow it in the export.
- **Evidence:** `lib/query/internal-href.ts`, `features/traces/CorrelationActions.tsx`, `features/logs/CorrelationActions.tsx`, `test/hydration.spec.ts`; root feedback.
- **Workaround:** Route custom-element and fallback links through the app's centralized deployment-aware href helper, or use Next `Link` for internal navigation.
- **Recommended change:** Add framework guidance or a small resolved-href adapter while keeping link semantics.
- **Disposition:** Open; synchronized root feedback entry “c2-link-button does not participate in Next.js base-path routing”.

## Category conclusions

### Library follow-up implemented 2026-09-23

The follow-up adds versioned dashboard order persistence and serializer hooks; typed button values and serialized React attributes; loading/empty status states; form-associated submit/reset buttons; a table SSR fallback slot; and documented Next.js base-path resolution. Button-group cascade protection and a CSS-contract validator are also included. Dashboard named sizes still use application metadata, and the original table action-slot hydration race remains open: a package regression passes for property-driven updates, but no runtime fix or Next.js hydration reproduction has confirmed its resolution. Package regressions, generated manifests/types, documentation checks, and the observability app type-check cover the implemented contracts.

- **Next.js integration:** client registration, serialized attribute typing, and base-path guidance now cover the observed integration gaps.
- **SSR/hydration:** default HTML is meaningful, first snapshots match, property data uses one helper, and tables expose a semantic fallback projection.
- **API/types:** JSX contracts include button child identity and structured converter attribute strings.
- **Events/bindings:** typed native-like/custom events work without wrappers and clean up under Strict Mode.
- **Styling:** documented CSS variables cover the app; no shadow-root selectors are used.
- **Composition:** slots cover cards, trees, charts, overlays, and timelines; dashboard order and form submission now have public contracts, while named card sizes remain application owned.
- **Accessibility:** visible text accompanies tone, charts have summaries, overlays restore focus; manual screen-reader checks remain.
- **Documentation:** manifests/pages locate APIs; the framework guide covers SSR attribute forms, table fallback, and Next.js base paths.
- **Performance:** data is bounded, tables paginate/window, replay updates stable chart hosts; no lab timing is claimed.
- **Developer experience:** one registry/property helper/event hook and usage registry keep integration auditable.

## Validation evidence and manual record

- Unit coverage includes 89 passing tests for generator/indexes, canonical URL/storage/replay state, scoped service derivation, deterministic full-horizon cross-signal replay, searches, dashboard layout, alert overlays, deployment-aware links, shared scope, route-accurate component mapping, registry, and report audit.
- Type-check and the production static export pass; the export generates 232 pages with paused default HTML and known service, trace, incident, and baseline rule routes.
- The direct docs application build passes, copies all six examples from their declared output directories (including this app's `out/` export), and emits 239 documentation pages.
- Root lint, formatting, documentation, and dogfood checks pass. The aggregate `examples:build` and therefore its dependent root `ui:build` remain blocked because the unrelated pre-existing Angular example aborts in `ng build` with `SIGABRT`; the same Angular command aborts when run alone. The docs application build itself passes after example synchronization.
- Playwright sources cover browser portability, axe, keyboard/focus, 200% zoom, responsive layouts, themes/motion, edge cases, DOM bounds, and local-only requests.
- **Manual AT:** VoiceOver/Safari and NVDA/Firefox-or-Chrome were unavailable; no screen-reader result is claimed.
- **Performance environment:** Node 24.15.0, production static export, planned one-worker measurements; deterministic assertions cover bounded DOM and stable chart hosts.
- Direct preview hit sandbox `listen EPERM`; browser, quickstart interaction, keyboard-only, zoom, and measured performance suites were not executed in this environment and need an approved loopback-capable host/CI.

## Completion audit

- Every rendered tag has a registry record and inventory row.
- Every required category has a conclusion.
- Every open finding has priority, reproduction, evidence, workaround, recommendation, and root feedback.
- Positive public patterns are recorded.
- No SigNoz branding, source, proprietary layout, or assets are used.
- Constitution I is satisfied through the typed usage registry and published component contracts; this feature adds no undocumented component API.
- Constitution II is satisfied because application customization uses documented CSS variables, parts, and slots without shadow-root access.
- Constitution III is satisfied by the runnable, production-shaped static application and complete observability journeys.
- Constitution IV is satisfied because no public component contract changed; all unresolved consumer friction is synchronized with the root feedback log.
- Constitution V has implementation and source-level automated coverage, but the release evidence remains incomplete until the loopback browser suites and the explicitly listed manual assistive-technology checks run on an approved host.
