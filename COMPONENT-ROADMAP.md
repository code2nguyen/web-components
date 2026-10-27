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

| #   | Component           | What it adds                                                       | Real-world model                                                                | Priority | Decision                                                                                                            |
| --- | ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| 5   | `c2-choice-card`    | Card-sized radio or checkbox for plan, shipping or payment choices | Chakra radio/checkbox card, Carbon options tile; Stripe and Vercel plan pickers | P2       | Reject: covered by `c2-radio` card styling (container border, checked states, description slot) in `c2-radio-group` |
| 12  | `c2-month-picker`   | Month or year granularity (billing periods, card expiry)           | Mantine MonthPicker / YearPicker                                                | P2       | Proposed                                                                                                            |
| 14  | `c2-transfer-list`  | Move items between two lists (roles, permissions)                  | antd Transfer, PrimeVue PickList                                                | P3       | Proposed                                                                                                            |
| 15  | `c2-mention-input`  | `@user` and `#tag` suggestions inside text                         | antd Mentions; Slack, GitHub                                                    | P2       | Proposed                                                                                                            |
| 19  | `c2-signature-pad`  | Draw a signature, export SVG or PNG                                | Ark signature pad; DocuSign                                                     | P3       | Proposed                                                                                                            |
| 20  | `c2-angle-slider`   | Circular knob for angles and dials                                 | Ark/Mantine angle slider, PrimeVue Knob                                         | P3       | Proposed                                                                                                            |
| 21  | `c2-emoji-picker`   | Searchable emoji grid with skin tones and recents                  | Slack, GitHub, Discord                                                          | P2       | Proposed                                                                                                            |
| 22  | `c2-cron-input`     | Build a recurring schedule, output a cron expression               | Vercel cron jobs, GitHub Actions schedules                                      | P3       | Proposed                                                                                                            |
| 23  | `c2-duration-input` | Accepts "1h 30m" and "90m", stores seconds                         | Jira time tracking, Toggl                                                       | P3       | Proposed                                                                                                            |
| 25  | `c2-card-input`     | Card number, expiry and CVC with brand detection and Luhn check    | Stripe Elements card field                                                      | P2       | Proposed                                                                                                            |

### B. Data display

| #   | Component           | What it adds                                                     | Real-world model                                    | Priority | Decision |
| --- | ------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | -------- | -------- |
| 37  | `c2-rolling-number` | Digits that roll when a value changes                            | Mantine RollingNumber; Robinhood tickers            | P3       | Proposed |
| 42  | `c2-image-viewer`   | Fullscreen lightbox with zoom, pan, rotate and a thumbnail strip | PrimeVue Galleria, antd Image preview group         | P2       | Proposed |
| 43  | `c2-image-compare`  | Before/after slider                                              | Web Awesome comparison, PrimeVue ImageCompare       | P3       | Proposed |
| 44  | `c2-video-player`   | Themed controls, captions, chapters                              | Loom, YouTube                                       | P3       | Proposed |
| 45  | `c2-audio-player`   | Waveform playback for voice notes and recordings                 | Slack clips, WhatsApp voice notes                   | P3       | Proposed |
| 46  | `c2-pdf-viewer`     | Paged PDF preview with zoom and search                           | DocuSign, Gmail attachment preview                  | P3       | Proposed |
| 48  | `c2-marquee`        | Continuous scrolling strip, pauses on hover                      | Chakra, Mantine and Ark marquee; stock ticker tapes | P3       | Proposed |

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
| 64  | `c2-scroll-area` | Themed scrollbars and edge shadows                               | Mantine, Chakra and PrimeVue ScrollArea    | P2       | Proposed                                                                                         |

### E. Overlays and feedback

These build on `c2-overlay` (anchored popup), `c2-modal` and `c2-sheet`, which already exist.

| #   | Component                | What it adds                                                               | Real-world model                                              | Priority | Decision |
| --- | ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------- | -------- | -------- |
| 75  | `c2-notification-center` | Inbox panel with read and unread states, grouping and "mark all read"      | Carbon notification panel; Linear inbox, GitHub notifications | P2       | Proposed |
| 77  | `c2-bottom-sheet`        | Mobile sheet with drag handle and snap points                              | Spectrum tray, Vaul (shadcn drawer); Apple Maps               | P2       | Proposed |
| 79  | `c2-watermark`           | Tiled text or logo over content (confidential screens, screenshot tracing) | antd Watermark                                                | P3       | Proposed |

### F. Collaboration

| #   | Component           | What it adds                                                  | Real-world model                                                              | Priority | Decision |
| --- | ------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | -------- |
| 80  | `c2-comment-thread` | Threaded comments with resolve, reply, edit and mentions      | Figma, Google Docs, GitHub review threads                                     | P2       | Proposed |
| 81  | `c2-reaction-bar`   | Emoji reactions with counts, "you reacted" state and a picker | Slack, GitHub                                                                 | P2       | Proposed |
| 82  | `c2-people-picker`  | Search people, show avatar chips, assign a role per person    | Fluent / Microsoft Graph people picker; Google Drive and Notion share dialogs | P2       | Proposed |
| 83  | `c2-live-cursors`   | Other users' named cursors and selections over a canvas       | Figma, Miro, Google Docs                                                      | P3       | Proposed |
| 84  | `c2-poll`           | Vote and see live results                                     | Slack and Microsoft Teams polls                                               | P3       | Proposed |
| 85  | `c2-audio-recorder` | Record, preview and send a voice clip                         | Slack clips, WhatsApp                                                         | P3       | Proposed |

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

| #   | Component        | What it adds                                                         | Real-world model                                        | Priority | Decision |
| --- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------- | -------- | -------- |
| 94  | `c2-tool-call`   | Collapsible card for an agent step: tool name, input, status, output | Claude and ChatGPT agent steps, Vercel AI Elements Tool | P2       | Proposed |
| 95  | `c2-citation`    | Numbered inline source marker with a hover preview of the source     | Perplexity, ChatGPT search                              | P2       | Proposed |
| 97  | `c2-web-preview` | Sandboxed iframe with URL bar, reload and device sizes               | v0, Bolt                                                | P3       | Proposed |

### I. Utilities

| #   | Component       | What it adds                                                           | Real-world model                  | Priority | Decision |
| --- | --------------- | ---------------------------------------------------------------------- | --------------------------------- | -------- | -------- |
| 99  | `c2-focus-trap` | Keeps focus inside a region (custom panels, inline editors)            | Ark, Chakra and Mantine FocusTrap | P2       | Proposed |
| 100 | `c2-in-view`    | Fires when content enters the viewport (lazy reveal, infinite loading) | Web Awesome intersection-observer | P3       | Proposed |

## 68 more from real apps

Researching 90 products found 68 more primitives that no design system above ships as a component, numbered 101 to 168: 4 P1, 42 P2 and 22 P3. The products were Linear, Slack, Stripe, Datadog, ChatGPT, Spotify, Zendesk and others. Each row was seen in at least two products. The source is the help, changelog or teardown page the pattern was checked against on 2026-10-04.

### J. Developer and data tools

| #   | Component             | What it does                                                         | Seen in                                                                       | Source                                                                                                                | Priority | Decision                                                                                                    |
| --- | --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| 102 | `c2-distribution-bar` | One 100% stacked bar of a breakdown, with legend and hover shares    | Sentry tags, GitHub language bar, Monday.com battery, Linear project progress | [Sentry](https://docs.sentry.io/product/issues/issue-details/)                                                        | P1       | Proposed                                                                                                    |
| 104 | `c2-facet-list`       | Sidebar of attribute values with counts and include/exclude toggles  | Datadog, Sentry, Metabase, Kibana                                             | [Datadog](https://docs.datadoghq.com/logs/explorer/facets/)                                                           | P2       | Proposed                                                                                                    |
| 106 | `c2-uptime-bar`       | One tick per day coloured by status, uptime % and hover detail       | Atlassian Statuspage, GitHub and Vercel status pages                          | [Statuspage](https://support.atlassian.com/statuspage/docs/display-historical-uptime-of-components/)                  | P2       | Proposed                                                                                                    |
| 107 | `c2-check-list`       | CI checks grouped by result, failing first, with duration and re-run | GitHub merge box, GitLab, Vercel                                              | [GitHub](https://github.blog/changelog/2025-03-04-improved-pull-request-merge-experience-is-now-generally-available/) | P2       | Proposed                                                                                                    |
| 109 | `c2-flame-graph`      | Stacked frames sized by share; zoom and search                       | Datadog, Pyroscope, Sentry profiling                                          | [Datadog](https://docs.datadoghq.com/dashboards/widgets/profiling_flame_graph/)                                       | P3       | Proposed                                                                                                    |
| 111 | `c2-split-allocator`  | Splits 100% across variants, handles constrained to the total        | PostHog, LaunchDarkly, Statsig                                                | [PostHog](https://posthog.com/docs/experiments/creating-an-experiment)                                                | P3       | Proposed                                                                                                    |
| 112 | `c2-commit-graph`     | Commit rows with branch and merge lanes and ref labels               | GitLab, GitKraken, Bitbucket                                                  | [GitLab](https://docs.gitlab.com/user/project/repository/)                                                            | P3       | Proposed                                                                                                    |
| 113 | `c2-schema-diagram`   | Table cards with typed columns, keys and relation edges              | Supabase, Snowflake, ChartDB                                                  | [Basedash](https://www.basedash.com/tools/supabase-schema-visualizer)                                                 | P3       | Reject: covered by `c2-flow` (`rows`, `sourcePort`/`targetPort`, crow's-foot `sourceMarker`/`targetMarker`) |

### K. Work management

| #   | Component           | What it does                                                                 | Seen in                        | Source                                                                                      | Priority | Decision |
| --- | ------------------- | ---------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | -------- | -------- |
| 115 | `c2-quick-add`      | One line that parses "Fri 2pm #work p1" and highlights the recognised tokens | Todoist, Asana, Linear, Things | [Todoist](https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz)     | P2       | Proposed |
| 116 | `c2-status-icon`    | Workflow-state glyph: backlog, todo, partial progress, done, cancelled       | Linear, Height, Jira           | [Linear](https://linear.app/docs/configuring-workflows)                                     | P2       | Proposed |
| 117 | `c2-priority-icon`  | Bar or flag glyph for none to urgent, with an accessible label               | Linear, Jira, Todoist          | [Linear](https://linear.app/changelog/2024-07-25-priority-for-projects-and-micro-adjust)    | P2       | Proposed |
| 118 | `c2-due-date`       | Date pill that turns due-soon, overdue or done, with a relative label        | Trello, Todoist, Monday.com    | [Trello](https://support.atlassian.com/trello/docs/adding-dates-to-cards/)                  | P2       | Proposed |
| 119 | `c2-time-tracker`   | Start/stop pill with live elapsed time and logged total                      | ClickUp, Jira, Height          | [ClickUp](https://help.clickup.com/hc/en-us/articles/6304106812823-Track-time-on-tasks)     | P2       | Proposed |
| 120 | `c2-date-range-bar` | Compact start–end cell filled to the elapsed share                           | Monday.com, ClickUp            | [Monday.com](https://support.monday.com/hc/en-us/articles/115005333969-The-Timeline-Column) | P3       | Proposed |

### L. Communication and media

| #   | Component               | What it does                                                             | Seen in                                                              | Source                                                                                                                                                    | Priority | Decision |
| --- | ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
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

### M. Commerce, fintech and CRM

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

### N. AI interfaces

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

## 70 more from component libraries, app shots and inspiration sites

Researched on 2026-10-27, numbered 169 to 238. The first round (rows 1 to 168) read design systems and products. This round reads the animated and enterprise component catalogs that Dribbble-style interfaces are built from, recurring app-shot patterns (mobile, commerce, travel, fintech, AI agents), and the design inspiration sites (Dribbble, Mobbin, Refero, SaaSFrame, component.gallery, Awwwards, Godly) for section T. Every row was checked against the 216 `c2-*` tags on `develop` and rows 1 to 168 of this file.

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
| 171 | `c2-celebration`     | Confetti or burst fired by `fire()` on success; nothing under reduced motion                               | Magic UI (confetti, cool-mode), Asana, Duolingo                      | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P2       | Proposed |
| 172 | `c2-image-magnifier` | Lens zoom over an image on hover, or on press on touch                                                     | Magic UI (lens), Amazon, Nike                                        | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P2       | Proposed |
| 173 | `c2-spotlight`       | Glow and border that follow the cursor across a card or a grid of cards                                    | Magic UI (magic-card, neon-gradient-card), Vercel, Linear            | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 174 | `c2-dock`            | Toolbar whose items magnify near the pointer, with labels                                                  | Magic UI (dock), macOS                                               | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 175 | `c2-orbit`           | Slotted icons orbiting a centre on concentric rings (integration heroes)                                   | Magic UI (orbiting-circles), Zapier, Raycast                         | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 176 | `c2-beam`            | Animated connector drawn between two elements (data-flow and integration diagrams)                         | Magic UI (animated-beam), Stripe                                     | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 177 | `c2-globe`           | Rotating 3D globe with markers and arcs, drag to spin                                                      | Magic UI (globe), Stripe, GitHub, Vercel                             | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 178 | `c2-device-frame`    | Phone, browser or laptop frame around slotted content                                                      | Magic UI (safari, iphone-15-pro, android)                            | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 179 | `c2-scratch-reveal`  | Scratch a canvas layer to reveal a reward; keyboard button fallback                                        | Magic UI (scratch-to-reveal), Google Pay rewards                     | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 180 | `c2-scroll-progress` | Reading progress of the page or a container as a bar or ring, scroll-driven                                | Magic UI (scroll-progress), Medium                                   | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |
| 181 | `c2-animated-list`   | Staggered enter and exit of items for live feeds                                                           | Magic UI (animated-list), Vercel deployments                         | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |

### P. Enterprise data

| #   | Component             | What it does                                                                                     | Seen in                                               | Source                                                                        | Priority | Decision |
| --- | --------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | -------- |
| 182 | `c2-pivot-table`      | Drag fields to rows, columns and values; sum/count/avg, expandable subtotals                     | Syncfusion pivotview, Kendo pivotgrid, Excel          | [Syncfusion](https://www.npmjs.com/package/@syncfusion/ej2-pivotview)         | P2       | Proposed |
| 183 | `c2-cohort-table`     | Retention triangle: cohorts by period, cells shaded by rate                                      | Mixpanel, Amplitude, PostHog                          | —                                                                             | P2       | Proposed |
| 184 | `c2-radial-bar-chart` | Concentric rings or radial bars toward a goal (activity rings, budgets)                          | Apple Fitness, Oura, Monzo                            | —                                                                             | P2       | Proposed |
| 185 | `c2-barcode`          | EAN-13, UPC, Code 128 and Data Matrix as SVG                                                     | Syncfusion barcode-generator, Kendo barcodes, Shopify | [Syncfusion](https://www.npmjs.com/package/@syncfusion/ej2-barcode-generator) | P2       | Proposed |
| 186 | `c2-image-annotator`  | Arrows, boxes, text, blur and redact over an image; exports a PNG and the shapes                 | Syncfusion image-editor, Jam, Marker.io               | [Syncfusion](https://www.npmjs.com/package/@syncfusion/ej2-image-editor)      | P2       | Proposed |
| 187 | `c2-grid-list`        | Keyboard-navigable grid of selectable tiles (photos, files, templates)                           | Zag gridlist, Google Photos, Figma                    | [Zag](https://www.npmjs.com/package/@zag-js/gridlist)                         | P2       | Proposed |
| 188 | `c2-floating-panel`   | Draggable, resizable, minimisable window inside the page (cut from round 1, now in two catalogs) | Zag floating-panel, Figma, Zoom                       | [Zag](https://www.npmjs.com/package/@zag-js/floating-panel)                   | P3       | Proposed |
| 189 | `c2-chart-builder`    | Choose dimensions, measures and a chart type with a live preview; emits a c2 chart spec          | Kendo chart-wizard, Metabase, Looker                  | [Kendo](https://www.npmjs.com/package/@progress/kendo-react-chart-wizard)     | P3       | Proposed |
| 190 | `c2-ribbon`           | Tabbed toolbar of labelled groups that collapse into overflow menus                              | Syncfusion ribbon, Word, Excel                        | [Syncfusion](https://www.npmjs.com/package/@syncfusion/ej2-ribbon)            | P3       | Proposed |
| 191 | `c2-network-graph`    | Force-directed node-link graph with zoom, selection and neighbour highlight                      | Neo4j Bloom, Obsidian, Wiz                            | —                                                                             | P3       | Proposed |
| 192 | `c2-sunburst-chart`   | Hierarchy as rings, click to zoom into a branch (cut from round 1)                               | Disk usage tools, budget breakdowns                   | —                                                                             | P3       | Proposed |
| 193 | `c2-word-cloud`       | Terms sized by weight, clickable to filter                                                       | Qualtrics, Dovetail                                   | —                                                                             | P3       | Proposed |
| 194 | `c2-pipeline`         | CI/CD stages as columns of jobs with status, durations and edges                                 | GitHub Actions, GitLab, Vercel                        | —                                                                             | P3       | Proposed |

### Q. Inputs with built-in data and mobile inputs

| #   | Component            | What it does                                                                                | Seen in                                 | Source | Priority | Decision |
| --- | -------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------- | ------ | -------- | -------- |
| 195 | `c2-address-field`   | Address autocomplete (pluggable provider) split into the fields each country's format needs | Stripe Address Element, Shopify, Airbnb | —      | P2       | Proposed |
| 196 | `c2-country-select`  | Countries with flags, search and pinned favourites; shares `c2-phone-input`'s country data  | Stripe, Shopify, Wise                   | —      | P2       | Proposed |
| 197 | `c2-timezone-select` | Zones grouped by region with UTC offset and local time, search by city                      | Calendly, Google Calendar, Linear       | —      | P2       | Proposed |
| 198 | `c2-currency-select` | ISO currencies with symbol and flag; pairs with `c2-money-input`                            | Wise, Stripe, Revolut                   | —      | P2       | Proposed |
| 199 | `c2-iban-input`      | IBAN grouped by country format, checksum validation, bank name through a lookup callback    | Qonto, Revolut, Wise                    | —      | P2       | Proposed |
| 200 | `c2-swatch-picker`   | Colour, material or size swatches with out-of-stock and price-difference states             | Shopify, Nike, Apple Store              | —      | P2       | Proposed |
| 201 | `c2-wheel-picker`    | iOS-style scroll wheel for time, height or weight                                           | iOS, Apple Health, MyFitnessPal         | —      | P2       | Proposed |
| 202 | `c2-date-strip`      | Horizontal scrolling strip of days with markers and the selected day                        | Google Fit, Calendly mobile, Uber Eats  | —      | P2       | Proposed |
| 203 | `c2-scrub-input`     | Number field changed by dragging its label, with modifier keys for steps                    | Figma, Framer, Blender                  | —      | P3       | Proposed |
| 204 | `c2-seat-map`        | Seat or table selection with categories, prices and availability                            | Ticketmaster, airline apps, cinema apps | —      | P3       | Proposed |
| 205 | `c2-passcode`        | Lock-screen PIN dots and keypad with a biometric slot                                       | Banking apps, iOS                       | —      | P3       | Proposed |

### R. Commerce, content and social

| #   | Component            | What it does                                                                             | Seen in                                | Source | Priority | Decision |
| --- | -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- | ------ | -------- | -------- |
| 206 | `c2-price`           | Amount with currency, compare-at strike-through, discount badge, unit price and tax note | Shopify, Amazon, Apple Store           | —      | P2       | Proposed |
| 207 | `c2-product-gallery` | Main image with thumbnails, zoom (row 172), video and swipe on touch                     | Shopify Dawn, Nike, Apple Store        | —      | P2       | Proposed |
| 208 | `c2-cookie-consent`  | Consent banner plus a category preferences dialog; stores the choice and fires an event  | OneTrust, Cookiebot, most EU sites     | —      | P2       | Proposed |
| 209 | `c2-share-sheet`     | Share targets, copy link and QR, falling back from the native Web Share API              | Notion, Figma, YouTube                 | —      | P2       | Proposed |
| 210 | `c2-link-preview`    | URL card (title, image, site) from metadata the app supplies                             | Slack, iMessage, Notion                | —      | P2       | Proposed |
| 211 | `c2-voice-message`   | Recorded clip bubble: waveform, scrub, speed, transcript toggle                          | WhatsApp, Telegram, Slack              | —      | P2       | Proposed |
| 212 | `c2-ticket`          | Perforated ticket, boarding pass or coupon with a stub and a code slot                   | Apple Wallet, airline apps, Eventbrite | —      | P3       | Proposed |
| 213 | `c2-embed`           | Click-to-load facade for YouTube, Vimeo, Loom or Figma iframes                           | Notion, lite-youtube-embed             | —      | P3       | Proposed |
| 214 | `c2-spoiler`         | Blurs content until the reader reveals it                                                | Discord, Telegram, Reddit              | —      | P3       | Proposed |
| 215 | `c2-pull-to-refresh` | Pull gesture with progress and a release threshold (cut from round 1)                    | iOS, Android, X                        | —      | P3       | Proposed |

### S. AI agents and app chrome

| #   | Component               | What it does                                                                                 | Seen in                              | Source                                                                       | Priority | Decision |
| --- | ----------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- | -------- | -------- |
| 216 | `c2-reasoning`          | Collapsible thinking block, live while streaming, then "Thought for 12s"                     | ChatGPT, Claude, Gemini              | —                                                                            | P2       | Proposed |
| 217 | `c2-agent-plan`         | Live plan of steps (pending, running, done, failed) with sub-steps and an approve action     | Claude Code, Cursor, Devin           | —                                                                            | P2       | Proposed |
| 218 | `c2-model-picker`       | Model select with provider icon, capability badges and cost or speed hints                   | ChatGPT, Cursor, Perplexity          | —                                                                            | P2       | Proposed |
| 219 | `c2-context-meter`      | Context-window usage ring with a breakdown on hover                                          | Cursor, Claude Code                  | —                                                                            | P3       | Proposed |
| 220 | `c2-document-tabs`      | Closable, reorderable tabs with a dirty dot, overflow menu and new-tab button                | VS Code, Figma, Chrome               | —                                                                            | P2       | Proposed |
| 221 | `c2-workspace-switcher` | Organisation or project switcher with avatars, search and "create"                           | Slack, Linear, Vercel, Notion        | —                                                                            | P2       | Proposed |
| 222 | `c2-permission-matrix`  | Roles by permissions grid with tri-state groups and inherited values                         | GitHub, Okta, Supabase               | —                                                                            | P2       | Proposed |
| 223 | `c2-bento-grid`         | Feature tiles with authored spans that collapse to one column; tile slots for media and copy | Magic UI (bento-grid), Apple, Linear | [Magic UI](https://github.com/magicuidesign/magicui/blob/main/registry.json) | P3       | Proposed |

### T. Dashboards, flows and editorial (design inspiration sites)

| #   | Component             | What it does                                                                                        | Seen in                                                      | Source                                                                  | Priority | Decision |
| --- | --------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | -------- | -------- |
| 224 | `c2-bar-list`         | Ranked rows whose background is a bar: icon, label or link, value ("Top pages", "Top countries")    | Tremor BarList, Vercel Analytics, Plausible, Stripe          | [Tremor](https://www.npmjs.com/package/@tremor/react)                   | P2       | Proposed |
| 225 | `c2-activity-feed`    | Events grouped by day: actor avatar, verb, linked object, time, inline preview, load more           | GitHub, Linear, HubSpot; Dribbble widget cards               | [Dribbble](https://dribbble.com/tags/widget_cards)                      | P2       | Proposed |
| 226 | `c2-wizard`           | Step panels with a validation gate, back, next and finish, driving `c2-steps`; resumable            | SaaSFrame wizard flows, Stripe Connect, Gusto                | [Page Flows / Refero](https://refero.design/)                           | P2       | Proposed |
| 227 | `c2-receipt`          | Confirmation of a transfer or order: status, amount, parties, line items, copyable reference, share | Wise, Revolut, Cash App                                      | [Wandr](https://www.wandr.studio/blog/fintech-mobile-app-design-trends) | P2       | Proposed |
| 228 | `c2-quote`            | Block or pull quote with attribution, avatar and source; testimonial variant                        | component.gallery (Quote, in 60 components), marketing sites | [component.gallery](https://component.gallery/components/)              | P2       | Proposed |
| 229 | `c2-leaderboard`      | Ranked people with a top-three podium, rank-change arrows and the current user pinned               | Duolingo, Strava, sales dashboards                           | —                                                                       | P3       | Proposed |
| 230 | `c2-delta-bar`        | Bar that grows left or right from the centre for a negative or positive change                      | Tremor DeltaBar, finance dashboards                          | [Tremor](https://www.npmjs.com/package/@tremor/react)                   | P3       | Proposed |
| 231 | `c2-control-tile`     | Device tile: icon, state, toggle and a quick slider (light, thermostat, lock)                       | Apple Home, Google Home                                      | —                                                                       | P3       | Proposed |
| 232 | `c2-page-indicator`   | Paging dots or dashes linked to any scroll container (onboarding pages, custom carousels)           | iOS page control, Mobbin onboarding screens                  | [Mobbin](https://mobbin.com/explore/mobile/ui-elements)                 | P3       | Proposed |
| 233 | `c2-date-badge`       | Calendar-tile date ("OCT / 27") for event lists and cards                                           | Eventbrite, Meetup, Luma                                     | —                                                                       | P3       | Proposed |
| 234 | `c2-card-stack`       | Swipe deck (keep or skip) and cards that stack as the page scrolls                                  | Tinder, Apple Wallet, Awwwards sites                         | [Awwwards](https://www.awwwards.com/websites/)                          | P3       | Proposed |
| 235 | `c2-flip-card`        | Card with a front and back that turns on press; flashcards, card details                            | Quizlet, banking card details                                | —                                                                       | P3       | Proposed |
| 236 | `c2-scrolly`          | Scrollytelling: a sticky graphic and steps that fire as each enters view; horizontal pinned mode    | The New York Times, The Pudding, Apple product pages         | [Awwwards](https://www.awwwards.com/websites/)                          | P3       | Proposed |
| 237 | `c2-expanding-panels` | Row of media panels where the hovered or focused one widens                                         | Awwwards and Godly portfolio sites                           | [Awwwards](https://www.awwwards.com/websites/)                          | P3       | Proposed |
| 238 | `c2-infinite-canvas`  | Draggable endless grid of media with inertia and lazy loading                                       | Godly and Awwwards portfolio sites                           | [Awwwards](https://www.awwwards.com/websites/)                          | P3       | Proposed |

### Extend instead of adding

These came up in the same research, but an existing component covers most of each one. They belong in that component's next change, not in a new package:

- `c2-button`: a success and an error state after `running`, so the button can go idle → loading → ✓.
- `c2-text-field`: a floating-label variant.
- `c2-autocomplete`: multi-column result rows (Syncfusion multicolumn-combobox).
- `c2-questionnaire`: a matrix (Likert grid) question.
- `c2-stat`: a value that animates when it changes, built on `c2-rolling-number` (row 37).
- `c2-scroll-area` (row 64): edge fade and progressive blur (Magic UI progressive-blur, HeroUI scroll-shadow).
- `c2-angle-slider` (row 20): an arc or knob mode for thermostats and volume.
- `c2-tabs` and `c2-chip-group`: scroll buttons when the row overflows (Airbnb's category bar).
- `c2-modal`: a full-screen mode (Mobbin's full-screen overlay).
- `c2-bottom-sheet` (row 77): an action-sheet preset (actions, destructive action, cancel).
- `c2-map-chart`: a dotted world-map preset with pulsing points, a Dribbble dashboard staple.

### Example apps to build next

The eight apps in `apps/examples` cover HTML, React, Vue, Angular, SvelteKit and Next.js, but every one is a desktop business tool. Each app below adds a framework or a form factor that is not covered yet, and it exercises the rows above. Under the dogfooding rule, that is what proves each row ready to ship.

| App                     | Framework              | New ground                        | Exercises                                                                                                          |
| ----------------------- | ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Mobile wallet           | Lit + Vite (PWA)       | First mobile app, first Lit app   | `c2-payment-card`, `c2-amount-keypad`, `c2-passcode`, `c2-fx-converter`, `c2-iban-input`, `c2-bottom-sheet`        |
| Storefront and checkout | Nuxt (SSR)             | Server-rendered Vue, commerce     | `c2-product-gallery`, `c2-swatch-picker`, `c2-price`, `c2-rating-summary`, `c2-address-field`, `c2-cookie-consent` |
| Travel booking          | React Router 7 (SSR)   | Hydration of a React SSR app      | `c2-histogram-slider`, `c2-quantity-picker`, `c2-seat-map`, `c2-ticket`, `c2-date-strip`, `@c2n/google-map`        |
| Fitness tracker         | SolidJS (PWA)          | Solid, touch-first inputs         | `c2-radial-bar-chart`, `c2-wheel-picker`, `c2-date-strip`, `c2-streak`, `c2-celebration`                           |
| Product analytics       | Qwik                   | Resumability, heavy data          | `c2-pivot-table`, `c2-cohort-table`, `c2-chart-builder`, `c2-filter-builder`, `c2-sankey-chart`                    |
| AI agent workspace      | Next.js                | Streaming agent UI                | `c2-reasoning`, `c2-agent-plan`, `c2-tool-call`, `c2-model-picker`, `c2-context-meter`, `c2-document-tabs`         |
| Team admin console      | Angular                | Settings and permissions          | `c2-workspace-switcher`, `c2-permission-matrix`, `c2-timezone-select`, `c2-country-select`, `c2-secret-field`      |
| Marketing site          | Astro (islands)        | Static site, motion budget        | `c2-text-effect`, `c2-backdrop`, `c2-globe`, `c2-orbit`, `c2-beam`, `c2-device-frame`, `c2-marquee`                |
| Messaging app           | Svelte 5 (Vite, SPA)   | Mobile chat                       | `c2-voice-message`, `c2-link-preview`, `c2-spoiler`, `c2-share-sheet`, `c2-story-progress`                         |
| Smart home dashboard    | Preact                 | Preact, tablet layout             | `c2-control-tile`, `c2-radial-bar-chart`, `c2-angle-slider`, `c2-activity-feed`, `c2-date-strip`                   |
| Data story              | Eleventy (static HTML) | Long-form editorial, no framework | `c2-scrolly`, `c2-quote`, `c2-bar-list`, `c2-delta-bar`, `c2-map-chart`                                            |

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
