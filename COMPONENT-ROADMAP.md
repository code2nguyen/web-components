# Component roadmap

Candidate primitives for c2n, researched on 2026-10-04: 100 patterns that production design systems ship and c2n lacks, and 68 more seen in real products. Nothing here is decided. Each row starts as **Proposed**; set the Decision cell to **Accept**, **Reject** or **Later** as you validate it, and add a short reason when you reject one.

An accepted item is built with `npm run generate` (see the `new-component` skill) and removed from this file once it ships. Components with an open PR are not listed.

## Summary

The roadmap adds 168 new primitives to c2n, taking it from 127 `c2-*` elements to about 295. The first 100 come from design systems; the next 68 from about 90 real products. Every item passed three checks:

- **Not already in c2n.** Checked against all 127 element tags on `develop` (v0.0.24, 2026-10-03). Where an existing component covers part of a need, the item says what it adds.
- **Not already in flight.** Components with an open PR are excluded (next section).
- **Proven in real products.** Each item names a design system or product that ships the same pattern, so the API can follow a known-good model.

Items are grouped by domain. Priority **P1** means other items depend on it or it appears in almost every app, **P2** means common in business apps, and **P3** means specialized.

## Already in flight (excluded)

Four open PRs add components, checked on 2026-10-04. None of them is on this roadmap.

| PR | Component | Opened |
| --- | --- | --- | --- |
| [#182](https://github.com/code2nguyen/web-components/pull/182) | `c2-working-indicator` | 2026-10-04 |
| [#151](https://github.com/code2nguyen/web-components/pull/151) | `c2-kanban` board | 2026-10-02 |
| [#141](https://github.com/code2nguyen/web-components/pull/141) | `@c2n/gantt`, read-only Gantt chart | 2026-10-01 |
| [#129](https://github.com/code2nguyen/web-components/pull/129) | `@c2n/google-map`: map, markers, route, Street View | 2026-09-30 |

The other open PRs ([#181](https://github.com/code2nguyen/web-components/pull/181) feedback docs, [#76](https://github.com/code2nguyen/web-components/pull/76) Log Lens example app) add no component. Because of #129, map primitives (markers, routes, geo pickers) are left off too.

## Where the patterns come from

The list comes from comparing c2n with the component inventories of 12 production design systems, read from their published npm packages on 2026-10-04. A pattern made the list when several of them ship it and c2n has no equivalent.

| Design system | Package read | Used by |
| --- | --- | --- | --- |
| [Ant Design](https://www.npmjs.com/package/antd) | `antd` 6.6.5 | Alibaba, Ant Group admin and fintech apps |
| [Mantine](https://www.npmjs.com/package/@mantine/core) | `@mantine/core` + `@mantine/dates` 9.6.3 | React SaaS dashboards |
| [Chakra UI](https://www.npmjs.com/package/@chakra-ui/react) | `@chakra-ui/react` 3.37.0 | React apps |
| [Ark UI](https://www.npmjs.com/package/@ark-ui/react) | `@ark-ui/react` 5.39.2 | Headless behavior layer of Chakra and Park UI |
| [PrimeVue](https://www.npmjs.com/package/primevue) | `primevue` 5.0.2 | Enterprise Vue apps |
| [Web Awesome](https://www.npmjs.com/package/@awesome.me/webawesome) | `@awesome.me/webawesome` 3.14.0 | Web components (successor to Shoelace) |
| [Carbon](https://www.npmjs.com/package/@carbon/web-components) | `@carbon/web-components` 2.64.0 | IBM products |
| [Spectrum](https://www.npmjs.com/package/@spectrum-web-components/bundle) | `@spectrum-web-components/bundle` 1.12.4 | Adobe Photoshop and Express on the web |
| [Fluent 2](https://www.npmjs.com/package/@fluentui/web-components) | `@fluentui/web-components` 3.1.3 | Microsoft 365 |
| [Vaadin](https://www.npmjs.com/package/@vaadin/react-components) | `@vaadin/react-components` 24.10.8 | Enterprise Java/React apps |
| [Polaris](https://www.npmjs.com/package/@shopify/polaris) | `@shopify/polaris` 13.9.5 | Shopify admin |
| [Material Web](https://www.npmjs.com/package/@material/web) | `@material/web` 2.5.0 | Google |

Domain patterns with no design-system home come from the products that made them common: Stripe (payments, API keys), Linear and Jira (filters, inline edit), Figma and Google Docs (comments, live cursors), Slack and GitHub (reactions, mentions), Calendly (slot picking), Binance and Coinbase (order books) and ChatGPT, Claude and Perplexity (AI patterns). Those references come from general product knowledge, not from fetched pages.

## The 100 primitives

100 components in 9 domains: 21 P1, 51 P2 and 28 P3. Shipped rows are removed, so 98 remain (19 P1): `c2-inline-edit` (#16) shipped in v1.0.3 and `c2-chip` (#27) is built. Numbering is for reference only. Build order is in the delivery plan below.

### A. Forms and input (24)

| #   | Component             | What it adds                                                                                        | Real-world model                                                                | Priority | Decision |
| --- | --------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- | -------- |
| 1   | `c2-form`             | Validation across fields, submit handling, error summary, dirty tracking                            | antd Form, Carbon form, Polaris Form                                            | P1       | Proposed |
| 2   | `c2-form-field`       | Label, hint, error and counter wrapper around any control, with `aria-describedby` wired up         | Ark/Chakra field, Polaris Labelled, Vaadin FormItem                             | P1       | Proposed |
| 3   | `c2-fieldset`         | Grouped controls with a legend and a disabled state that cascades                                   | Ark/Chakra fieldset, PrimeVue fieldset                                          | P2       | Proposed |
| 4   | `c2-checkbox-group`   | Form-associated group of checkboxes with one value array (the counterpart of `c2-radio-group`)      | Web Awesome, Vaadin, PrimeVue checkbox group                                    | P1       | Proposed |
| 5   | `c2-choice-card`      | Card-sized radio or checkbox for plan, shipping or payment choices                                  | Chakra radio/checkbox card, Carbon options tile; Stripe and Vercel plan pickers | P2       | Proposed |
| 6   | `c2-search-field`     | Debounced query, clear, shortcut hint, recent searches                                              | Carbon search, Spectrum search; GitHub, Linear                                  | P1       | Accept   |
| 7   | `c2-password-field`   | Reveal toggle, strength meter, rules checklist                                                      | Ark/Carbon password input, PrimeVue password                                    | P2       | Proposed |
| 8   | `c2-mask-input`       | Pattern masks (IBAN, tax ID, postcode)                                                              | Mantine MaskInput, PrimeVue inputmask                                           | P2       | Proposed |
| 9   | `c2-phone-input`      | Country picker, flag, E.164 value                                                                   | Stripe and Twilio sign-up flows                                                 | P2       | Proposed |
| 10  | `c2-money-input`      | Currency code, locale grouping, minor units as an integer value                                     | Stripe dashboard, Polaris money fields                                          | P1       | Proposed |
| 11  | `c2-date-time-picker` | Date and time in one popup with time zone                                                           | Mantine DateTimePicker, Vaadin DateTimePicker                                   | P2       | Proposed |
| 12  | `c2-month-picker`     | Month or year granularity (billing periods, card expiry)                                            | Mantine MonthPicker / YearPicker                                                | P2       | Proposed |
| 13  | `c2-tree-select`      | Select from a hierarchy, single or multiple                                                         | antd TreeSelect, Mantine TreeSelect, PrimeVue treeselect                        | P2       | Proposed |
| 14  | `c2-transfer-list`    | Move items between two lists (roles, permissions)                                                   | antd Transfer, PrimeVue PickList                                                | P3       | Proposed |
| 15  | `c2-mention-input`    | `@user` and `#tag` suggestions inside text                                                          | antd Mentions; Slack, GitHub                                                    | P2       | Proposed |
| 17  | `c2-rich-text-editor` | Compact formatted-text field for comments and emails (`c2-page-editor` stays the full block editor) | PrimeVue Editor, Mantine Tiptap; Gmail, Linear comments                         | P2       | Proposed |
| 18  | `c2-image-cropper`    | Crop, zoom and rotate before upload (avatars, logos)                                                | Ark image cropper                                                               | P2       | Proposed |
| 19  | `c2-signature-pad`    | Draw a signature, export SVG or PNG                                                                 | Ark signature pad; DocuSign                                                     | P3       | Proposed |
| 20  | `c2-angle-slider`     | Circular knob for angles and dials                                                                  | Ark/Mantine angle slider, PrimeVue Knob                                         | P3       | Proposed |
| 21  | `c2-emoji-picker`     | Searchable emoji grid with skin tones and recents                                                   | Slack, GitHub, Discord                                                          | P2       | Proposed |
| 22  | `c2-cron-input`       | Build a recurring schedule, output a cron expression                                                | Vercel cron jobs, GitHub Actions schedules                                      | P3       | Proposed |
| 23  | `c2-duration-input`   | Accepts "1h 30m" and "90m", stores seconds                                                          | Jira time tracking, Toggl                                                       | P3       | Proposed |
| 24  | `c2-secret-field`     | Masked secret with reveal, copy and regenerate                                                      | Stripe and OpenAI API key pages                                                 | P2       | Proposed |
| 25  | `c2-card-input`       | Card number, expiry and CVC with brand detection and Luhn check                                     | Stripe Elements card field                                                      | P2       | Proposed |

### B. Data display (22)

| #   | Component             | What it adds                                                                  | Real-world model                                                                     | Priority | Decision |
| --- | --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- | -------- |
| 26  | `c2-description-list` | Read-only key/value pairs for detail pages, in columns that wrap responsively | antd Descriptions, Polaris DescriptionList, Chakra data list, Carbon structured list | P1       | Proposed |
| 28  | `c2-status-light`     | Coloured dot plus label for states such as Live, Failed or Building           | Spectrum status light, Carbon shape indicator, Chakra Status; Vercel deployments     | P1       | Proposed |
| 29  | `c2-indicator`        | Dot or count pinned to the corner of any element                              | Mantine Indicator, PrimeVue OverlayBadge, Fluent counter badge                       | P2       | Proposed |
| 30  | `c2-relative-time`    | "3 min ago" that updates itself, locale-aware, full date on hover             | Web Awesome relative-time, GitHub relative-time-element                              | P1       | Proposed |
| 31  | `c2-format-number`    | Locale number, currency, percent, compact and byte formatting                 | Web Awesome format-number/format-bytes, Mantine NumberFormatter                      | P1       | Proposed |
| 32  | `c2-format-date`      | Locale and time-zone-aware date display                                       | Web Awesome format-date                                                              | P2       | Proposed |
| 33  | `c2-truncate`         | Clamp to N lines with "Show more" and a full-text tooltip                     | Carbon truncated text, Polaris Truncate, Mantine Spoiler                             | P1       | Proposed |
| 34  | `c2-highlight`        | Highlight the parts of a text that match a query                              | Mantine Highlight, Ark highlight                                                     | P3       | Proposed |
| 35  | `c2-meter`            | Value inside a known range, or several segments (storage, quota)              | Spectrum meter, PrimeVue MeterGroup; Google Drive storage bar                        | P2       | Proposed |
| 36  | `c2-countdown`        | Countdown or stopwatch with an event when it finishes                         | Ark timer, antd Statistic.Countdown                                                  | P2       | Proposed |
| 37  | `c2-rolling-number`   | Digits that roll when a value changes                                         | Mantine RollingNumber; Robinhood tickers                                             | P3       | Proposed |
| 38  | `c2-json-viewer`      | Collapsible, searchable JSON tree with copy-path                              | Ark JSON tree view; Postman, Chrome DevTools                                         | P2       | Proposed |
| 39  | `c2-diff-viewer`      | Side-by-side or unified text diff                                             | GitHub and GitLab diffs                                                              | P2       | Proposed |
| 40  | `c2-markdown`         | Safe markdown renderer that handles streaming, for chat answers and READMEs   | Web Awesome markdown, Vaadin Markdown                                                | P2       | Proposed |
| 41  | `c2-image`            | Lazy loading, placeholder, fallback and click-to-preview                      | antd Image                                                                           | P2       | Proposed |
| 42  | `c2-image-viewer`     | Fullscreen lightbox with zoom, pan, rotate and a thumbnail strip              | PrimeVue Galleria, antd Image preview group                                          | P2       | Proposed |
| 43  | `c2-image-compare`    | Before/after slider                                                           | Web Awesome comparison, PrimeVue ImageCompare                                        | P3       | Proposed |
| 44  | `c2-video-player`     | Themed controls, captions, chapters                                           | Loom, YouTube                                                                        | P3       | Proposed |
| 45  | `c2-audio-player`     | Waveform playback for voice notes and recordings                              | Slack clips, WhatsApp voice notes                                                    | P3       | Proposed |
| 46  | `c2-pdf-viewer`       | Paged PDF preview with zoom and search                                        | DocuSign, Gmail attachment preview                                                   | P3       | Proposed |
| 47  | `c2-org-chart`        | Hierarchy as connected cards that expand and collapse                         | PrimeVue OrganizationChart; Rippling, BambooHR                                       | P3       | Proposed |
| 48  | `c2-marquee`          | Continuous scrolling strip, pauses on hover                                   | Chakra, Mantine and Ark marquee; stock ticker tapes                                  | P3       | Proposed |

### C. Charts (8)

These join `@c2n/chart`, which already ships 14 chart elements (line, area, bar, pie, scatter, bubble, radar, gauge, pyramid, candlestick, butterfly, overlap, map, sparkline). Each needs only a new series type on the existing engine.

| #   | Component             | What it adds                                                               | Real-world model                               | Priority | Decision |
| --- | --------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- | -------- | -------- |
| 49  | `c2-heatmap-chart`    | Two categorical axes and a colour scale (cohort retention, hour × weekday) | Amplitude and Mixpanel retention grids         | P2       | Proposed |
| 50  | `c2-calendar-heatmap` | One cell per day across a year                                             | GitHub contribution graph                      | P2       | Proposed |
| 51  | `c2-treemap-chart`    | Nested rectangles sized by value                                           | Finviz market map, disk-usage tools            | P2       | Proposed |
| 52  | `c2-waterfall-chart`  | Running total bridged by positive and negative steps                       | P&L and cash-flow bridges in finance reporting | P2       | Proposed |
| 53  | `c2-sankey-chart`     | Flows between stages                                                       | Money-flow and user-journey reports            | P3       | Proposed |
| 54  | `c2-boxplot-chart`    | Distribution summary (median, quartiles, outliers)                         | Datadog and Grafana latency views              | P3       | Proposed |
| 55  | `c2-bullet-chart`     | One measure against a target and qualitative bands                         | KPI scorecards                                 | P3       | Proposed |
| 56  | `c2-depth-chart`      | Cumulative bid and ask volume around the mid price                         | Binance, Coinbase Advanced                     | P3       | Proposed |

### D. Navigation and layout (14)

| #   | Component              | What it adds                                                                                              | Real-world model                                                   | Priority | Decision |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------- | -------- |
| 57  | `c2-app-shell`         | Header, sidebar, main and aside regions with responsive collapse (composes `c2-header` and `c2-side-nav`) | Mantine AppShell, Vaadin AppLayout, Carbon UI shell, Polaris Frame | P1       | Proposed |
| 58  | `c2-page-header`       | Title, breadcrumbs, metadata, primary actions and tabs                                                    | Carbon page header, Polaris Page                                   | P1       | Proposed |
| 59  | `c2-toolbar`           | Roving-focus container for button groups, selects and separators                                          | PrimeVue Toolbar, WAI-ARIA toolbar pattern                         | P1       | Proposed |
| 60  | `c2-action-bar`        | Floating bar for the current selection ("3 selected: Archive, Delete")                                    | Chakra and Spectrum action bar, Polaris BulkActions; Gmail         | P1       | Proposed |
| 61  | `c2-menubar`           | Desktop-style File / Edit / View menus with keyboard navigation                                           | Mantine Menubar, PrimeVue Menubar; Figma, VS Code for the Web      | P2       | Proposed |
| 62  | `c2-overflow-list`     | Shows the items that fit and moves the rest into a "More" menu                                            | Mantine OverflowList, Carbon overflow menu                         | P2       | Proposed |
| 63  | `c2-table-of-contents` | Heading links with scroll-spy                                                                             | antd Anchor, Mantine TableOfContents, Ark TOC                      | P2       | Proposed |
| 64  | `c2-scroll-area`       | Themed scrollbars and edge shadows                                                                        | Mantine, Chakra and PrimeVue ScrollArea                            | P2       | Proposed |
| 65  | `c2-skip-link`         | "Skip to content" link for keyboard users                                                                 | Carbon skip-to-content, Chakra SkipNav                             | P1       | Proposed |
| 66  | `c2-bottom-nav`        | Mobile tab bar with icons and badges                                                                      | Material navigation bar, iOS tab bar                               | P2       | Proposed |
| 67  | `c2-float-button`      | Floating action button that expands into a speed dial                                                     | antd FloatButton, Material FAB, PrimeVue SpeedDial                 | P2       | Proposed |
| 68  | `c2-sticky`            | Pins content once it scrolls to an offset and reports its stuck state                                     | antd Affix, Polaris Sticky                                         | P3       | Proposed |
| 69  | `c2-master-detail`     | List and detail side by side, stacked with a back step on mobile                                          | Vaadin MasterDetailLayout; Gmail, Outlook                          | P2       | Proposed |
| 70  | `c2-swipe-actions`     | Swipe a list row to reveal actions                                                                        | iOS Mail, Gmail mobile                                             | P3       | Proposed |

### E. Overlays and feedback (9)

These build on `c2-overlay` (anchored popup), `c2-modal` and `c2-sheet`, which already exist.

| #   | Component                | What it adds                                                               | Real-world model                                                      | Priority | Decision |
| --- | ------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- | -------- |
| 71  | `c2-confirm-dialog`      | Promise-based confirm (`await confirm({...})`) with a destructive variant  | Vaadin ConfirmDialog, PrimeVue ConfirmDialog                          | P1       | Proposed |
| 72  | `c2-popconfirm`          | Small "Are you sure?" popup anchored to the button that triggered it       | antd Popconfirm, PrimeVue ConfirmPopup                                | P1       | Proposed |
| 73  | `c2-toggletip`           | Click-to-open help bubble that can hold links (a tooltip cannot)           | Carbon toggletip, Spectrum contextual help                            | P2       | Proposed |
| 74  | `c2-tour`                | Step-by-step onboarding with spotlight, anchored steps and progress        | antd Tour, Ark tour, Carbon and Spectrum coachmark; Intercom, Appcues | P2       | Proposed |
| 75  | `c2-notification-center` | Inbox panel with read and unread states, grouping and "mark all read"      | Carbon notification panel; Linear inbox, GitHub notifications         | P2       | Proposed |
| 76  | `c2-loading-overlay`     | Blocks a region and shows progress while it loads                          | Mantine LoadingOverlay, PrimeVue BlockUI                              | P2       | Proposed |
| 77  | `c2-bottom-sheet`        | Mobile sheet with drag handle and snap points                              | Spectrum tray, Vaul (shadcn drawer); Apple Maps                       | P2       | Proposed |
| 78  | `c2-save-bar`            | "Unsaved changes: Discard / Save" bar that appears when a form is dirty    | Polaris ContextualSaveBar; Shopify admin, Linear settings             | P2       | Proposed |
| 79  | `c2-watermark`           | Tiled text or logo over content (confidential screens, screenshot tracing) | antd Watermark                                                        | P3       | Proposed |

### F. Collaboration (6)

| #   | Component           | What it adds                                                  | Real-world model                                                              | Priority | Decision |
| --- | ------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | -------- |
| 80  | `c2-comment-thread` | Threaded comments with resolve, reply, edit and mentions      | Figma, Google Docs, GitHub review threads                                     | P2       | Proposed |
| 81  | `c2-reaction-bar`   | Emoji reactions with counts, "you reacted" state and a picker | Slack, GitHub                                                                 | P2       | Proposed |
| 82  | `c2-people-picker`  | Search people, show avatar chips, assign a role per person    | Fluent / Microsoft Graph people picker; Google Drive and Notion share dialogs | P2       | Proposed |
| 83  | `c2-live-cursors`   | Other users' named cursors and selections over a canvas       | Figma, Miro, Google Docs                                                      | P3       | Proposed |
| 84  | `c2-poll`           | Vote and see live results                                     | Slack and Microsoft Teams polls                                               | P3       | Proposed |
| 85  | `c2-audio-recorder` | Record, preview and send a voice clip                         | Slack clips, WhatsApp                                                         | P3       | Proposed |

### G. Business apps (8)

| #   | Component             | What it adds                                                                                             | Real-world model                                | Priority | Decision |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------- | -------- |
| 86  | `c2-filter-builder`   | Filter chips ("Status is Active"), an add-filter menu, AND/OR groups, saved views; pairs with `c2-table` | Polaris IndexFilters; Linear, Jira, Airtable    | P1       | Proposed |
| 87  | `c2-scheduler`        | Resources × time with drag-to-create and drag-to-move events                                             | Google Calendar, FullCalendar resource timeline | P2       | Proposed |
| 88  | `c2-time-slot-picker` | Pick an available slot from someone's calendar                                                           | Calendly, Cal.com                               | P2       | Proposed |
| 89  | `c2-file-browser`     | Folder tree, grid and list views, breadcrumbs, multi-select                                              | Google Drive, Dropbox                           | P2       | Proposed |
| 90  | `c2-order-book`       | Live bids and asks with depth bars and grouping                                                          | Binance, Coinbase Advanced                      | P2       | Proposed |
| 91  | `c2-spreadsheet`      | Editable cell grid with formulas, fill handle and copy/paste ranges                                      | Airtable, Google Sheets                         | P3       | Proposed |
| 92  | `c2-mind-map`         | Auto-laid-out idea tree with keyboard editing                                                            | XMind, Miro mind map                            | P3       | Proposed |
| 93  | `c2-terminal`         | Interactive prompt with history and command handlers (`c2-log-viewer` stays read-only)                   | PrimeVue Terminal; Replit, Vercel               | P3       | Proposed |

### H. AI interfaces (4)

These extend the existing chat set (`c2-chat-input`, `c2-chat-message`, `c2-chat-message-list`, `c2-chatbot`) and the open working-indicator PR.

| #   | Component           | What it adds                                                         | Real-world model                                        | Priority | Decision |
| --- | ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- | -------- | -------- |
| 94  | `c2-tool-call`      | Collapsible card for an agent step: tool name, input, status, output | Claude and ChatGPT agent steps, Vercel AI Elements Tool | P2       | Proposed |
| 95  | `c2-citation`       | Numbered inline source marker with a hover preview of the source     | Perplexity, ChatGPT search                              | P2       | Proposed |
| 96  | `c2-streaming-text` | Smooth reveal of tokens as they arrive, with a cursor                | ChatGPT, Claude                                         | P2       | Proposed |
| 97  | `c2-web-preview`    | Sandboxed iframe with URL bar, reload and device sizes               | v0, Bolt                                                | P3       | Proposed |

### I. Utilities (3)

| #   | Component            | What it adds                                                           | Real-world model                  | Priority | Decision |
| --- | -------------------- | ---------------------------------------------------------------------- | --------------------------------- | -------- | -------- |
| 98  | `c2-visually-hidden` | Text for screen readers only                                           | Chakra and Mantine VisuallyHidden | P1       | Proposed |
| 99  | `c2-focus-trap`      | Keeps focus inside a region (custom panels, inline editors)            | Ark, Chakra and Mantine FocusTrap | P2       | Proposed |
| 100 | `c2-in-view`         | Fires when content enters the viewport (lazy reveal, infinite loading) | Web Awesome intersection-observer | P3       | Proposed |

## 68 more from real apps

Researching 90 products found 68 more primitives that no design system above ships as a component, numbered 101 to 168: 4 P1, 42 P2 and 22 P3. The products were Linear, Slack, Stripe, Datadog, ChatGPT, Spotify, Zendesk and others. Each row was seen in at least two products. The source is the help, changelog or teardown page the pattern was checked against on 2026-10-04.

### J. Developer and data tools (13)

| #   | Component              | What it does                                                                   | Seen in                                                                       | Source                                                                                                                | Priority | Decision |
| --- | ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| 101 | `c2-time-range-picker` | Relative presets ("Last 15 min"), absolute range, time zone, live/auto-refresh | Grafana, Datadog, Sentry, PostHog, CloudWatch                                 | [Grafana](https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/)                          | P1       | Proposed |
| 102 | `c2-distribution-bar`  | One 100% stacked bar of a breakdown, with legend and hover shares              | Sentry tags, GitHub language bar, Monday.com battery, Linear project progress | [Sentry](https://docs.sentry.io/product/issues/issue-details/)                                                        | P1       | Proposed |
| 103 | `c2-query-input`       | One-line `key:value` search with token highlighting and value autocomplete     | Datadog, GitHub, Sentry, Grafana Loki                                         | [Datadog](https://docs.datadoghq.com/logs/explorer/search/)                                                           | P2       | Proposed |
| 104 | `c2-facet-list`        | Sidebar of attribute values with counts and include/exclude toggles            | Datadog, Sentry, Metabase, Kibana                                             | [Datadog](https://docs.datadoghq.com/logs/explorer/facets/)                                                           | P2       | Proposed |
| 105 | `c2-key-value-editor`  | Editable KEY=value rows; pasting a `.env` splits it into rows; masked values   | Vercel, Netlify, Supabase, Postman                                            | [Vercel](https://vercel.com/changelog/bulk-upload-now-available-for-environment-variables)                            | P2       | Proposed |
| 106 | `c2-uptime-bar`        | One tick per day coloured by status, uptime % and hover detail                 | Atlassian Statuspage, GitHub and Vercel status pages                          | [Statuspage](https://support.atlassian.com/statuspage/docs/display-historical-uptime-of-components/)                  | P2       | Proposed |
| 107 | `c2-check-list`        | CI checks grouped by result, failing first, with duration and re-run           | GitHub merge box, GitLab, Vercel                                              | [GitHub](https://github.blog/changelog/2025-03-04-improved-pull-request-merge-experience-is-now-generally-available/) | P2       | Proposed |
| 108 | `c2-trace-waterfall`   | Span tree with offset duration bars on one time axis                           | Sentry, Datadog APM, Grafana Tempo                                            | [Sentry](https://docs.sentry.io/concepts/key-terms/tracing/trace-view/)                                               | P2       | Proposed |
| 109 | `c2-flame-graph`       | Stacked frames sized by share; zoom and search                                 | Datadog, Pyroscope, Sentry profiling                                          | [Datadog](https://docs.datadoghq.com/dashboards/widgets/profiling_flame_graph/)                                       | P3       | Proposed |
| 110 | `c2-state-timeline`    | One band per series, coloured by discrete state over time                      | Grafana, Datadog, CI histories                                                | [AWS Grafana](https://docs.aws.amazon.com/grafana/latest/userguide/state-timeline-panel.html)                         | P3       | Proposed |
| 111 | `c2-split-allocator`   | Splits 100% across variants, handles constrained to the total                  | PostHog, LaunchDarkly, Statsig                                                | [PostHog](https://posthog.com/docs/experiments/creating-an-experiment)                                                | P3       | Proposed |
| 112 | `c2-commit-graph`      | Commit rows with branch and merge lanes and ref labels                         | GitLab, GitKraken, Bitbucket                                                  | [GitLab](https://docs.gitlab.com/user/project/repository/)                                                            | P3       | Proposed |
| 113 | `c2-schema-diagram`    | Table cards with typed columns, keys and relation edges                        | Supabase, Snowflake, ChartDB                                                  | [Basedash](https://www.basedash.com/tools/supabase-schema-visualizer)                                                 | P3       | Proposed |

### K. Work management (7)

| #   | Component           | What it does                                                                 | Seen in                           | Source                                                                                      | Priority | Decision |
| --- | ------------------- | ---------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- | -------- | -------- |
| 114 | `c2-view-options`   | Layout, group-by, order-by and visible-properties controls for a collection  | Linear, Notion, Airtable, ClickUp | [Linear](https://linear.app/docs/display-options)                                           | P1       | Proposed |
| 115 | `c2-quick-add`      | One line that parses "Fri 2pm #work p1" and highlights the recognised tokens | Todoist, Asana, Linear, Things    | [Todoist](https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz)     | P2       | Proposed |
| 116 | `c2-status-icon`    | Workflow-state glyph: backlog, todo, partial progress, done, cancelled       | Linear, Height, Jira              | [Linear](https://linear.app/docs/configuring-workflows)                                     | P2       | Proposed |
| 117 | `c2-priority-icon`  | Bar or flag glyph for none to urgent, with an accessible label               | Linear, Jira, Todoist             | [Linear](https://linear.app/changelog/2024-07-25-priority-for-projects-and-micro-adjust)    | P2       | Proposed |
| 118 | `c2-due-date`       | Date pill that turns due-soon, overdue or done, with a relative label        | Trello, Todoist, Monday.com       | [Trello](https://support.atlassian.com/trello/docs/adding-dates-to-cards/)                  | P2       | Proposed |
| 119 | `c2-time-tracker`   | Start/stop pill with live elapsed time and logged total                      | ClickUp, Jira, Height             | [ClickUp](https://help.clickup.com/hc/en-us/articles/6304106812823-Track-time-on-tasks)     | P2       | Proposed |
| 120 | `c2-date-range-bar` | Compact start–end cell filled to the elapsed share                           | Monday.com, ClickUp               | [Monday.com](https://support.monday.com/hc/en-us/articles/115005333969-The-Timeline-Column) | P3       | Proposed |

### L. Communication and media (19)

| #   | Component               | What it does                                                             | Seen in                                                              | Source                                                                                                                                                    | Priority | Decision |
| --- | ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| 121 | `c2-split-button`       | Main action plus a caret menu of variants ("Send ▾", mic + device menu)  | Gmail, Teams, Zoom, Meet                                             | [Teams](https://support.microsoft.com/en-us/teams/meetings/use-meeting-controls-in-microsoft-teams)                                                       | P1       | Proposed |
| 122 | `c2-quick-time-menu`    | "Later today / Tomorrow / Next week" presets plus a custom date and time | Gmail snooze and schedule send, Outlook, Superhuman, Slack reminders | [Mailmeteor](https://mailmeteor.com/blog/snooze-in-gmail)                                                                                                 | P2       | Proposed |
| 123 | `c2-status-picker`      | Emoji, status text, presence and a "clear after" duration                | Slack, Teams, Discord                                                | [Slack](https://slack.com/help/articles/201864558-Set-your-Slack-status-and-availability)                                                                 | P2       | Proposed |
| 124 | `c2-jump-pill`          | Floating "New messages ↓" pill over a scroll container                   | Slack, Discord, Teams                                                | [Slack](https://slack.com/help/articles/226410907-View-all-your-unread-messages)                                                                          | P2       | Proposed |
| 125 | `c2-thread-summary`     | "4 replies · last reply 2h ago" row with reply avatars                   | Slack, Teams, Discord                                                | [Slack Design](https://slack.design/articles/threads-in-slack-a-long-design-journey-part-2-of-2/)                                                         | P2       | Proposed |
| 126 | `c2-message-status`     | Sending, sent, delivered and seen ticks, with "seen by" avatars          | Teams, WhatsApp, Messenger                                           | [Teams](https://support.microsoft.com/en-us/office/use-read-receipts-for-messages-in-microsoft-teams-533f2334-32ef-424b-8d56-ed30e019f856)                | P2       | Proposed |
| 127 | `c2-video-tile`         | Video or avatar, name, mute badge, speaking outline, pin menu            | Meet, Zoom, Teams, Discord                                           | [Google Meet](https://support.google.com/a/users/answer/9850339?hl=en)                                                                                    | P2       | Proposed |
| 128 | `c2-video-grid`         | Tiled, spotlight or sidebar layout that fits N tiles                     | Meet, Zoom, Teams                                                    | [Google Workspace](https://workspaceupdates.googleblog.com/2025/03/dynamic-layouts-for-google-meet.html)                                                  | P2       | Proposed |
| 129 | `c2-audio-visualizer`   | Live level bars or waveform from a mic or audio stream                   | Discord, Meet, ChatGPT voice, ElevenLabs                             | [ElevenLabs UI](https://github.com/elevenlabs/ui)                                                                                                         | P2       | Proposed |
| 130 | `c2-zoom-control`       | Zoom % button with −/+ and fit / 50 / 100 / 200% presets                 | Figma, Miro, Canva, Google Docs                                      | [Figma](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam)                                                                    | P2       | Proposed |
| 131 | `c2-chapter-scrubber`   | Seek bar split into chapters with a hover thumbnail preview              | YouTube, Spotify podcasts, Netflix                                   | [gHacks](https://www.ghacks.net/2020/04/14/youtube-is-rolling-out-chapters-support/)                                                                      | P2       | Proposed |
| 132 | `c2-media-card`         | Poster tile with resume progress, duration and hover actions             | Netflix, YouTube, Spotify                                            | [Tom's Guide](https://www.tomsguide.com/how-to/netflix-is-finally-letting-you-clean-up-your-continue-watching-row-heres-how-you-do-it)                    | P2       | Proposed |
| 133 | `c2-recording-controls` | Floating bar: red dot, timer, pause, restart, stop                       | Loom, Zoom, Teams                                                    | [Loom](https://support.atlassian.com/loom/docs/pause-and-resume-while-recording)                                                                          | P3       | Proposed |
| 134 | `c2-floating-reactions` | Emoji that rise and fade over a surface                                  | Zoom, Teams, Meet                                                    | [Teams](https://support.microsoft.com/en-us/office/express-yourself-in-microsoft-teams-meetings-with-live-reactions-a8323a40-3d07-4129-934b-305370a36e21) | P3       | Proposed |
| 135 | `c2-ruler`              | Ruler with draggable indent markers and tab stops                        | Google Docs, Canva, Figma                                            | [How-To Geek](https://www.howtogeek.com/781668/how-to-add-edit-and-remove-tab-stops-in-google-docs/)                                                      | P3       | Proposed |
| 136 | `c2-sticky-note`        | Coloured S/M/L note with editable text and author                        | Miro, FigJam, Jamboard                                               | [Miro](https://help.miro.com/hc/en-us/articles/360017572054-Sticky-notes)                                                                                 | P3       | Proposed |
| 137 | `c2-playing-indicator`  | Animated equalizer marking the active row, static when paused            | Spotify, YouTube Music, Apple Music                                  | [Spotify Community](https://community.spotify.com/t5/Content-Questions/Super-distracting-moving-animated-playlist-icon/td-p/5219800)                      | P3       | Proposed |
| 138 | `c2-story-progress`     | Segmented auto-advancing bars; tap to step, hold to pause                | Instagram, Snapchat, WhatsApp                                        | [DEV](https://dev.to/dev48v/i-rebuilt-instagram-stories-segmented-progress-bars-4bil)                                                                     | P3       | Proposed |
| 139 | `c2-follow-button`      | Follow/Subscribed toggle with count and a notification-level menu        | YouTube, LinkedIn, Strava, Instagram                                 | [YouTube](https://support.google.com/youtube/answer/9336507?hl=en)                                                                                        | P3       | Proposed |

### M. Commerce, fintech and CRM (18)

| #   | Component               | What it does                                                                      | Seen in                                   | Source                                                                                                                         | Priority | Decision |
| --- | ----------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | -------- |
| 140 | `c2-rating-summary`     | Average score, stars, count and per-star bars that filter reviews                 | Amazon, Airbnb, Google Maps, Play Store   | [Google Maps Platform](https://developers.google.com/maps/documentation/javascript/place-reviews)                              | P2       | Proposed |
| 141 | `c2-histogram-slider`   | Range slider over a price histogram; bars inside the range highlighted            | Airbnb, Booking.com                       | [example PR](https://github.com/dnbl0/CCS-Static-latest/pull/4)                                                                | P2       | Proposed |
| 142 | `c2-quantity-picker`    | Popover of labelled min/max counters with a summary trigger ("2 adults, 1 child") | Airbnb, Booking.com                       | [Mobbin](https://mobbin.com/explore/screens/1cb2a0d3-4c01-4dd4-a26c-5499c86b1ac5)                                              | P2       | Proposed |
| 143 | `c2-fx-converter`       | Two linked amount + currency fields, swap, live rate and rate-lock countdown      | Wise, Revolut                             | [Wise](https://docs.wise.com/guides/product/send-money/quotes/authenticated-quote)                                             | P2       | Proposed |
| 144 | `c2-payment-card`       | Card visual with masked number, reveal toggle and click-to-copy fields            | Brex, Mercury, Revolut, Ramp              | [Brex](https://www.brex.com/support/manage-your-card)                                                                          | P2       | Proposed |
| 145 | `c2-payment-brand`      | Visa, Mastercard, Apple Pay… logo badge, optionally with "•••• 4242"              | Stripe, Shopify, PayPal                   | [Stripe](https://stripe.com/en-fi/resources/more/credit-card-checkout-ui-design)                                               | P2       | Proposed |
| 146 | `c2-promo-code-field`   | Apply a code with loading and error states; applied codes become removable tokens | Shopify checkout, Uber Eats, Amazon       | [Shopify Community](https://community.shopify.com/t/does-shopify-support-separate-gift-card-and-discount-code-fields/55242)    | P2       | Proposed |
| 147 | `c2-opinion-scale`      | Numbered 0–10 or 1–5 scale with end labels and NPS bands                          | Typeform, Intercom, Zendesk               | [Typeform](https://www.typeform.com/help/a/opinion-scale-question-360052363932/)                                               | P2       | Proposed |
| 148 | `c2-sentiment-rating`   | Five labelled face buttons for satisfaction (CSAT)                                | Intercom, Zendesk, Duolingo               | [Intercom](https://www.intercom.com/help/en/articles/7872853-measure-customer-satisfaction-with-conversation-ratings)          | P2       | Proposed |
| 149 | `c2-sla-timer`          | Countdown pill that turns amber then red; shows overdue time                      | Zendesk, Intercom, Salesforce Service     | [Zendesk](https://support.zendesk.com/hc/en-us/articles/4408832852122-Viewing-and-understanding-SLA-targets)                   | P2       | Proposed |
| 150 | `c2-approval-chain`     | Ordered approvers with status and time, sequential or parallel, delegation        | Rippling, Workday, Salesforce, Ramp       | [Rippling](https://www.rippling.com/permissions)                                                                               | P2       | Proposed |
| 151 | `c2-weekly-hours`       | Time ranges per weekday with add, remove and copy-to-days                         | Calendly, Rippling, Google Business hours | [Calendly](https://calendly.com/help/how-to-set-your-availability)                                                             | P2       | Proposed |
| 152 | `c2-split-editor`       | Splits a total among people by equal, amount, percent or shares                   | Monzo, PayPal, Revolut                    | [Monzo](https://monzo.com/help/monzo-with-friends/split-bill)                                                                  | P3       | Proposed |
| 153 | `c2-amount-keypad`      | On-screen number pad driving a large amount display                               | Revolut, Cash App, Monzo, Robinhood       | [Revolut](https://help.revolut.com/en-US/help/wealth/exchanging-money/how-to-make-currency-exchanges/how-do-i-exchange-money/) | P3       | Proposed |
| 154 | `c2-unit-amount-toggle` | Amount in one unit (dollars, shares, fiat, crypto) with the live equivalent       | Robinhood, Coinbase                       | [Robinhood](https://robinhood.com/us/en/support/articles/fractional-shares/)                                                   | P3       | Proposed |
| 155 | `c2-macro-picker`       | "/"-triggered canned responses, most-used first, with preview                     | Zendesk, Intercom, HubSpot                | [Zendesk](https://support.zendesk.com/hc/en-us/articles/4408887656602-Using-macros-to-update-tickets)                          | P3       | Proposed |
| 156 | `c2-streak`             | Day count with a week strip of completed days                                     | Duolingo, Strava, LinkedIn Learning       | [Medium teardown](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)          | P3       | Proposed |
| 157 | `c2-achievement-badge`  | Badge art with tier and progress to the next tier                                 | Duolingo, Strava, Salesforce Trailhead    | [Duolingo wiki](https://duolingo.fandom.com/wiki/Achievements)                                                                 | P3       | Proposed |

### N. AI interfaces (11)

| #   | Component              | What it does                                                              | Seen in                                   | Source                                                                                                                                        | Priority | Decision |
| --- | ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| 158 | `c2-suggestion-chips`  | Prompt starters and follow-up questions that emit the chosen prompt       | Perplexity, Copilot, ChatGPT, Gemini      | [AI UX Playground](https://aiuxplayground.com/teardowns/perplexity/output/)                                                                   | P2       | Proposed |
| 159 | `c2-permission-prompt` | Inline tool approval: summary plus Allow once / Always allow / Deny       | Claude Code, Cursor, GitHub Copilot agent | [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/user-input)                                                                      | P2       | Proposed |
| 160 | `c2-branch-pager`      | "‹ 2/3 ›" stepper through regenerated answers or versions                 | ChatGPT, Claude.ai, HuggingChat           | [AI Workspace](https://www.getaiworkspace.com/chatgpt-conversation-branching)                                                                 | P2       | Proposed |
| 161 | `c2-response-feedback` | Thumbs up/down, then reason chips and an optional comment                 | ChatGPT, Claude.ai, Copilot, GitLab Duo   | [TheFrontKit](https://thefrontkit.com/blogs/ai-chat-ui-best-practices)                                                                        | P2       | Proposed |
| 162 | `c2-ghost-text`        | Inline grey completion; Tab accepts, Esc dismisses                        | Cursor, GitHub Copilot, Notion AI         | [Apidog](https://apidog.com/blog/cursor-tab/)                                                                                                 | P2       | Proposed |
| 163 | `c2-change-review`     | Accept/reject bar for edit hunks, "hunk 2 of 5" navigation                | Cursor, Copilot Edits                     | [The Neural Base](https://theneuralbase.com/cursor/learn/beginner/reviewing-and-accepting-changes/)                                           | P2       | Proposed |
| 164 | `c2-selection-toolbar` | Floating toolbar on selected text (Ask AI, rewrite, format)               | ChatGPT Canvas, Notion AI                 | [All Things How](https://allthings.how/chatgpt-canvas-vs-claude-artifacts-how-do-they-differ/)                                                | P2       | Proposed |
| 165 | `c2-transcript`        | Speaker-labelled, timestamped segments; click to seek; active word synced | Otter.ai, Granola, ElevenLabs             | [MSU Denver](https://www.msudenver.edu/teaching-learning-design/instructional-accessibility/guides-resources/multimedia/otterai-transcripts/) | P2       | Proposed |
| 166 | `c2-voice-orb`         | Orb animating idle, listening and speaking from audio level               | ChatGPT voice, ElevenLabs, Gemini Live    | [TechCrunch](https://techcrunch.com/2024/09/24/openai-rolls-out-advanced-voice-mode-with-more-voices-and-a-new-look/)                         | P3       | Proposed |
| 167 | `c2-generation-grid`   | 2×2 variants that blur in, with per-tile vary/upscale/select              | Midjourney, ChatGPT images                | [Android Authority](https://www.androidauthority.com/midjourney-u1-v1-buttons-meaning-3327309/)                                               | P3       | Proposed |
| 168 | `c2-version-history`   | Snapshot list with bookmarks, preview and "Restore this version"          | Lovable, Bolt, v0                         | [Lovable](https://docs.lovable.dev/features/projects/history)                                                                                 | P3       | Proposed |

## Delivery plan

The 166 still to build (168 less `c2-inline-edit` and `c2-chip`) ship in four waves sorted by priority, in PRs of 3 to 5 components. Wave 1 comes first because later items reuse it: `c2-form-field` wraps every input in waves 2 and 4, and `c2-confirm-dialog` backs destructive actions everywhere. `c2-filter-builder` builds on the shipped `c2-chip`.

| Wave | Scope                | Components | Gate before the next wave                       |
| ---- | -------------------- | ---------- | ----------------------------------------------- |
| 1    | Foundations (P1)     | 23         | `c2-form-field` wraps every existing input      |
| 2    | Business apps (P2)   | 50         | Blocks collection opens (forms, settings pages) |
| 3    | Data, media, AI (P2) | 43         | P3 list re-ranked from `COMPONENT-FEEDBACK.md`  |
| 4    | Specialized (P3)     | 50         | —                                               |

Each gate has to pass before the next wave starts. No calendar dates are set yet.

**Definition of done for every component**, from the repo's own conventions:

- [ ] Scaffolded with `npm run generate` and added to the root wireit build and `@c2n/theme`
- [ ] Presentation exposed only through documented `--c2-*` variables, with defaults that map onto `@c2n/theme` tokens
- [ ] Host semantics set through `ElementInternals`, no host attributes written; events typed in an `EventMap`
- [ ] Playwright suite passing in Chromium, Firefox and WebKit
- [ ] Docs page, at least 6 gallery cards, a landing preview and studio presets
- [ ] Manifest, MCP registry, React/Vue/Angular types and the `@c2n/components` umbrella regenerated
- [ ] Used in at least one place in `apps/ui` or an example app (dogfooding rule)

## Left off on purpose

These show up in other design systems but are not on the list:

| Pattern | Why not |
| --- | --- | --- |
| Popover, segmented control, empty state, drawer | Already in c2n: `c2-overlay`, `c2-button-group selection="single"`, `c2-status-panel`, `c2-sheet` |
| Funnel chart | `c2-pyramid-chart` draws the same shape |
| Kanban, Gantt, maps, working indicator | Open PRs #151, #141, #129, #182 |
| Layout helpers (Stack, Grid, Flex, Center, Space) | Plain CSS does this better than a custom element |
| Login form, pricing table, checkout, settings page | Blocks made from primitives, not primitives. They belong in the planned blocks collection. |
| Portal, config provider, theme provider | Framework concepts with no web-component equivalent; `@c2n/theme` tokens already cover theming |
| Floating window, pull-to-refresh, sunburst, back-to-top | Cut to keep the first list at 100; candidates for a later roadmap |

From the app research, six patterns were also cut because only one product ships them, or because an existing component covers them with a preset: Basecamp's hill chart, Google Maps' busyness chart, Coinbase's ruler picker, ChatGPT's response compare, Gemini's claim check, and the burndown chart (a `c2-line-chart` preset).
