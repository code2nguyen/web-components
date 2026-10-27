# Component roadmap

Candidate primitives for c2n, researched on 2026-10-04: 100 patterns that production design systems ship and c2n lacks, and 68 more seen in real products. Nothing here is decided. Each row starts as **Proposed**; set the Decision cell to **Accept**, **Reject** or **Later** as you validate it, and add a short reason when you reject one.

An accepted item is built with `npm run generate` (see the `new-component` skill) and its row is deleted once it ships; the changelog records what shipped. Components with an open PR are not listed. Keep running totals out of this file: a count of what remains is a line every component PR edits, so two open PRs conflict on it.

## Summary

The roadmap adds 168 new primitives to c2n, taking it from 127 `c2-*` elements to about 295. The first 100 come from design systems; the next 68 from about 90 real products. Every item passed three checks:

- **Not already in c2n.** Checked against all 127 element tags on `develop` (v0.0.24, 2026-10-03). Where an existing component covers part of a need, the item says what it adds.
- **Not already in flight.** Components with an open PR on 2026-10-04 are excluded (next section).
- **Proven in real products.** Each item names a design system or product that ships the same pattern, so the API can follow a known-good model.

Items are grouped by domain. Priority **P1** means other items depend on it or it appears in almost every app, **P2** means common in business apps, and **P3** means specialized.

## Already in flight (excluded)

When the roadmap was researched on 2026-10-04, four open PRs were adding components, so they were left off: `c2-working-indicator` ([#182](https://github.com/code2nguyen/web-components/pull/182)), `c2-kanban` ([#151](https://github.com/code2nguyen/web-components/pull/151)), `@c2n/gantt` ([#141](https://github.com/code2nguyen/web-components/pull/141)) and `@c2n/google-map` ([#129](https://github.com/code2nguyen/web-components/pull/129)). All four have since shipped. Because of `@c2n/google-map`, map primitives (markers, routes, geo pickers) are left off too.

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

100 components in 9 domains, 21 P1, 51 P2 and 28 P3 when researched. Shipped rows are removed, so the tables hold only what is still to build. Numbering is for reference only. Build order is in the delivery plan below.

### A. Forms and input

| #   | Component           | What it adds                                                               | Real-world model                                                                | Priority | Decision                                                                                                                                                                            |
| --- | ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | `c2-choice-card`    | Card-sized radio or checkbox for plan, shipping or payment choices         | Chakra radio/checkbox card, Carbon options tile; Stripe and Vercel plan pickers | P2       | Reject: covered by `c2-radio` card styling (container border, checked states, description slot) in `c2-radio-group`                                                                 |
| 14  | `c2-transfer-list`  | Move items between two lists (roles, permissions)                          | antd Transfer, PrimeVue PickList                                                | P3       | Proposed                                                                                                                                                                            |
| 15  | `c2-mention-input`  | `@user` and `#tag` suggestions inside text                                 | antd Mentions; Slack, GitHub                                                    | P2       | Reject: extend instead: give `c2-textarea` and `c2-text-field` the `triggers` API `c2-rich-text-editor` already has (`"@ #"` + a `trigger` event), with an optional suggestion list |
| 19  | `c2-signature-pad`  | Draw a signature, export SVG or PNG                                        | Ark signature pad; DocuSign                                                     | P3       | Proposed                                                                                                                                                                            |
| 20  | `c2-angle-slider`   | Circular knob for angles and dials; an arc mode for thermostats and volume | Ark/Mantine angle slider, PrimeVue Knob                                         | P3       | Proposed                                                                                                                                                                            |
| 22  | `c2-cron-input`     | Build a recurring schedule, output a cron expression                       | Vercel cron jobs, GitHub Actions schedules                                      | P3       | Proposed                                                                                                                                                                            |
| 23  | `c2-duration-input` | Accepts "1h 30m" and "90m", stores seconds                                 | Jira time tracking, Toggl                                                       | P3       | Proposed                                                                                                                                                                            |
| 25  | `c2-card-input`     | Card number, expiry and CVC with brand detection and Luhn check            | Stripe Elements card field                                                      | P2       | Proposed                                                                                                                                                                            |

### B. Data display

| #   | Component           | What it adds                                                                                     | Real-world model                                    | Priority | Decision                                                                                                                           |
| --- | ------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 37  | `c2-rolling-number` | Digits that roll when a value changes                                                            | Mantine RollingNumber; Robinhood tickers            | P3       | Reject: extend `c2-format-number` with an animated (rolling-digit) mode instead; `c2-stat` then uses it                            |
| 42  | `c2-image-viewer`   | Fullscreen lightbox with zoom, pan, rotate and a thumbnail strip                                 | PrimeVue Galleria, antd Image preview group         | P2       | Reject: extend `c2-image`, whose `preview` already opens full screen: add zoom, pan, rotate and prev/next across a group of images |
| 43  | `c2-image-compare`  | Before/after slider                                                                              | Web Awesome comparison, PrimeVue ImageCompare       | P3       | Proposed                                                                                                                           |
| 44  | `c2-video-player`   | Themed controls, captions, chapters with a thumbnail seek bar (absorbs #131)                     | Loom, YouTube                                       | P3       | Proposed                                                                                                                           |
| 45  | `c2-audio-player`   | Waveform playback for voice notes and recordings: scrub, speed, transcript toggle (absorbs #211) | Slack clips, WhatsApp voice notes                   | P3       | Proposed                                                                                                                           |
| 46  | `c2-pdf-viewer`     | Paged PDF preview with zoom and search                                                           | DocuSign, Gmail attachment preview                  | P3       | Proposed                                                                                                                           |
| 48  | `c2-marquee`        | Continuous scrolling strip, pauses on hover                                                      | Chakra, Mantine and Ark marquee; stock ticker tapes | P3       | Proposed                                                                                                                           |

### C. Charts

These join `@c2n/chart`, which already ships 15 chart elements (line, area, bar, pie, scatter, bubble, radar, gauge, pyramid, candlestick, butterfly, overlap, map, heatmap, sparkline). Each needs only a new series type on the existing engine.

| #   | Component          | What it adds                                       | Real-world model                  | Priority | Decision |
| --- | ------------------ | -------------------------------------------------- | --------------------------------- | -------- | -------- |
| 54  | `c2-boxplot-chart` | Distribution summary (median, quartiles, outliers) | Datadog and Grafana latency views | P3       | Proposed |
| 55  | `c2-bullet-chart`  | One measure against a target and qualitative bands | KPI scorecards                    | P3       | Proposed |

### D. Navigation and layout

| #   | Component        | What it adds                                                     | Real-world model                           | Priority | Decision                                                                                         |
| --- | ---------------- | ---------------------------------------------------------------- | ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| 59  | `c2-toolbar`     | Roving-focus container for button groups, selects and separators | PrimeVue Toolbar, WAI-ARIA toolbar pattern | P1       | Reject: covered by `c2-button-group toolbar` (role, one Tab stop, arrow keys across any control) |
| 64  | `c2-scroll-area` | Themed scrollbars, edge shadows and edge fade                    | Mantine, Chakra and PrimeVue ScrollArea    | P2       | Proposed                                                                                         |

### E. Overlays and feedback

These build on `c2-overlay` (anchored popup), `c2-modal` and `c2-sheet`, which already exist.

| #   | Component         | What it adds                                                               | Real-world model                                | Priority | Decision                                                                                                                          |
| --- | ----------------- | -------------------------------------------------------------------------- | ----------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 77  | `c2-bottom-sheet` | Mobile sheet with drag handle and snap points                              | Spectrum tray, Vaul (shadcn drawer); Apple Maps | P2       | Reject: extend `c2-sheet` instead: it already has `side` and `swipe-close`; add snap points and a drag handle for `side="bottom"` |
| 79  | `c2-watermark`    | Tiled text or logo over content (confidential screens, screenshot tracing) | antd Watermark                                  | P3       | Proposed                                                                                                                          |

### F. Collaboration

| #   | Component           | What it adds                                                                                    | Real-world model                                                              | Priority | Decision                                                                                                               |
| --- | ------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| 80  | `c2-comment-thread` | Threaded comments with resolve, reply, edit and mentions                                        | Figma, Google Docs, GitHub review threads                                     | P2       | Proposed                                                                                                               |
| 82  | `c2-people-picker`  | Search people, show avatar chips, assign a role per person                                      | Fluent / Microsoft Graph people picker; Google Drive and Notion share dialogs | P2       | Reject: composition of `c2-autocomplete` (`renderItem` for avatars) and `c2-tag-input`; a role per person is app logic |
| 83  | `c2-live-cursors`   | Other users' named cursors and selections over a canvas                                         | Figma, Miro, Google Docs                                                      | P3       | Proposed                                                                                                               |
| 84  | `c2-poll`           | Vote and see live results                                                                       | Slack and Microsoft Teams polls                                               | P3       | Reject: composition of `c2-radio-group` and `c2-meter`; belongs in the blocks collection                               |
| 85  | `c2-audio-recorder` | Record, preview and send a voice clip, with a floating timer, pause and stop bar (absorbs #133) | Slack clips, WhatsApp                                                         | P3       | Proposed                                                                                                               |

### G. Business apps

| #   | Component             | What it adds                                                                                                                                                                                                                                                                           | Real-world model                                | Priority | Decision |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------- | -------- |
| 87  | `c2-scheduler`        | Resources × time with drag-to-create and drag-to-move events                                                                                                                                                                                                                           | Google Calendar, FullCalendar resource timeline | P2       | Proposed |
| 88  | `c2-time-slot-picker` | Pick an available slot from someone's calendar                                                                                                                                                                                                                                         | Calendly, Cal.com                               | P2       | Proposed |
| 89  | `c2-file-browser`     | Folder tree, grid and list views, breadcrumbs, multi-select                                                                                                                                                                                                                            | Google Drive, Dropbox                           | P2       | Proposed |
| 90  | `c2-order-book`       | Live bids and asks with depth bars, price grouping and spread row. Keeps the book from an exchange diff feed (size 0 deletes a level), the state `c2-depth-chart` leaves to the app since it draws snapshots; sums with the chart's `depth-model.ts` and fires the same `price-select` | Binance, Coinbase Advanced, Kraken Pro          | P2       | Proposed |
| 92  | `c2-mind-map`         | Auto-laid-out idea tree with keyboard editing                                                                                                                                                                                                                                          | XMind, Miro mind map                            | P3       | Proposed |
| 93  | `c2-terminal`         | Interactive prompt with history and command handlers (`c2-log-viewer` stays read-only)                                                                                                                                                                                                 | PrimeVue Terminal; Replit, Vercel               | P3       | Proposed |

### H. AI interfaces

These extend the existing chat set (`c2-chat-input`, `c2-chat-message`, `c2-chat-message-list`, `c2-chatbot`) and the open working-indicator PR.

| #   | Component        | What it adds                                                         | Real-world model                                        | Priority | Decision                                                                                                                                                                       |
| --- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 94  | `c2-tool-call`   | Collapsible card for an agent step: tool name, input, status, output | Claude and ChatGPT agent steps, Vercel AI Elements Tool | P2       | Reject: covered by `c2-steps`, which already draws a running task as steps with statuses and collapsible sub-steps; add a body slot to `c2-step` for a tool's input and output |
| 97  | `c2-web-preview` | Sandboxed iframe with URL bar, reload and device sizes               | v0, Bolt                                                | P3       | Proposed                                                                                                                                                                       |

### I. Utilities

| #   | Component       | What it adds                                                           | Real-world model                  | Priority | Decision                                                                                                                        |
| --- | --------------- | ---------------------------------------------------------------------- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 99  | `c2-focus-trap` | Keeps focus inside a region (custom panels, inline editors)            | Ark, Chakra and Mantine FocusTrap | P2       | Reject: not an element: `c2-modal` and `c2-sheet` trap focus through `<dialog>`; a focus-trap controller belongs in `@c2n/core` |
| 100 | `c2-in-view`    | Fires when content enters the viewport (lazy reveal, infinite loading) | Web Awesome intersection-observer | P3       | Proposed                                                                                                                        |

## 68 more from real apps

Researching 90 products found 68 more primitives that no design system above ships as a component, numbered 101 to 168: 4 P1, 42 P2 and 22 P3. The products were Linear, Slack, Stripe, Datadog, ChatGPT, Spotify, Zendesk and others. Each row was seen in at least two products. The source is the help, changelog or teardown page the pattern was checked against on 2026-10-04.

### J. Developer and data tools

| #   | Component            | What it does                                                         | Seen in                                              | Source                                                                                                                | Priority | Decision                                                                                                     |
| --- | -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| 106 | `c2-uptime-bar`      | One tick per day coloured by status, uptime % and hover detail       | Atlassian Statuspage, GitHub and Vercel status pages | [Statuspage](https://support.atlassian.com/statuspage/docs/display-historical-uptime-of-components/)                  | P2       | Reject: a preset of `c2-state-timeline` (one series, daily buckets, uptime % in the summary)                 |
| 107 | `c2-check-list`      | CI checks grouped by result, failing first, with duration and re-run | GitHub merge box, GitLab, Vercel                     | [GitHub](https://github.blog/changelog/2025-03-04-improved-pull-request-merge-experience-is-now-generally-available/) | P2       | Reject: covered by `c2-steps` (status per row, `trailing` duration, groups)                                  |
| 109 | `c2-flame-graph`     | Stacked frames sized by share; zoom and search                       | Datadog, Pyroscope, Sentry profiling                 | [Datadog](https://docs.datadoghq.com/dashboards/widgets/profiling_flame_graph/)                                       | P3       | Proposed                                                                                                     |
| 111 | `c2-split-allocator` | Splits 100% across variants, handles constrained to the total        | PostHog, LaunchDarkly, Statsig                       | [PostHog](https://posthog.com/docs/experiments/creating-an-experiment)                                                | P3       | Reject: extend `c2-slider` with more than two thumbs that share a fixed total                                |
| 112 | `c2-commit-graph`    | Commit rows with branch and merge lanes and ref labels               | GitLab, GitKraken, Bitbucket                         | [GitLab](https://docs.gitlab.com/user/project/repository/)                                                            | P3       | Proposed                                                                                                     |
| 113 | `c2-schema-diagram`  | Table cards with typed columns, keys and relation edges              | Supabase, Snowflake, ChartDB                         | [Basedash](https://www.basedash.com/tools/supabase-schema-visualizer)                                                 | P3       | Reject: extend `c2-flow` with custom node rendering and per-column ports; the layout and edges already exist |

### K. Work management

| #   | Component           | What it does                                                                 | Seen in                        | Source                                                                                      | Priority | Decision                                                                                                                  |
| --- | ------------------- | ---------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| 115 | `c2-quick-add`      | One line that parses "Fri 2pm #work p1" and highlights the recognised tokens | Todoist, Asana, Linear, Things | [Todoist](https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz)     | P2       | Reject: extend `c2-query-input` with custom token parsers (dates, `#tags`, `p1`); it already turns typed terms into chips |
| 116 | `c2-status-icon`    | Workflow-state glyph: backlog, todo, partial progress, done, cancelled       | Linear, Height, Jira           | [Linear](https://linear.app/docs/configuring-workflows)                                     | P2       | Reject: a glyph, not a component: draw it with `c2-progress variant="circular"` or add it to an icon set                  |
| 117 | `c2-priority-icon`  | Bar or flag glyph for none to urgent, with an accessible label               | Linear, Jira, Todoist          | [Linear](https://linear.app/changelog/2024-07-25-priority-for-projects-and-micro-adjust)    | P2       | Reject: an icon set entry (see `@c2n/task-icons`), not a component                                                        |
| 118 | `c2-due-date`       | Date pill that turns due-soon, overdue or done, with a relative label        | Trello, Todoist, Monday.com    | [Trello](https://support.atlassian.com/trello/docs/adding-dates-to-cards/)                  | P2       | Reject: extend `c2-relative-time` with `warn-at` and overdue states, as `c2-countdown` already has                        |
| 119 | `c2-time-tracker`   | Start/stop pill with live elapsed time and logged total                      | ClickUp, Jira, Height          | [ClickUp](https://help.clickup.com/hc/en-us/articles/6304106812823-Track-time-on-tasks)     | P2       | Reject: extend `c2-countdown` with a count-up (stopwatch) mode; `c2-working-indicator` already shows elapsed time         |
| 120 | `c2-date-range-bar` | Compact start–end cell filled to the elapsed share                           | Monday.com, ClickUp            | [Monday.com](https://support.monday.com/hc/en-us/articles/115005333969-The-Timeline-Column) | P3       | Reject: a `c2-progress` preset with start and end labels                                                                  |

### L. Communication and media

| #   | Component               | What it does                                                               | Seen in                                                              | Source                                                                                                                                                    | Priority | Decision                                                                                                          |
| --- | ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| 122 | `c2-quick-time-menu`    | "Later today / Tomorrow / Next week" presets plus a custom date and time   | Gmail snooze and schedule send, Outlook, Superhuman, Slack reminders | [Mailmeteor](https://mailmeteor.com/blog/snooze-in-gmail)                                                                                                 | P2       | Reject: extend `c2-date-time-picker` with preset shortcuts ("Later today", "Tomorrow")                            |
| 123 | `c2-status-picker`      | Emoji, status text, presence and a "clear after" duration                  | Slack, Teams, Discord                                                | [Slack](https://slack.com/help/articles/201864558-Set-your-Slack-status-and-availability)                                                                 | P2       | Reject: a Slack-specific composition (emoji, text, `c2-select`); belongs in the blocks collection                 |
| 124 | `c2-jump-pill`          | Floating "New messages ↓" pill over a scroll container                     | Slack, Discord, Teams                                                | [Slack](https://slack.com/help/articles/226410907-View-all-your-unread-messages)                                                                          | P2       | Reject: covered by `c2-chat-message-list`, which already offers a jump to the latest message with an unread count |
| 125 | `c2-thread-summary`     | "4 replies · last reply 2h ago" row with reply avatars                     | Slack, Teams, Discord                                                | [Slack Design](https://slack.design/articles/threads-in-slack-a-long-design-journey-part-2-of-2/)                                                         | P2       | Reject: composition of `c2-avatar-group` and text inside `c2-chat-message`                                        |
| 126 | `c2-message-status`     | Sending, sent, delivered and seen ticks, with "seen by" avatars            | Teams, WhatsApp, Messenger                                           | [Teams](https://support.microsoft.com/en-us/office/use-read-receipts-for-messages-in-microsoft-teams-533f2334-32ef-424b-8d56-ed30e019f856)                | P2       | Reject: extend `c2-chat-message` with a delivery status (sending, sent, delivered, seen)                          |
| 127 | `c2-video-tile`         | Video or avatar, name, mute badge, speaking outline, pin menu              | Meet, Zoom, Teams, Discord                                           | [Google Meet](https://support.google.com/a/users/answer/9850339?hl=en)                                                                                    | P2       | Proposed                                                                                                          |
| 128 | `c2-video-grid`         | Tiled, spotlight or sidebar layout that fits N tiles                       | Meet, Zoom, Teams                                                    | [Google Workspace](https://workspaceupdates.googleblog.com/2025/03/dynamic-layouts-for-google-meet.html)                                                  | P2       | Proposed                                                                                                          |
| 129 | `c2-audio-visualizer`   | Live level bars, waveform or orb from a mic or audio stream (absorbs #166) | Discord, Meet, ChatGPT voice, ElevenLabs                             | [ElevenLabs UI](https://github.com/elevenlabs/ui)                                                                                                         | P2       | Proposed                                                                                                          |
| 130 | `c2-zoom-control`       | Zoom % button with −/+ and fit / 50 / 100 / 200% presets                   | Figma, Miro, Canva, Google Docs                                      | [Figma](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam)                                                                    | P2       | Reject: composition of `c2-button-group` and `c2-menu`                                                            |
| 131 | `c2-chapter-scrubber`   | Seek bar split into chapters with a hover thumbnail preview                | YouTube, Spotify podcasts, Netflix                                   | [gHacks](https://www.ghacks.net/2020/04/14/youtube-is-rolling-out-chapters-support/)                                                                      | P2       | Merged into #44                                                                                                   |
| 132 | `c2-media-card`         | Poster tile with resume progress, duration and hover actions               | Netflix, YouTube, Spotify                                            | [Tom's Guide](https://www.tomsguide.com/how-to/netflix-is-finally-letting-you-clean-up-your-continue-watching-row-heres-how-you-do-it)                    | P2       | Reject: a `c2-card` preset (media slot plus a `c2-progress`)                                                      |
| 133 | `c2-recording-controls` | Floating bar: red dot, timer, pause, restart, stop                         | Loom, Zoom, Teams                                                    | [Loom](https://support.atlassian.com/loom/docs/pause-and-resume-while-recording)                                                                          | P3       | Merged into #85                                                                                                   |
| 134 | `c2-floating-reactions` | Emoji that rise and fade over a surface                                    | Zoom, Teams, Meet                                                    | [Teams](https://support.microsoft.com/en-us/office/express-yourself-in-microsoft-teams-meetings-with-live-reactions-a8323a40-3d07-4129-934b-305370a36e21) | P3       | Merged into #171                                                                                                  |
| 135 | `c2-ruler`              | Ruler with draggable indent markers and tab stops                          | Google Docs, Canva, Figma                                            | [How-To Geek](https://www.howtogeek.com/781668/how-to-add-edit-and-remove-tab-stops-in-google-docs/)                                                      | P3       | Reject: a `c2-page-editor` feature, not a standalone element                                                      |
| 136 | `c2-sticky-note`        | Coloured S/M/L note with editable text and author                          | Miro, FigJam, Jamboard                                               | [Miro](https://help.miro.com/hc/en-us/articles/360017572054-Sticky-notes)                                                                                 | P3       | Reject: a `c2-card` preset, or a `c2-design-board` item                                                           |
| 137 | `c2-playing-indicator`  | Animated equalizer marking the active row, static when paused              | Spotify, YouTube Music, Apple Music                                  | [Spotify Community](https://community.spotify.com/t5/Content-Questions/Super-distracting-moving-animated-playlist-icon/td-p/5219800)                      | P3       | Reject: extend `c2-working-indicator` with an equalizer indicator                                                 |
| 138 | `c2-story-progress`     | Segmented auto-advancing bars; tap to step, hold to pause                  | Instagram, Snapchat, WhatsApp                                        | [DEV](https://dev.to/dev48v/i-rebuilt-instagram-stories-segmented-progress-bars-4bil)                                                                     | P3       | Reject: extend `c2-carousel` indicators with a segmented, timed style                                             |
| 139 | `c2-follow-button`      | Follow/Subscribed toggle with count and a notification-level menu          | YouTube, LinkedIn, Strava, Instagram                                 | [YouTube](https://support.google.com/youtube/answer/9336507?hl=en)                                                                                        | P3       | Reject: composition of `c2-button toggle` and `c2-split-button`                                                   |

### M. Commerce, fintech and CRM

| #   | Component               | What it does                                                                                       | Seen in                                   | Source                                                                                                                         | Priority | Decision                                                                                                     |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| 140 | `c2-rating-summary`     | Average score, stars, count and per-star bars that filter reviews                                  | Amazon, Airbnb, Google Maps, Play Store   | [Google Maps Platform](https://developers.google.com/maps/documentation/javascript/place-reviews)                              | P2       | Reject: composition of `c2-rate` and `c2-bar-list` (#224); belongs in the blocks collection                  |
| 141 | `c2-histogram-slider`   | Range slider over a price histogram; bars inside the range highlighted                             | Airbnb, Booking.com                       | [example PR](https://github.com/dnbl0/CCS-Static-latest/pull/4)                                                                | P2       | Reject: extend `c2-slider` with a `distribution` drawn behind the track                                      |
| 142 | `c2-quantity-picker`    | Popover of labelled min/max counters with a summary trigger ("2 adults, 1 child")                  | Airbnb, Booking.com                       | [Mobbin](https://mobbin.com/explore/screens/1cb2a0d3-4c01-4dd4-a26c-5499c86b1ac5)                                              | P2       | Reject: composition of `c2-overlay`, `c2-number-input` and `c2-form-field`; belongs in the blocks collection |
| 143 | `c2-fx-converter`       | Two linked amount + currency fields, swap, live rate and rate-lock countdown                       | Wise, Revolut                             | [Wise](https://docs.wise.com/guides/product/send-money/quotes/authenticated-quote)                                             | P2       | Reject: composition of two `c2-money-input`s and a swap button; belongs in the blocks collection             |
| 144 | `c2-payment-card`       | Card visual with masked number, reveal toggle and click-to-copy fields                             | Brex, Mercury, Revolut, Ramp              | [Brex](https://www.brex.com/support/manage-your-card)                                                                          | P2       | Reject: composition of `c2-card`, `c2-secret-field` and `c2-copy-button`                                     |
| 145 | `c2-payment-brand`      | Visa, Mastercard, Apple Pay… logo badge, optionally with "•••• 4242"                               | Stripe, Shopify, PayPal                   | [Stripe](https://stripe.com/en-fi/resources/more/credit-card-checkout-ui-design)                                               | P2       | Reject: an icon set (`@c2n/payment-icons`), not a component                                                  |
| 146 | `c2-promo-code-field`   | Apply a code with loading and error states; applied codes become removable tokens                  | Shopify checkout, Uber Eats, Amazon       | [Shopify Community](https://community.shopify.com/t/does-shopify-support-separate-gift-card-and-discount-code-fields/55242)    | P2       | Reject: composition of `c2-text-field`, `c2-button` and `c2-chip`                                            |
| 147 | `c2-opinion-scale`      | Numbered 0–10 or 1–5 scale with end labels and NPS bands                                           | Typeform, Intercom, Zendesk               | [Typeform](https://www.typeform.com/help/a/opinion-scale-question-360052363932/)                                               | P2       | Reject: extend `c2-rate` with a numbered scale and end labels                                                |
| 148 | `c2-sentiment-rating`   | Five labelled face buttons for satisfaction (CSAT)                                                 | Intercom, Zendesk, Duolingo               | [Intercom](https://www.intercom.com/help/en/articles/7872853-measure-customer-satisfaction-with-conversation-ratings)          | P2       | Reject: extend `c2-rate` with custom symbols (faces) per value                                               |
| 149 | `c2-sla-timer`          | Countdown pill that turns amber then red; shows overdue time                                       | Zendesk, Intercom, Salesforce Service     | [Zendesk](https://support.zendesk.com/hc/en-us/articles/4408832852122-Viewing-and-understanding-SLA-targets)                   | P2       | Reject: extend `c2-countdown`, which already has `warn-at`, with an overdue state                            |
| 150 | `c2-approval-chain`     | Ordered approvers with status and time, sequential or parallel, delegation                         | Rippling, Workday, Salesforce, Ramp       | [Rippling](https://www.rippling.com/permissions)                                                                               | P2       | Reject: covered by `c2-steps` / `c2-timeline` with avatars in the marker slot                                |
| 151 | `c2-weekly-hours`       | Time ranges per weekday with add, remove and copy-to-days                                          | Calendly, Rippling, Google Business hours | [Calendly](https://calendly.com/help/how-to-set-your-availability)                                                             | P2       | Reject: composition of `c2-time-range-picker` per weekday; belongs in the blocks collection                  |
| 152 | `c2-split-editor`       | Splits a total among people by equal, amount, percent or shares                                    | Monzo, PayPal, Revolut                    | [Monzo](https://monzo.com/help/monzo-with-friends/split-bill)                                                                  | P3       | Reject: app-specific composition of `c2-money-input` rows                                                    |
| 153 | `c2-keypad`             | Numeric keypad driving any field: amount display, or PIN dots with a biometric slot (absorbs #205) | Revolut, Cash App, Monzo, Robinhood       | [Revolut](https://help.revolut.com/en-US/help/wealth/exchanging-money/how-to-make-currency-exchanges/how-do-i-exchange-money/) | P3       | Proposed (renamed `c2-keypad`, absorbs #205)                                                                 |
| 154 | `c2-unit-amount-toggle` | Amount in one unit (dollars, shares, fiat, crypto) with the live equivalent                        | Robinhood, Coinbase                       | [Robinhood](https://robinhood.com/us/en/support/articles/fractional-shares/)                                                   | P3       | Reject: extend `c2-money-input` with a secondary unit                                                        |
| 155 | `c2-macro-picker`       | "/"-triggered canned responses, most-used first, with preview                                      | Zendesk, Intercom, HubSpot                | [Zendesk](https://support.zendesk.com/hc/en-us/articles/4408887656602-Using-macros-to-update-tickets)                          | P3       | Reject: merged into the `triggers` extension of #15 (a `/` trigger)                                          |
| 156 | `c2-streak`             | Day count with a week strip of completed days                                                      | Duolingo, Strava, LinkedIn Learning       | [Medium teardown](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)          | P3       | Reject: composition of `c2-heatmap-chart` (calendar) or `c2-progress`                                        |
| 157 | `c2-achievement-badge`  | Badge art with tier and progress to the next tier                                                  | Duolingo, Strava, Salesforce Trailhead    | [Duolingo wiki](https://duolingo.fandom.com/wiki/Achievements)                                                                 | P3       | Reject: illustration plus `c2-progress`; no behaviour of its own                                             |

### N. AI interfaces

| #   | Component              | What it does                                                              | Seen in                                   | Source                                                                                                                                        | Priority | Decision                                                                                     |
| --- | ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| 158 | `c2-suggestion-chips`  | Prompt starters and follow-up questions that emit the chosen prompt       | Perplexity, Copilot, ChatGPT, Gemini      | [AI UX Playground](https://aiuxplayground.com/teardowns/perplexity/output/)                                                                   | P2       | Reject: covered by `c2-chip-group` with clickable chips                                      |
| 159 | `c2-permission-prompt` | Inline tool approval: summary plus Allow once / Always allow / Deny       | Claude Code, Cursor, GitHub Copilot agent | [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/user-input)                                                                      | P2       | Reject: composition of `c2-card` and buttons; belongs in the blocks collection               |
| 160 | `c2-branch-pager`      | "‹ 2/3 ›" stepper through regenerated answers or versions                 | ChatGPT, Claude.ai, HuggingChat           | [AI Workspace](https://www.getaiworkspace.com/chatgpt-conversation-branching)                                                                 | P2       | Reject: covered by `c2-pagination variant="simple"`                                          |
| 161 | `c2-response-feedback` | Thumbs up/down, then reason chips and an optional comment                 | ChatGPT, Claude.ai, Copilot, GitLab Duo   | [TheFrontKit](https://thefrontkit.com/blogs/ai-chat-ui-best-practices)                                                                        | P2       | Reject: composition of icon buttons, `c2-chip-group` and `c2-textarea`                       |
| 162 | `c2-ghost-text`        | Inline grey completion; Tab accepts, Esc dismisses                        | Cursor, GitHub Copilot, Notion AI         | [Apidog](https://apidog.com/blog/cursor-tab/)                                                                                                 | P2       | Reject: extend `c2-textarea`, `c2-text-field` and `c2-code-editor` with an inline suggestion |
| 163 | `c2-change-review`     | Accept/reject bar for edit hunks, "hunk 2 of 5" navigation                | Cursor, Copilot Edits                     | [The Neural Base](https://theneuralbase.com/cursor/learn/beginner/reviewing-and-accepting-changes/)                                           | P2       | Reject: extend `c2-diff-viewer` with accept/reject per hunk                                  |
| 164 | `c2-selection-toolbar` | Floating toolbar on selected text (Ask AI, rewrite, format)               | ChatGPT Canvas, Notion AI                 | [All Things How](https://allthings.how/chatgpt-canvas-vs-claude-artifacts-how-do-they-differ/)                                                | P2       | Proposed                                                                                     |
| 165 | `c2-transcript`        | Speaker-labelled, timestamped segments; click to seek; active word synced | Otter.ai, Granola, ElevenLabs             | [MSU Denver](https://www.msudenver.edu/teaching-learning-design/instructional-accessibility/guides-resources/multimedia/otterai-transcripts/) | P2       | Proposed                                                                                     |
| 166 | `c2-voice-orb`         | Orb animating idle, listening and speaking from audio level               | ChatGPT voice, ElevenLabs, Gemini Live    | [TechCrunch](https://techcrunch.com/2024/09/24/openai-rolls-out-advanced-voice-mode-with-more-voices-and-a-new-look/)                         | P3       | Merged into #129                                                                             |
| 167 | `c2-generation-grid`   | 2×2 variants that blur in, with per-tile vary/upscale/select              | Midjourney, ChatGPT images                | [Android Authority](https://www.androidauthority.com/midjourney-u1-v1-buttons-meaning-3327309/)                                               | P3       | Reject: composition of `c2-masonry` (or CSS grid) and `c2-skeleton`                          |
| 168 | `c2-version-history`   | Snapshot list with bookmarks, preview and "Restore this version"          | Lovable, Bolt, v0                         | [Lovable](https://docs.lovable.dev/features/projects/history)                                                                                 | P3       | Reject: composition of `c2-list` and a preview pane (`c2-master-detail`)                     |

## 25 more from component libraries, app shots and inspiration sites

Researched on 2026-10-27, numbered 169 to 238. The first round (rows 1 to 168) read design systems and products. This round reads the animated and enterprise component catalogs that Dribbble-style interfaces are built from, recurring app-shot patterns (mobile, commerce, travel, fintech, AI agents), and the design inspiration sites (Dribbble, Mobbin, Refero, SaaSFrame, component.gallery, Awwwards, Godly) for section T.

The same day, every row of this file (rounds one and two) was re-verified against the descriptions in the manifests of the 216 `c2-*` elements on `develop`. A row stays only if it is a new, generic primitive. A row was rejected if an existing component already does the job, if the change is an improvement to an existing component (those are listed under "Extend instead of adding"), if it is a composition that belongs in the blocks collection, or if it is too specific to one product. 45 of the 70 rows researched in this round were dropped (see "Left off on purpose"). Round-one rows keep their number and carry the verdict in their Decision cell. The gaps in the numbering are the dropped rows.

The catalogs were read on 2026-10-27:

- [Magic UI registry](https://github.com/magicuidesign/magicui/blob/main/registry.json): 210 items.
- [shadcn/ui v4 registry](https://github.com/shadcn-ui/ui/blob/main/apps/v4/public/r/index.json): 65 components.
- Package lists on npm for [Zag](https://www.npmjs.com/org/zag-js) (the Ark UI state machines), [Syncfusion EJ2](https://www.npmjs.com/org/syncfusion), [Kendo React](https://www.npmjs.com/org/progress), [HeroUI](https://www.npmjs.com/org/heroui) and [MUI X](https://www.npmjs.com/org/mui).

The inspiration sites could not be fetched from the research environment, only searched: section T links the search result each pattern came from. Rows whose Source is "—" list the products from memory, without a link checked on that date: verify one before accepting the row.

### O. Motion and visual effects

| #   | Component            | What it does                                                                                               | Seen in                                                              | Source                                                                       | Priority | Decision |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- | -------- |
| 169 | `c2-text-effect`     | Animated text: rotating words, typewriter, scramble, shimmer, reveal; static under reduced motion          | Magic UI (word-rotate, typing-animation, hyper-text), Aceternity     | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P2       | Proposed |
| 170 | `c2-backdrop`        | Decorative `aria-hidden` background: dot, grid, stripe, flickering grid, aurora, meteors; themed by tokens | Magic UI (dot-pattern, flickering-grid, retro-grid, meteors), Linear | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P2       | Proposed |
| 171 | `c2-celebration`     | Confetti, burst or rising emoji fired by `fire()`; nothing under reduced motion (absorbs #134)             | Magic UI (confetti, cool-mode), Asana, Duolingo                      | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P2       | Proposed |
| 176 | `c2-beam`            | Animated connector drawn between two elements (data-flow and integration diagrams)                         | Magic UI (animated-beam), Stripe                                     | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 178 | `c2-device-frame`    | Phone, browser or laptop frame around slotted content                                                      | Magic UI (safari, iphone-15-pro, android)                            | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 180 | `c2-scroll-progress` | Reading progress of the page or a container as a bar or ring, scroll-driven                                | Magic UI (scroll-progress), Medium                                   | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |

### P. Enterprise data

| #   | Component             | What it does                                                                                     | Seen in                                               | Source                                                                        | Priority | Decision |
| --- | --------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | -------- |
| 182 | `c2-pivot-table`      | Drag fields to rows, columns and values; sum/count/avg, expandable subtotals                     | Syncfusion pivotview, Kendo pivotgrid, Excel          | [Syncfusion](https://www.npmjs.com/package/@syncfusion/ej2-pivotview)         | P2       | Proposed |
| 184 | `c2-radial-bar-chart` | Concentric rings or radial bars toward a goal (activity rings, budgets)                          | Apple Fitness, Oura, Monzo                            | —                                                                             | P2       | Proposed |
| 185 | `c2-barcode`          | EAN-13, UPC, Code 128 and Data Matrix as SVG                                                     | Syncfusion barcode-generator, Kendo barcodes, Shopify | [Syncfusion](https://www.npmjs.com/package/@syncfusion/ej2-barcode-generator) | P2       | Proposed |
| 186 | `c2-image-annotator`  | Arrows, boxes, text, blur and redact over an image; exports a PNG and the shapes                 | Syncfusion image-editor, Jam, Marker.io               | [Syncfusion](https://www.npmjs.com/package/@syncfusion/ej2-image-editor)      | P2       | Proposed |
| 188 | `c2-floating-panel`   | Draggable, resizable, minimisable window inside the page (cut from round 1, now in two catalogs) | Zag floating-panel, Figma, Zoom                       | [Zag](https://www.npmjs.com/package/@zag-js/floating-panel)                   | P3       | Proposed |
| 191 | `c2-network-graph`    | Force-directed node-link graph with zoom, selection and neighbour highlight                      | Neo4j Bloom, Obsidian, Wiz                            | —                                                                             | P3       | Proposed |
| 192 | `c2-sunburst-chart`   | Hierarchy as rings, click to zoom into a branch (cut from round 1)                               | Disk usage tools, budget breakdowns                   | —                                                                             | P3       | Proposed |
| 193 | `c2-word-cloud`       | Terms sized by weight, clickable to filter                                                       | Qualtrics, Dovetail                                   | —                                                                             | P3       | Proposed |

### Q. Inputs with built-in data and mobile inputs

| #   | Component          | What it does                                                                                | Seen in                                 | Source | Priority | Decision |
| --- | ------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------- | ------ | -------- | -------- |
| 195 | `c2-address-field` | Address autocomplete (pluggable provider) split into the fields each country's format needs | Stripe Address Element, Shopify, Airbnb | —      | P2       | Proposed |
| 201 | `c2-wheel-picker`  | iOS-style scroll wheel for time, height or weight                                           | iOS, Apple Health, MyFitnessPal         | —      | P2       | Proposed |

### R. Commerce, content and social

| #   | Component            | What it does                                                                | Seen in                    | Source | Priority | Decision |
| --- | -------------------- | --------------------------------------------------------------------------- | -------------------------- | ------ | -------- | -------- |
| 209 | `c2-share-sheet`     | Share targets, copy link and QR, falling back from the native Web Share API | Notion, Figma, YouTube     | —      | P2       | Proposed |
| 213 | `c2-embed`           | Click-to-load facade for YouTube, Vimeo, Loom or Figma iframes              | Notion, lite-youtube-embed | —      | P3       | Proposed |
| 215 | `c2-pull-to-refresh` | Pull gesture with progress and a release threshold (cut from round 1)       | iOS, Android, X            | —      | P3       | Proposed |

### S. Settings and admin

| #   | Component | What it does | Seen in | Source | Priority | Decision |
| --- | --------- | ------------ | ------- | ------ | -------- | -------- |

### T. Dashboards, flows and editorial (design inspiration sites)

| #   | Component       | What it does                                                                                                                | Seen in                                              | Source                                         | Priority | Decision |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------- | -------- | -------- |
| 234 | `c2-card-stack` | Swipe deck (keep or skip) and cards that stack as the page scrolls                                                          | Tinder, Apple Wallet, Awwwards sites                 | [Awwwards](https://www.awwwards.com/websites/) | P3       | Proposed |
| 236 | `c2-scrolly`    | Scrollytelling: a sticky graphic and steps that fire as each enters view; horizontal pinned mode                            | The New York Times, The Pudding, Apple product pages | [Awwwards](https://www.awwwards.com/websites/) | P3       | Proposed |
| 238 | `c2-pan-zoom`   | Pan and zoom viewport for any content: inertia, pinch, fit and zoom controls; shared by image previews, diagrams and boards | Godly and Awwwards portfolio sites                   | [Awwwards](https://www.awwwards.com/websites/) | P3       | Proposed |

### Extend instead of adding

The verification turned these into changes to an existing component, not new packages. Each one belongs in that component's next change. Rows that were rejected for one of these reasons give the row number.

**Inputs**

- `c2-textarea`, `c2-text-field`: the `triggers` API of `c2-rich-text-editor` for `@`, `#` and `/` suggestions (#15, #155); an inline suggestion that Tab accepts (#162); a floating-label variant.
- `c2-number-input`: drag on the label to scrub the value (#203).
- `c2-slider`: more than two thumbs that share a fixed total (#111); a `distribution` histogram drawn behind the track (#141).
- `c2-rate`: a numbered scale with end labels (#147) and custom symbols such as faces (#148).
- `c2-query-input`: custom token parsers for dates, `#tags` and priorities (#115).
- `c2-mask-input`: an IBAN checksum validator (#199). Its docs already list IBAN masks.
- `c2-date-time-picker`: preset shortcuts such as "Later today" and "Tomorrow" (#122).
- `c2-autocomplete`: result rows in several columns (Syncfusion multicolumn-combobox).
- Country, time zone and currency selects: extract the lists already inside `c2-phone-input`, `c2-date-time-picker` and `c2-money-input` into standalone selects (#196–#198). They should not ship a second copy of that data.

**Display and feedback**

- `c2-format-number`: an animated, rolling-digit mode (#37) that `c2-stat` then uses.
- `c2-relative-time`: `warn-at` and overdue states (#118).
- `c2-countdown`: an overdue state (#149) and a count-up stopwatch mode (#119).
- `c2-state-timeline`: an uptime preset, with daily buckets and the uptime % in the summary (#106).
- `c2-heatmap-chart`: already draws cohort triangles (`diagonal`, `cell-labels`) (#183). Document the cohort preset.
- `c2-map-chart`: an orthographic globe with drag to rotate (#177), and a dotted world-map preset.
- `c2-working-indicator`: an equalizer indicator (#137).
- `c2-image`: zoom, pan, rotate and a group gallery in `preview` (#42); a magnifier lens (#172).
- `c2-diff-viewer`: accept or reject each hunk (#163).
- `c2-timeline`: an actor avatar slot and day groups for activity feeds (#225).
- `c2-chat-message`: a delivery status (#126).
- `c2-card`: a pointer-following glow (#173) and shape masks for tickets and coupons (#212).

**Navigation, layout and overlays**

- `c2-tabs`: closable, reorderable tabs with an overflow menu and a new-tab button (#220); scroll buttons when the row overflows (also for `c2-chip-group`).
- `c2-steps`: panels with next/back and a validation gate, so the component can run a wizard (#226); a body slot on `c2-step` for a tool's input and output (#94).
- `c2-sheet`: snap points and a drag handle for `side="bottom"` (#77), plus an action-sheet preset.
- `c2-modal`: a full-screen mode.
- `c2-carousel`: a segmented, timed indicator style (#138); indicators that can follow any scroll-snap container (#232).
- `c2-list`: a grid layout with 2D keyboard navigation (#187); enter and exit animations (#181).
- `c2-flow`: custom node rendering with ports for each column (#113).
- `c2-button`: a success and an error state after `running`.
- `@c2n/core`: a focus-trap controller (#99).
- Icon sets: payment brands (#145) and priority glyphs (#117).

### Example apps to build next

The eight apps in `apps/examples` cover HTML, React, Vue, Angular, SvelteKit and Next.js, but every one is a desktop business tool. Each app below adds a framework or a form factor that is not covered yet, and it exercises the rows above. Under the dogfooding rule, that is what proves each row ready to ship.

| App                     | Framework              | New ground                        | Exercises                                                                                                                   |
| ----------------------- | ---------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Mobile wallet           | Lit + Vite (PWA)       | First mobile app, first Lit app   | `c2-keypad`, `c2-money-input`, `c2-mask-input` (IBAN), `c2-sheet` (bottom), `c2-wheel-picker`, `c2-celebration`             |
| Storefront and checkout | Nuxt (SSR)             | Server-rendered Vue, commerce     | `c2-carousel`, `c2-image` (preview, lens), `c2-radio` (cards), `c2-address-field`, `c2-card-input`, `c2-banner`             |
| Travel booking          | React Router 7 (SSR)   | Hydration of a React SSR app      | `c2-date-selector`, `c2-slider` (distribution), `c2-date-strip`, `c2-share-sheet`, `@c2n/google-map`                        |
| Fitness tracker         | SolidJS (PWA)          | Solid, touch-first inputs         | `c2-radial-bar-chart`, `c2-wheel-picker`, `c2-date-strip`, `c2-heatmap-chart`, `c2-celebration`                             |
| Product analytics       | Qwik                   | Resumability, heavy data          | `c2-pivot-table`, `c2-heatmap-chart` (cohorts), `c2-bar-list`, `c2-filter-builder`, `c2-sankey-chart`                       |
| AI agent workspace      | Next.js                | Streaming agent UI                | `c2-steps` (agent plan, tool calls), `c2-working-indicator`, `c2-diff-viewer`, `c2-tabs` (closable), `c2-selection-toolbar` |
| Team admin console      | Angular                | Settings and permissions          | `c2-choice-matrix`, `c2-transfer-list`, `c2-secret-field`, `c2-save-bar`, `c2-date-time-picker`                             |
| Marketing site          | Astro (islands)        | Static site, motion budget        | `c2-text-effect`, `c2-backdrop`, `c2-beam`, `c2-device-frame`, `c2-marquee`, `c2-scroll-progress`                           |
| Messaging app           | Svelte 5 (Vite, SPA)   | Mobile chat                       | `c2-audio-player`, `c2-audio-recorder`, `c2-reaction-bar`, `c2-share-sheet`, `c2-embed`                                     |
| Smart home dashboard    | Preact                 | Preact, tablet layout             | `c2-angle-slider`, `c2-radial-bar-chart`, `c2-timeline` (activity), `c2-dashboard`                                          |
| Data story              | Eleventy (static HTML) | Long-form editorial, no framework | `c2-scrolly`, `c2-bar-list`, `c2-map-chart`, `c2-pan-zoom`                                                                  |

## Delivery plan

Everything still listed ships in four waves sorted by priority, in PRs of 3 to 5 components. Wave 1 comes first because later items reuse it: `c2-form-field` (built) wraps every input in waves 2 and 4, and `c2-confirm-dialog` (built) backs destructive actions everywhere.

| Wave | Scope                | Planned on 2026-10-04 | Gate before the next wave                       |
| ---- | -------------------- | --------------------- | ----------------------------------------------- |
| 1    | Foundations (P1)     | 23                    | `c2-form-field` wraps every existing input      |
| 2    | Business apps (P2)   | 50                    | Blocks collection opens (forms, settings pages) |
| 3    | Data, media, AI (P2) | 42                    | P3 list re-ranked from `COMPONENT-FEEDBACK.md`  |
| 4    | Specialized (P3)     | 50                    | —                                               |

The counts are the plan as researched and are not kept up to date (a running total is a line every component PR would edit); the tables above hold what remains. Each gate has to pass before the next wave starts. No calendar dates are set yet.

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
| Kanban, Gantt, maps, working indicator | Already in c2n: `c2-kanban`, `@c2n/gantt`, `@c2n/google-map`, `c2-working-indicator` |
| Layout helpers (Stack, Grid, Flex, Center, Space) | Plain CSS does this better than a custom element |
| Login form, pricing table, checkout, settings page | Blocks made from primitives, not primitives. They belong in the planned blocks collection. |
| Portal, config provider, theme provider | Framework concepts with no web-component equivalent; `@c2n/theme` tokens already cover theming |
| Back-to-top | Cut to keep the first list at 100; floating window, pull-to-refresh and sunburst came back as rows 188, 215 and 192 |

From the app research, six patterns were also cut because only one product ships them, or because an existing component covers them with a preset: Basecamp's hill chart, Google Maps' busyness chart, Coinbase's ruler picker, ChatGPT's response compare, Gemini's claim check, and the burndown chart (a `c2-line-chart` preset).

From the 2026-10-27 round, these rows were researched and dropped during verification:

| #   | Component               | Why not                                                                                           |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| 172 | `c2-image-magnifier`    | Extend `c2-image` (magnifier on hover/press)                                                      |
| 173 | `c2-spotlight`          | A `c2-card` effect (pointer-following glow), like `c2-border-beam`                                |
| 174 | `c2-dock`               | Niche macOS pattern with poor keyboard and touch use                                              |
| 175 | `c2-orbit`              | Decorative marketing pattern; plain CSS animation                                                 |
| 177 | `c2-globe`              | Extend `c2-map-chart` with an orthographic projection and drag to rotate (d3-geo already does it) |
| 179 | `c2-scratch-reveal`     | Novelty pattern                                                                                   |
| 181 | `c2-animated-list`      | Extend `c2-list` with enter and exit animations                                                   |
| 183 | `c2-cohort-table`       | Covered by `c2-heatmap-chart` (`diagonal`, `cell-labels`)                                         |
| 187 | `c2-grid-list`          | Extend `c2-list` with a grid layout and 2D keyboard navigation                                    |
| 189 | `c2-chart-builder`      | App-level composition of selects and charts                                                       |
| 190 | `c2-ribbon`             | Composition of `c2-tabs`, `c2-button-group toolbar` and `c2-overflow-list`                        |
| 194 | `c2-pipeline`           | Covered by `c2-flow`, which draws pipelines with a status per node                                |
| 196 | `c2-country-select`     | Extract from `c2-phone-input` (country list) instead of a new data set                            |
| 197 | `c2-timezone-select`    | Extract from `c2-date-time-picker` (`time-zones`)                                                 |
| 198 | `c2-currency-select`    | Extract from `c2-money-input` (`currencies`)                                                      |
| 199 | `c2-iban-input`         | Covered by `c2-mask-input`, whose docs already name IBANs; add a checksum validator               |
| 200 | `c2-swatch-picker`      | Covered by `c2-radio` card styling, like #5                                                       |
| 203 | `c2-scrub-input`        | Extend `c2-number-input` with drag-to-scrub on its label                                          |
| 204 | `c2-seat-map`           | Domain-specific layout                                                                            |
| 205 | `c2-passcode`           | Merged into #153 `c2-keypad`                                                                      |
| 206 | `c2-price`              | Composition of `c2-format-number` and `c2-badge`                                                  |
| 207 | `c2-product-gallery`    | Composition of `c2-carousel` and `c2-image`                                                       |
| 208 | `c2-cookie-consent`     | `c2-banner` already covers the notice; preferences are `c2-modal` + `c2-switch`                   |
| 210 | `c2-link-preview`       | A `c2-card` preset (`href`, media slot)                                                           |
| 211 | `c2-voice-message`      | Merged into #45                                                                                   |
| 212 | `c2-ticket`             | A `c2-card` shape (CSS mask)                                                                      |
| 214 | `c2-spoiler`            | CSS and a button                                                                                  |
| 216 | `c2-reasoning`          | Composition of `c2-details` and `c2-working-indicator`                                            |
| 217 | `c2-agent-plan`         | Covered by `c2-steps` (statuses, sub-steps)                                                       |
| 218 | `c2-model-picker`       | A `c2-select` preset with rich rows                                                               |
| 219 | `c2-context-meter`      | A `c2-progress` / `c2-meter` preset with a `c2-hover-card`                                        |
| 220 | `c2-document-tabs`      | Extend `c2-tabs` (closable, reorderable, overflow menu)                                           |
| 221 | `c2-workspace-switcher` | A `c2-menu` / `c2-select` block                                                                   |
| 223 | `c2-bento-grid`         | Covered by `c2-dashboard`, `c2-masonry` and CSS grid                                              |
| 225 | `c2-activity-feed`      | Extend `c2-timeline` (actor avatar slot, day groups); its docs already name the activity feed     |
| 226 | `c2-wizard`             | Extend `c2-steps` with panels, next/back and a validation gate                                    |
| 227 | `c2-receipt`            | Composition of `c2-status-panel` and `c2-description-list`                                        |
| 228 | `c2-quote`              | Covered by `c2-markdown` and `<blockquote>`                                                       |
| 229 | `c2-leaderboard`        | Composition of `c2-list` or `c2-table`                                                            |
| 230 | `c2-delta-bar`          | Shipped as `c2-bar-list` `diverging`                                                              |
| 231 | `c2-control-tile`       | Composition of `c2-card`, `c2-switch` and `c2-slider`                                             |
| 232 | `c2-page-indicator`     | Extract the `c2-carousel` indicators so they can follow any scroll-snap container                 |
| 233 | `c2-date-badge`         | Composition of `c2-format-date` and CSS                                                           |
| 235 | `c2-flip-card`          | CSS 3D transform and a button                                                                     |
| 237 | `c2-expanding-panels`   | CSS flex transition                                                                               |
