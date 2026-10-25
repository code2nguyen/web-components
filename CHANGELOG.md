# Changelog

All `@c2n/*` packages are versioned together. This file is generated from the commit history by
`npm run changelog` — do not edit it by hand.

## [1.0.17](https://github.com/code2nguyen/web-components/releases/tag/v1.0.17) — 2026-10-25

### Breaking changes

- **mermaid:** Make mermaid an optional peer dependency ([f2f741d](https://github.com/code2nguyen/web-components/commit/f2f741d))

### Features

- **sticky:** Add c2-sticky and share stuck detection with c2-header ([2f11f4f](https://github.com/code2nguyen/web-components/commit/2f11f4f))
- **notepad, page-editor:** A web image pasted from another page is copied through imageUpload, or keeps its address when the site refuses ([18b9a19](https://github.com/code2nguyen/web-components/commit/18b9a19))
- **list:** Swipe rows only with the opt-in swipeable attribute ([6796ba4](https://github.com/code2nguyen/web-components/commit/6796ba4))
- **menubar:** Add c2-menubar and c2-menubar-menu ([461fbe9](https://github.com/code2nguyen/web-components/commit/461fbe9))
- **swipe-action:** Keyboard shortcuts for actions, and swipe rows in a c2-list ([9934148](https://github.com/code2nguyen/web-components/commit/9934148))
- **float-button:** Add c2-float-button, a floating action button with a speed dial ([16dc67c](https://github.com/code2nguyen/web-components/commit/16dc67c))
- **master-detail:** Add c2-master-detail ([c598bf9](https://github.com/code2nguyen/web-components/commit/c598bf9))
- **overflow-list:** Add c2-overflow-list, a row that folds what does not fit into a More menu ([e311172](https://github.com/code2nguyen/web-components/commit/e311172))
- **swipe-action:** Add c2-swipe-action, a list row that swipes to reveal actions ([ba25011](https://github.com/code2nguyen/web-components/commit/ba25011))
- **table-of-contents:** Add c2-table-of-contents ([ad10dab](https://github.com/code2nguyen/web-components/commit/ad10dab))
- **bottom-nav:** Add c2-bottom-nav, the mobile tab bar ([4bebaae](https://github.com/code2nguyen/web-components/commit/4bebaae))
- **save-bar:** Add c2-save-bar for unsaved form changes ([e51666d](https://github.com/code2nguyen/web-components/commit/e51666d))
- **app-shell:** Add c2-app-shell, c2-app-shell-toggle and c2-page-header ([c203eb1](https://github.com/code2nguyen/web-components/commit/c203eb1))
- **sheet:** Add swipe-close and content-sized sheets ([1704b8c](https://github.com/code2nguyen/web-components/commit/1704b8c))
- **chart:** Add c2-sankey-chart, flows between stages ([918804f](https://github.com/code2nguyen/web-components/commit/918804f))
- **rich-text-editor:** Add c2-rich-text-editor, a compact formatted-text field ([81992ec](https://github.com/code2nguyen/web-components/commit/81992ec))
- **chart:** Add c2-depth-chart, cumulative order-book depth around the mid price ([bd6cd99](https://github.com/code2nguyen/web-components/commit/bd6cd99))
- **countdown:** Add c2-countdown ([98847f9](https://github.com/code2nguyen/web-components/commit/98847f9))
- **org-chart:** Add c2-org-chart, a hierarchy drawn as connected cards ([49d6ebe](https://github.com/code2nguyen/web-components/commit/49d6ebe))
- **status-light:** Add c2-status-light ([65ba1ab](https://github.com/code2nguyen/web-components/commit/65ba1ab))

### Fixes

- **sticky:** Track scrollers rendered late, body scrollers and content growth ([66cc51e](https://github.com/code2nguyen/web-components/commit/66cc51e))
- **app-shell:** A navigationOpened set before the first measurement wins over the side default ([4a8ecff](https://github.com/code2nguyen/web-components/commit/4a8ecff))
- **swipe-action:** Measure flick speed over the last 100ms, and keep the CDP touch test to Chromium ([caf21af](https://github.com/code2nguyen/web-components/commit/caf21af))
- **page-header:** Defer resize work a frame and render the derived parent link only without a slotted one ([3f68600](https://github.com/code2nguyen/web-components/commit/3f68600))
- **overflow-list:** Settle in a declarative shadow root and copy wrapped icons ([80f9f85](https://github.com/code2nguyen/web-components/commit/80f9f85))
- **menu:** Read a deferred-hydration shadow root in connectedCallback ([817a506](https://github.com/code2nguyen/web-components/commit/817a506))
- **swipe-action:** Address code review findings ([32d4f2a](https://github.com/code2nguyen/web-components/commit/32d4f2a))
- **menubar:** Keyboard into a hovered menu, one tab stop after SSR and disabled changes ([18902e5](https://github.com/code2nguyen/web-components/commit/18902e5))
- **table-of-contents:** Tolerate whole-pixel scrolling in WebKit ([22a6c75](https://github.com/code2nguyen/web-components/commit/22a6c75))
- **page-header:** Fill the width, refold on late upgrades, docs screenshots pass ([679fbf3](https://github.com/code2nguyen/web-components/commit/679fbf3))
- **master-detail:** Address review findings ([2d788ea](https://github.com/code2nguyen/web-components/commit/2d788ea))
- **list:** Find a row's c2-list-item inside wrappers, past whitespace and nested wrappers ([f05ae0f](https://github.com/code2nguyen/web-components/commit/f05ae0f))
- **bottom-nav:** Find items inside wrapper elements and fill the bar's width ([fafa7e8](https://github.com/code2nguyen/web-components/commit/fafa7e8))
- **menu:** Skip the trigger lookup while server rendering ([0a49c15](https://github.com/code2nguyen/web-components/commit/0a49c15))
- **app-shell:** Address review of the shell and page header ([faa839d](https://github.com/code2nguyen/web-components/commit/faa839d))
- **save-bar:** Keep the message at the start of a full-width bar and Save solid while saving ([74632dd](https://github.com/code2nguyen/web-components/commit/74632dd))
- **sheet:** Tighten swipe-close grab area, flick and handle placement ([50c3cfc](https://github.com/code2nguyen/web-components/commit/50c3cfc))
- **chart:** Keep sankey outside labels inside the plot ([89d8bc3](https://github.com/code2nguyen/web-components/commit/89d8bc3))
- **chart:** Draw the depth chart's mid label inside its pill, in both themes ([a3e1b97](https://github.com/code2nguyen/web-components/commit/a3e1b97))
- **page-editor, rich-text-editor:** Refuse links that browsers read as javascript: ([7fa1799](https://github.com/code2nguyen/web-components/commit/7fa1799))
- **chart:** Address review findings on c2-sankey-chart ([e6224e2](https://github.com/code2nguyen/web-components/commit/e6224e2))
- **chart:** Address depth chart review findings ([22180af](https://github.com/code2nguyen/web-components/commit/22180af))
- **rich-text-editor:** Keep the linked text highlighted while the link popover is open ([284e811](https://github.com/code2nguyen/web-components/commit/284e811))
- **rich-text-editor:** Describe its parts' slots and cover it in the FormData suite ([078de5b](https://github.com/code2nguyen/web-components/commit/078de5b))
- **rich-text-editor:** Document attributes and slots, add its dependencies to the lockfile ([6298a93](https://github.com/code2nguyen/web-components/commit/6298a93))
- **status-light:** Keep the pulse ring and icon dot right in every state ([f65f438](https://github.com/code2nguyen/web-components/commit/f65f438))
- **mermaid:** Keep the loader's error when mermaid cannot be loaded ([539eafe](https://github.com/code2nguyen/web-components/commit/539eafe))
- **table:** Isolate the grid viewport rather than the host ([c5e5901](https://github.com/code2nguyen/web-components/commit/c5e5901))
- **table:** Keep pinned and sticky cells' stacking inside the table ([56e92ce](https://github.com/code2nguyen/web-components/commit/56e92ce))

### Performance

- **chart:** Keep the depth chart's messages out of the shared chunk ([84493b3](https://github.com/code2nguyen/web-components/commit/84493b3))
- **components:** Write the merged custom-elements.json without indentation ([c380723](https://github.com/code2nguyen/web-components/commit/c380723))

### Docs site & examples

- **examples:** Make Log Lens tabs and shortcuts respond after a file loads ([9b3b541](https://github.com/code2nguyen/web-components/commit/9b3b541))

## [1.0.16](https://github.com/code2nguyen/web-components/releases/tag/v1.0.16) — 2026-10-23

### Features

- **sheet:** Style the body's scrollbar through CSS variables ([ae63bcc](https://github.com/code2nguyen/web-components/commit/ae63bcc))
- **page-editor, notepad:** Paste, drop, copy and resize images ([ef0edcb](https://github.com/code2nguyen/web-components/commit/ef0edcb))
- **split-panel:** Style the panels' scrollbars through CSS variables ([39010c0](https://github.com/code2nguyen/web-components/commit/39010c0))

### Fixes

- **flow:** A node being dragged shows the closed hand ([dd1a939](https://github.com/code2nguyen/web-components/commit/dd1a939))
- **page-editor:** A table's frame and outline end with its last column ([e98a300](https://github.com/code2nguyen/web-components/commit/e98a300))
- **page-editor, notepad:** Images pasted, copied and resized hold up across apps and edits ([2298461](https://github.com/code2nguyen/web-components/commit/2298461))
- **flow:** A node shows the default cursor, not the pointer, over its title and rows ([85071e9](https://github.com/code2nguyen/web-components/commit/85071e9))
- **action-bar:** No scrollbar on a container the content just fills, open or closed ([74b73f3](https://github.com/code2nguyen/web-components/commit/74b73f3))

## [1.0.15](https://github.com/code2nguyen/web-components/releases/tag/v1.0.15) — 2026-10-23

### Breaking changes

- **mask-input:** Search only the group choices when fitting a mask ([33f0a38](https://github.com/code2nguyen/web-components/commit/33f0a38))

### Features

- **search-field:** Escape="none" leaves Escape to the container ([fc7dfb6](https://github.com/code2nguyen/web-components/commit/fc7dfb6))
- **tree-select:** Add c2-tree-select, a form-associated dropdown over c2-tree ([336b902](https://github.com/code2nguyen/web-components/commit/336b902))
- **log-viewer:** Add a keyboard active entry and entry-activate ([9393fad](https://github.com/code2nguyen/web-components/commit/9393fad))
- **tour:** Skip-delay waits before a skipped tour autostarts again ([bada9cd](https://github.com/code2nguyen/web-components/commit/bada9cd))
- **tour:** Skip-limit sets how many skips turn autostart off ([eaf0eb7](https://github.com/code2nguyen/web-components/commit/eaf0eb7))
- **tour:** Remember progress in localStorage, autostart and a Skip button ([0b40df5](https://github.com/code2nguyen/web-components/commit/0b40df5))
- **image-cropper:** Add c2-image-cropper ([bbbd1f6](https://github.com/code2nguyen/web-components/commit/bbbd1f6))
- **tour:** Add c2-tour guided product tour ([f63ea8d](https://github.com/code2nguyen/web-components/commit/f63ea8d))
- **log-viewer:** Keyboard active entry with entry-activate, and Ctrl/Command+F find ([c44a50b](https://github.com/code2nguyen/web-components/commit/c44a50b))
- **time-range-picker:** Add c2-time-range-picker ([27cc778](https://github.com/code2nguyen/web-components/commit/27cc778))
- **split-button:** Add c2-split-button, a main action with a caret menu of alternatives ([93f243a](https://github.com/code2nguyen/web-components/commit/93f243a))
- **menu:** Let a split button mark rows as choices without writing their attributes ([fb533ed](https://github.com/code2nguyen/web-components/commit/fb533ed))
- **chart:** Add annotations, markers at an x value and shaded x ranges ([a0e8ea4](https://github.com/code2nguyen/web-components/commit/a0e8ea4))
- **button, link-button:** Add selected states for the new shadow and border variables ([0cdbb34](https://github.com/code2nguyen/web-components/commit/0cdbb34))
- **link-button:** Add --c2-link-button__container--border and its hover state ([fdcab5f](https://github.com/code2nguyen/web-components/commit/fdcab5f))
- **button:** Add --c2-button__container--box-shadow and its hover state ([f67e8e1](https://github.com/code2nguyen/web-components/commit/f67e8e1))
- **log-viewer:** Add scrollToStart() and an entry-click event ([0a5060a](https://github.com/code2nguyen/web-components/commit/0a5060a))
- **mask-input:** Add optional groups anywhere in a mask ([73c085a](https://github.com/code2nguyen/web-components/commit/73c085a))

### Fixes

- **chart:** Skip filtered ticks when sizing a value axis ([9e0e190](https://github.com/code2nguyen/web-components/commit/9e0e190))
- **gantt:** Cap beside-labels at their side's room, and pick the roomier side ([845e00c](https://github.com/code2nguyen/web-components/commit/845e00c))
- **search-field:** Escape that closes the recent searches does not reach the container ([aec537b](https://github.com/code2nguyen/web-components/commit/aec537b))
- **core:** A blank string assigned to a Number property unsets it ([a799cb5](https://github.com/code2nguyen/web-components/commit/a799cb5))
- **tree-select:** Address review findings ([1398fa5](https://github.com/code2nguyen/web-components/commit/1398fa5))
- **kanban:** Keep an empty lane's hint under its header ([7401528](https://github.com/code2nguyen/web-components/commit/7401528))
- **gantt:** Keep labels beside short bars inside the timeline ([b4bbf24](https://github.com/code2nguyen/web-components/commit/b4bbf24))
- **chart:** Size value axes to their widest label, warn when the plot collapses ([214846b](https://github.com/code2nguyen/web-components/commit/214846b))
- **core:** Parse a numeric string assigned to a Number property ([07ef5f4](https://github.com/code2nguyen/web-components/commit/07ef5f4))
- **tour:** Code-review findings ([6c237b9](https://github.com/code2nguyen/web-components/commit/6c237b9))
- **log-viewer:** Leave the copy area selectable, as before ([237c91f](https://github.com/code2nguyen/web-components/commit/237c91f))
- **log-viewer:** Cross-browser keyboard, selection and copy-cell fixes ([8c7d89e](https://github.com/code2nguyen/web-components/commit/8c7d89e))
- **image-cropper:** Cancel interrupted drags, fit authored crops to aspect-ratio ([c658b60](https://github.com/code2nguyen/web-components/commit/c658b60))
- **image-cropper:** No focus ring on the selection after a pointer drag ([e93951b](https://github.com/code2nguyen/web-components/commit/e93951b))
- **log-viewer:** Address review findings on keyboard and find ([f76aaff](https://github.com/code2nguyen/web-components/commit/f76aaff))
- **time-range-picker:** Centre the zoom icon and shorten same-day labels ([2df9ba3](https://github.com/code2nguyen/web-components/commit/2df9ba3))
- **chart:** Address review findings on annotations ([c1fdca5](https://github.com/code2nguyen/web-components/commit/c1fdca5))
- **split-button:** Address code review findings ([0f674c1](https://github.com/code2nguyen/web-components/commit/0f674c1))
- **log-viewer:** Keep scrollToStart() instant and pinned, ignore drag clicks ([f196699](https://github.com/code2nguyen/web-components/commit/f196699))
- **button-group:** Keep app-wide button shadows off segmented items ([74c3dc2](https://github.com/code2nguyen/web-components/commit/74c3dc2))
- **theme:** Keep color-scheme outside the theme layer ([90ea833](https://github.com/code2nguyen/web-components/commit/90ea833))
- **theme:** Ship tokens.css and base.css in the c2n-theme cascade layer ([ae2e2ae](https://github.com/code2nguyen/web-components/commit/ae2e2ae))
- **action-bar:** Stack the count above the actions on a phone ([6163d17](https://github.com/code2nguyen/web-components/commit/6163d17))
- **action-bar:** Keep the actions on one line on narrow screens ([0e5dca1](https://github.com/code2nguyen/web-components/commit/0e5dca1))

### Performance

- **tree-select:** Skip the host's own value attribute in the row observer, build the row index once per render ([6aa21ea](https://github.com/code2nguyen/web-components/commit/6aa21ea))

### Improvements

- Revert "feat(log-viewer): add a keyboard active entry and entry-activate" ([943cb70](https://github.com/code2nguyen/web-components/commit/943cb70))

### Docs site & examples

- **ui:** Swiss cross logo built from the four brand-colour parts ([7e1baac](https://github.com/code2nguyen/web-components/commit/7e1baac))
- **examples:** Close workbench code-review findings ([3603d4a](https://github.com/code2nguyen/web-components/commit/3603d4a))
- **examples:** Visual pass on the close workbench against the mockups ([2a9e52f](https://github.com/code2nguyen/web-components/commit/2a9e52f))
- **examples:** Carry the close workbench mockups into the SvelteKit app ([5573d37](https://github.com/code2nguyen/web-components/commit/5573d37))
- **examples:** Address code review findings on the Angular orders admin ([67a9f74](https://github.com/code2nguyen/web-components/commit/67a9f74))
- **examples:** Add a SvelteKit month-end close workbench ([df462f5](https://github.com/code2nguyen/web-components/commit/df462f5))
- **examples:** Address code review findings on the Vue support inbox ([19ed825](https://github.com/code2nguyen/web-components/commit/19ed825))
- **examples:** Address code review findings on the React trading dashboard ([560d58d](https://github.com/code2nguyen/web-components/commit/560d58d))
- **examples:** Relative times, highlighted search and a validated reply in the Vue support inbox ([c6d799d](https://github.com/code2nguyen/web-components/commit/c6d799d))
- **examples:** Order ticket, action bar and formatted totals in the React trading dashboard ([36b9024](https://github.com/code2nguyen/web-components/commit/36b9024))
- **examples:** Display popover and split-button bulk actions in the Angular orders admin ([e3f05e6](https://github.com/code2nguyen/web-components/commit/e3f05e6))

## [1.0.14](https://github.com/code2nguyen/web-components/releases/tag/v1.0.14) — 2026-10-21

### Features

- **chart:** Add c2-chord-chart, flows between groups around a circle ([82da00f](https://github.com/code2nguyen/web-components/commit/82da00f))
- **skip-link:** Add c2-skip-link, a "Skip to main content" link ([4212ef4](https://github.com/code2nguyen/web-components/commit/4212ef4))
- **table:** Focus() moves focus to the roving cell ([2b1960e](https://github.com/code2nguyen/web-components/commit/2b1960e))
- **action-bar:** Add c2-action-bar, a floating bar for the current selection ([0cd87d5](https://github.com/code2nguyen/web-components/commit/0cd87d5))
- **view-options:** Add c2-view-options, the Display popover of a collection ([c94932c](https://github.com/code2nguyen/web-components/commit/c94932c))

### Fixes

- **skip-link:** Address code review findings ([bc30804](https://github.com/code2nguyen/web-components/commit/bc30804))
- **table:** Focus() waits only before the first render, and keeps its options ([ee48bb8](https://github.com/code2nguyen/web-components/commit/ee48bb8))
- **view-options:** Do not query the light DOM while server rendering ([d5b1368](https://github.com/code2nguyen/web-components/commit/d5b1368))
- **select:** Pick an option from the keyboard and return focus to the trigger ([749738d](https://github.com/code2nguyen/web-components/commit/749738d))
- **view-options:** Render the Display button beside the trigger slot, not as its fallback ([e2c72e5](https://github.com/code2nguyen/web-components/commit/e2c72e5))
- **view-options:** Leave the Display button out when a trigger is slotted ([9b0dfc7](https://github.com/code2nguyen/web-components/commit/9b0dfc7))
- **view-options:** Cap the panel height, stack the ordering levels and outline secondary buttons ([4a92b80](https://github.com/code2nguyen/web-components/commit/4a92b80))
- **view-options:** Address review findings ([61a1090](https://github.com/code2nguyen/web-components/commit/61a1090))
- **view-options:** Read wrapped and server-rendered children; fix the docs imports ([add168f](https://github.com/code2nguyen/web-components/commit/add168f))

## [1.0.13](https://github.com/code2nguyen/web-components/releases/tag/v1.0.13) — 2026-10-19

### Features

- **flow:** Reorder rows by drag and drop in editable flows ([a205444](https://github.com/code2nguyen/web-components/commit/a205444))
- **chart:** Hide the heatmap key's text line by line, or draw the cells alone ([1d51e63](https://github.com/code2nguyen/web-components/commit/1d51e63))
- **flow:** Fold rows past a row limit into a "+ N more" row ([c94b3f2](https://github.com/code2nguyen/web-components/commit/c94b3f2))
- **chart:** Stand the heatmap's colour key upright beside the plot ([e76298b](https://github.com/code2nguyen/web-components/commit/e76298b))
- **chart:** Add c2-heatmap-chart, a heatmap on any two keys or a calendar ([f511824](https://github.com/code2nguyen/web-components/commit/f511824))
- **flow:** Rows with ports and crow's-foot edge ends for schema diagrams ([b069bb6](https://github.com/code2nguyen/web-components/commit/b069bb6))

### Fixes

- **flow:** Address review findings on rows, ports and reordering ([877110c](https://github.com/code2nguyen/web-components/commit/877110c))
- **chart:** Heatmap review fixes: wall-clock times, stale focus, grouped listed rows ([3679a6a](https://github.com/code2nguyen/web-components/commit/3679a6a))
- **flow:** Route row edges round other nodes, and theme the row lines ([1e1a75d](https://github.com/code2nguyen/web-components/commit/1e1a75d))

## [1.0.12](https://github.com/code2nguyen/web-components/releases/tag/v1.0.12) — 2026-10-19

### Features

- **spreadsheet:** A right-click menu of its own, and a selection hidden on blur ([c601772](https://github.com/code2nguyen/web-components/commit/c601772))
- **page-editor:** Tables, built on c2-spreadsheet ([0d03a65](https://github.com/code2nguyen/web-components/commit/0d03a65))
- **spreadsheet:** Column names, cell styles, formula help and quick totals ([f989c94](https://github.com/code2nguyen/web-components/commit/f989c94))
- **json-form:** Publish c2-json-form in @c2n/components with docs and gallery ([7f47b3e](https://github.com/code2nguyen/web-components/commit/7f47b3e))
- **json-form:** Rebuild on JSON Schema with UI-schema layouts, markup fields and renderers ([316b518](https://github.com/code2nguyen/web-components/commit/316b518))
- **fieldset:** Add c2-fieldset ([d4fa97d](https://github.com/code2nguyen/web-components/commit/d4fa97d))
- **form:** Add c2-form with submit validation, an error summary and dirty tracking ([c87c557](https://github.com/code2nguyen/web-components/commit/c87c557))
- **form-field:** Add c2-form-field, a label, hint and error wrapper for any control ([f731908](https://github.com/code2nguyen/web-components/commit/f731908))
- **relative-time:** Add min-unit to stop counting below a unit ([db8914d](https://github.com/code2nguyen/web-components/commit/db8914d))

### Fixes

- **page-editor:** A web page's lines pasted as one paragraph become blocks of their own ([6c334b0](https://github.com/code2nguyen/web-components/commit/6c334b0))
- **page-editor:** A table hides its selection through the sheet's hide-selection-on-blur ([8ddec0a](https://github.com/code2nguyen/web-components/commit/8ddec0a))
- **page-editor:** Type the test's editor by its value, so test:type-check passes ([3c59936](https://github.com/code2nguyen/web-components/commit/3c59936))
- **json-form:** Leave a nested object absent when no default fills it ([d47a49c](https://github.com/code2nguyen/web-components/commit/d47a49c))
- **json-form:** Connect fields parsed before the form, and polish the layout ([ec86ddc](https://github.com/code2nguyen/web-components/commit/ec86ddc))
- **button-group:** Move the role onto an inner wrapper while a form field wraps the group ([f9cf120](https://github.com/code2nguyen/web-components/commit/f9cf120))
- **button-group:** Describe the group by text as well as by reference ([37ad2ac](https://github.com/code2nguyen/web-components/commit/37ad2ac))

### Docs site & examples

- **ui:** Reveal gallery previews per card instead of after every module loads ([3f705e5](https://github.com/code2nguyen/web-components/commit/3f705e5))

## [1.0.11](https://github.com/code2nguyen/web-components/releases/tag/v1.0.11) — 2026-10-17

### Fixes

- **components:** Reflect name on form-associated elements ([e4c61a9](https://github.com/code2nguyen/web-components/commit/e4c61a9))

## [1.0.10](https://github.com/code2nguyen/web-components/releases/tag/v1.0.10) — 2026-10-17

### Features

- **diff-viewer:** Add c2-diff-viewer, a read-only line diff of two texts ([21867d1](https://github.com/code2nguyen/web-components/commit/21867d1))
- **spreadsheet:** Delete rows and columns, and answer c2-context-menu ([b882856](https://github.com/code2nguyen/web-components/commit/b882856))
- **spreadsheet:** Insert rows and columns, and grow the sheet on paste ([71c86d7](https://github.com/code2nguyen/web-components/commit/71c86d7))
- **spreadsheet:** Resize columns by dragging the header edge ([10936be](https://github.com/code2nguyen/web-components/commit/10936be))
- **format-date:** Add c2-format-date ([c9d1cbc](https://github.com/code2nguyen/web-components/commit/c9d1cbc))
- **format-number:** Add c2-format-number for locale number, currency, percent, compact and byte formatting ([9f84219](https://github.com/code2nguyen/web-components/commit/9f84219))
- **highlight:** Add c2-highlight to mark the parts of a text that match a query ([9efb47d](https://github.com/code2nguyen/web-components/commit/9efb47d))
- **mask-input:** Add c2-mask-input for pattern masks (IBAN, tax ID, postcode) ([49d611d](https://github.com/code2nguyen/web-components/commit/49d611d))
- **date-time-picker:** Add c2-date-time-picker with calendar, time and time zone ([6ba7975](https://github.com/code2nguyen/web-components/commit/6ba7975))
- **money-input:** Add c2-money-input, a currency amount field that stores minor units ([04ca971](https://github.com/code2nguyen/web-components/commit/04ca971))

### Fixes

- **mask-input:** Fire change on blur and Enter in Firefox too ([0ac1dba](https://github.com/code2nguyen/web-components/commit/0ac1dba))
- **highlight:** Match the server-rendered slot on the first hydrated render ([76606ea](https://github.com/code2nguyen/web-components/commit/76606ea))

### Docs site & examples

- **ui:** Fit the date-time-picker gallery cards in two columns ([2d60918](https://github.com/code2nguyen/web-components/commit/2d60918))

## [1.0.9](https://github.com/code2nguyen/web-components/releases/tag/v1.0.9) — 2026-10-14

### Features

- Localize built-in text, float the to-do list's customize panel, give the page editor Notion's look ([61bfe13](https://github.com/code2nguyen/web-components/commit/61bfe13))
- **spreadsheet:** Add c2-spreadsheet, a small editable grid with basic formulas ([9493378](https://github.com/code2nguyen/web-components/commit/9493378))

### Fixes

- **spreadsheet:** Fit gallery and docs examples, draw the focus ring around the frame ([8c11e17](https://github.com/code2nguyen/web-components/commit/8c11e17))

### Docs site & examples

- **docs:** Give c2-modal's open its description back; the built-in text is English ([c4c9e4b](https://github.com/code2nguyen/web-components/commit/c4c9e4b))

## [1.0.8](https://github.com/code2nguyen/web-components/releases/tag/v1.0.8) — 2026-10-10

### Features

- **markdown:** Add c2-markdown, a safe markdown renderer that streams ([7af032a](https://github.com/code2nguyen/web-components/commit/7af032a))
- **mermaid:** Add c2-mermaid, themed and sandboxed Mermaid diagrams ([7dc060e](https://github.com/code2nguyen/web-components/commit/7dc060e))
- **math:** Add c2-math, TeX rendered as native MathML with Temml ([cc28f16](https://github.com/code2nguyen/web-components/commit/cc28f16))
- **image:** Add c2-image with placeholder, fallback, click-to-load and preview ([2e6cd8e](https://github.com/code2nguyen/web-components/commit/2e6cd8e))
- **streaming-text:** Add c2-streaming-text and the shared stream-reveal controller ([13de7cc](https://github.com/code2nguyen/web-components/commit/13de7cc))
- **query-input:** Add a key-less field offered after a bare colon ([41213cf](https://github.com/code2nguyen/web-components/commit/41213cf))

### Fixes

- **image:** Name the host of an absolute URL only, so a server-rendered click-to-load image hydrates ([d03335d](https://github.com/code2nguyen/web-components/commit/d03335d))
- **phone-input:** Keep the page from scrolling when the country picker opens ([badc0cd](https://github.com/code2nguyen/web-components/commit/badc0cd))
- **umbrella:** Stop checking the index entry against a fixed size budget ([5a58d00](https://github.com/code2nguyen/web-components/commit/5a58d00))

### Docs site & examples

- **ui:** Load the streaming-text and markdown demo scripts on their docs pages ([8590347](https://github.com/code2nguyen/web-components/commit/8590347))
- **ui:** Keep the GitHub link in the header on small screens ([8b14cba](https://github.com/code2nguyen/web-components/commit/8b14cba))

## [1.0.7](https://github.com/code2nguyen/web-components/releases/tag/v1.0.7) — 2026-10-09

### Features

- **flow:** Edges attach to the side of a node they were drawn from ([714a307](https://github.com/code2nguyen/web-components/commit/714a307))
- **flow:** Fit-min-zoom keeps a fitted flow readable ([80663e7](https://github.com/code2nguyen/web-components/commit/80663e7))
- **masonry:** Min-rows and min-cols bound how small a user can resize a tile ([a76ec6c](https://github.com/code2nguyen/web-components/commit/a76ec6c))
- **query-input:** Show key:value filters as c2-chip elements that switch off and on or are removed ([6ae81ab](https://github.com/code2nguyen/web-components/commit/6ae81ab))
- **phone-input:** Add --c2-phone-input__country--display to hide the country prefix ([bf5cf93](https://github.com/code2nguyen/web-components/commit/bf5cf93))
- **state-timeline:** Quiet baseline, row summaries and a shared time line ([8422ffa](https://github.com/code2nguyen/web-components/commit/8422ffa))
- **popconfirm:** Style c2-popconfirm as a tooltip bubble with an arrow ([55579b6](https://github.com/code2nguyen/web-components/commit/55579b6))
- **key-value-editor:** Add view mode and locked keys ([6395686](https://github.com/code2nguyen/web-components/commit/6395686))
- **query-input:** Draw key:value terms as chips; reopen suggestions when the caret moves ([655efd7](https://github.com/code2nguyen/web-components/commit/655efd7))
- **phone-input:** A single allowed country is a fixed prefix with no picker ([76324c7](https://github.com/code2nguyen/web-components/commit/76324c7))
- **confirm-dialog:** Add c2-confirm-dialog with a promise-based confirm() ([7e2a0d7](https://github.com/code2nguyen/web-components/commit/7e2a0d7))
- **state-timeline:** Add c2-state-timeline ([49a13a4](https://github.com/code2nguyen/web-components/commit/49a13a4))
- **popconfirm:** Add c2-popconfirm, an "Are you sure?" popup anchored to its trigger ([1f60cfd](https://github.com/code2nguyen/web-components/commit/1f60cfd))
- **query-input:** Add c2-query-input, a key:value query field with highlighting and suggestions ([fe7c0a5](https://github.com/code2nguyen/web-components/commit/fe7c0a5))
- **trace-waterfall:** Add c2-trace-waterfall, a span tree with offset duration bars on one time axis ([bcb8081](https://github.com/code2nguyen/web-components/commit/bcb8081))
- **key-value-editor:** Add c2-key-value-editor ([ef13328](https://github.com/code2nguyen/web-components/commit/ef13328))
- **phone-input:** Add c2-phone-input, a phone field with a country picker and an E.164 value ([ee63d69](https://github.com/code2nguyen/web-components/commit/ee63d69))
- **relative-time:** Add c2-relative-time ([24028dc](https://github.com/code2nguyen/web-components/commit/24028dc))
- **password-field:** Add c2-password-field, a password input with reveal toggle, strength meter and requirements checklist ([a90a06f](https://github.com/code2nguyen/web-components/commit/a90a06f))
- **checkbox:** Add c2-checkbox-group ([78b67b9](https://github.com/code2nguyen/web-components/commit/78b67b9))

### Fixes

- **flow:** Delete removes an edge selected by a click when focus was outside the flow ([d2a3e7a](https://github.com/code2nguyen/web-components/commit/d2a3e7a))
- **query-input:** Keep the icon and clear button in place while the chips wrap ([a425221](https://github.com/code2nguyen/web-components/commit/a425221))
- **trace-waterfall:** Fit narrow containers and keep every duration label readable ([d014f28](https://github.com/code2nguyen/web-components/commit/d014f28))
- **state-timeline:** Fill the container and drop labels from narrow segments ([7150ba2](https://github.com/code2nguyen/web-components/commit/7150ba2))
- **phone-input:** Fit narrow columns, rank name-prefix search matches first, darken the calling code ([63e3746](https://github.com/code2nguyen/web-components/commit/63e3746))

### Docs site & examples

- **ui:** Open the confirm-dialog examples by id, since each c2-* in an MDX fence is its own island ([8fea850](https://github.com/code2nguyen/web-components/commit/8fea850))
- **ui:** Alias the share-2 icon import as FeatherShare_2 in the todo-list docs ([0a69d86](https://github.com/code2nguyen/web-components/commit/0a69d86))

## [1.0.6](https://github.com/code2nguyen/web-components/releases/tag/v1.0.6) — 2026-10-08

### Features

- **todo-list:** Editable heading and actions-placement ([f0c979a](https://github.com/code2nguyen/web-components/commit/f0c979a))
- **filter-builder:** Add c2-filter-builder ([4087141](https://github.com/code2nguyen/web-components/commit/4087141))
- **description-list:** Bold column names that can be restyled or removed ([7b7b942](https://github.com/code2nguyen/web-components/commit/7b7b942))
- **truncate:** Add c2-truncate, text clamped to N lines with a Show more button ([a26ebca](https://github.com/code2nguyen/web-components/commit/a26ebca))
- **description-list:** Several values per label, aligned in columns that stack on small screens ([da431fd](https://github.com/code2nguyen/web-components/commit/da431fd))
- **chip-group:** Add c2-chip-group, a row of chips or badges that collapses overflow into +N ([ca766ce](https://github.com/code2nguyen/web-components/commit/ca766ce))
- **chip:** Add c2-chip-part for chips made of interactive segments ([6bfc0ad](https://github.com/code2nguyen/web-components/commit/6bfc0ad))
- **json-viewer:** Add c2-json-viewer, a collapsible, searchable JSON tree with copy-path ([4d63d3c](https://github.com/code2nguyen/web-components/commit/4d63d3c))
- **description-list:** Add c2-description-list, read-only label and value pairs for detail pages ([a183ea2](https://github.com/code2nguyen/web-components/commit/a183ea2))

### Fixes

- **autocomplete:** Fill the input with the row's label, not its index, when there is no item-key ([3b7b916](https://github.com/code2nguyen/web-components/commit/3b7b916))
- **autocomplete:** Hide the header and footer only when the list would drop below its minimum ([88a7097](https://github.com/code2nguyen/web-components/commit/88a7097))
- **autocomplete:** Hide the header and footer when the panel has little room ([a4578c3](https://github.com/code2nguyen/web-components/commit/a4578c3))
- **json-viewer:** Address review findings and Firefox failures ([748fc36](https://github.com/code2nguyen/web-components/commit/748fc36))
- **table:** Give flexible columns a minimum width ([955d886](https://github.com/code2nguyen/web-components/commit/955d886))
- **chip-group:** Register chip and badge, and keep them direct children on the docs site ([3d951a2](https://github.com/code2nguyen/web-components/commit/3d951a2))
- **chip:** Keep framework comment markers out of the remove button name ([0675843](https://github.com/code2nguyen/web-components/commit/0675843))
- **description-list:** Render the empty dash the same on the server and the client ([6a70a91](https://github.com/code2nguyen/web-components/commit/6a70a91))
- **working-indicator:** Keep the glyph off iOS emoji and slow its frames ([5363090](https://github.com/code2nguyen/web-components/commit/5363090))

### Performance

- **json-viewer:** Render only the lines in view so large documents stay fast ([1109f8d](https://github.com/code2nguyen/web-components/commit/1109f8d))

### Docs site & examples

- **ui:** Show the autocomplete examples' selection below the field ([94ede91](https://github.com/code2nguyen/web-components/commit/94ede91))
- **ui:** Scope example styles by frame so tag-led selectors apply ([de420c3](https://github.com/code2nguyen/web-components/commit/de420c3))
- **ui:** Scope chip usage styles so the avatar prefix is sized ([129392b](https://github.com/code2nguyen/web-components/commit/129392b))
- **ui:** Remove a chip in the chip examples when its remove button is clicked ([2b6ea3b](https://github.com/code2nguyen/web-components/commit/2b6ea3b))

## [1.0.5](https://github.com/code2nguyen/web-components/releases/tag/v1.0.5) — 2026-10-07

### Features

- **flow:** A node's shape, its own colours and an icon ([d07b331](https://github.com/code2nguyen/web-components/commit/d07b331))
- **menu:** C2-menu-row, a line of small choices such as swatches, walked with the arrow keys ([46cc332](https://github.com/code2nguyen/web-components/commit/46cc332))
- Icon slots size Phosphor icons as they size Feather ones ([1081584](https://github.com/code2nguyen/web-components/commit/1081584))
- **toast:** Action-placement="end" puts the action in line with the message ([ffc5b31](https://github.com/code2nguyen/web-components/commit/ffc5b31))
- **masonry:** Pinned tiles stay first, an actions slot beside the move handle, and a move-handle element of the app's own ([7b763a9](https://github.com/code2nguyen/web-components/commit/7b763a9))
- **theme:** Cool navy dark palette and fainter notepad rules on dark paper ([e55dd48](https://github.com/code2nguyen/web-components/commit/e55dd48))
- **notepad:** Add actions-placement to put the actions slot after the Paper and Tear off buttons ([77e789c](https://github.com/code2nguyen/web-components/commit/77e789c))
- **masonry:** Resize columns and rows together from a tile's bottom-right corner ([491bc80](https://github.com/code2nguyen/web-components/commit/491bc80))

### Fixes

- **flow:** A drawn node's connection cue wins over its status colour, and its focus ring has its own variables ([71297f7](https://github.com/code2nguyen/web-components/commit/71297f7))
- Review follow-ups on details, toast, masonry and overlay ([14bec95](https://github.com/code2nguyen/web-components/commit/14bec95))
- **flow:** Diamond labels stay inside the shape, drawn shapes take the status colours and a focus ring on their outline, and edges meet a slanted node's sides ([b51b3ad](https://github.com/code2nguyen/web-components/commit/b51b3ad))
- **menu:** A menu that is one row steps through it, rows never wrap, the checked choice shows keyboard focus, and a moved or relabelled choice keeps its name ([c6e89dc](https://github.com/code2nguyen/web-components/commit/c6e89dc))
- **overlay:** Reposition on the next frame after the first placement, so a growing surface never loops its ResizeObserver ([acf26d2](https://github.com/code2nguyen/web-components/commit/acf26d2))
- **notepad:** The toolbar takes the paper's colour, and the caret stays the height of the writing ([80fd6f7](https://github.com/code2nguyen/web-components/commit/80fd6f7))
- **details:** Content that arrives while opening slides open without a jump ([fde69c7](https://github.com/code2nguyen/web-components/commit/fde69c7))

### Improvements

- **theme:** Restore the zinc dark palette ([e7bea59](https://github.com/code2nguyen/web-components/commit/e7bea59))

## [1.0.4](https://github.com/code2nguyen/web-components/releases/tag/v1.0.4) — 2026-10-06

### Features

- **indicator:** Add c2-indicator, a dot or count pinned to an edge of any element ([c510627](https://github.com/code2nguyen/web-components/commit/c510627))
- **chip:** Add c2-chip, a selectable and removable chip for filters and choices ([b6c13a1](https://github.com/code2nguyen/web-components/commit/b6c13a1))
- **search-field:** Add c2-search-field, a search box with debounce, clear, shortcut hint and recent searches ([723b679](https://github.com/code2nguyen/web-components/commit/723b679))

### Fixes

- **indicator:** Keep the pulse behind the text, hide invalid counts, dot on the server ([6efab77](https://github.com/code2nguyen/web-components/commit/6efab77))
- **list-item:** Recognise menu item checkbox/radio and input widget roles as row content ([862ff18](https://github.com/code2nguyen/web-components/commit/862ff18))
- **list-item:** Count nested component controls and keep keyboard activation in disabled rows ([9fb0d49](https://github.com/code2nguyen/web-components/commit/9fb0d49))
- **list-item:** Let controls inside a row keep their own click and key events ([3a92bb7](https://github.com/code2nguyen/web-components/commit/3a92bb7))
- **chip:** Keep the label text current and free of icon text, compose change ([9700da9](https://github.com/code2nguyen/web-components/commit/9700da9))
- **reorder-list:** Theme the list in dark mode ([ed008c9](https://github.com/code2nguyen/web-components/commit/ed008c9))
- **inline-edit, flow:** Resize the fallback field outside the ResizeObserver callback, test the middle placement on empty canvas ([9ea8665](https://github.com/code2nguyen/web-components/commit/9ea8665))
- **mcp:** Skip regex literals and JSX elements when masking comments in expressions ([ae7bbd8](https://github.com/code2nguyen/web-components/commit/ae7bbd8))
- **inline-edit, reorder-list:** Regrow the fallback field on width changes, keep focus when the focused item leaves the list ([3f3726a](https://github.com/code2nguyen/web-components/commit/3f3726a))
- **mcp:** Budget every JSON list, mask comments inside expressions, anchor c2n-ignore ranges, file new tags under their family ([9e7eaf5](https://github.com/code2nguyen/web-components/commit/9e7eaf5))
- **search-field:** Escape on the recent-searches Clear button closes the panel ([9c01cfa](https://github.com/code2nguyen/web-components/commit/9c01cfa))
- **search-field:** Address review: keyboard-reachable Clear, history-key switch, reset dedupe ([e9452ba](https://github.com/code2nguyen/web-components/commit/e9452ba))
- **components:** Tighten slot observers in breadcrumb and reorder-list, guard assignSlot, clamp the gantt tooltip ([70392fb](https://github.com/code2nguyen/web-components/commit/70392fb))
- **inline-edit:** Address release review: disabled form state, non-bubbling editor change, focus and multiline fallbacks ([3380f07](https://github.com/code2nguyen/web-components/commit/3380f07))
- **reorder-list:** Read slotted children safely while server rendering ([8ad28cd](https://github.com/code2nguyen/web-components/commit/8ad28cd))
- **mcp:** Address release review of validate_markup, installed-tag discovery and the skill installer ([8470830](https://github.com/code2nguyen/web-components/commit/8470830))
- **flow:** Forget the last focused node when focus leaves from the toolbar, and only the visible toolbar refuses a drop ([f849fc7](https://github.com/code2nguyen/web-components/commit/f849fc7))

### Docs site & examples

- **ui:** Mark the current example nav link with selected, give Discord its own header class and a footer link ([41e05e5](https://github.com/code2nguyen/web-components/commit/41e05e5))

## [1.0.3](https://github.com/code2nguyen/web-components/releases/tag/v1.0.3) — 2026-10-06

### Features

- **inline-edit:** Add c2-inline-edit, click-to-edit text with any control as the editor ([22223c6](https://github.com/code2nguyen/web-components/commit/22223c6))
- **mcp:** Add validate_markup and the c2n-mcp validate CLI and hook ([252c2b8](https://github.com/code2nguyen/web-components/commit/252c2b8))
- **skill:** Make agents use c2-* elements instead of native HTML by default ([6243645](https://github.com/code2nguyen/web-components/commit/6243645))
- **flow:** DragNewNode() drags a new node onto the canvas from a toolbar button ([ce024d2](https://github.com/code2nguyen/web-components/commit/ce024d2))
- **flow:** No-double-click-add, and addNode() places the node where it is easy to see ([673a841](https://github.com/code2nguyen/web-components/commit/673a841))

### Fixes

- **mcp:** Read TYPE and SLOT case-insensitively, and reject onDblClick in JSX ([6477b8c](https://github.com/code2nguyen/web-components/commit/6477b8c))
- **inline-edit:** Address review: keep vetoed blur drafts, close on disable, reflect name ([cd077b9](https://github.com/code2nguyen/web-components/commit/cd077b9))
- **mcp:** Check on* handlers and tighten validate_markup's exemptions ([d1c2980](https://github.com/code2nguyen/web-components/commit/d1c2980))
- **mcp:** Address second review of validate_markup ([39126f8](https://github.com/code2nguyen/web-components/commit/39126f8))
- **breadcrumb:** Follow slot changes on existing children under manual assignment ([25843fc](https://github.com/code2nguyen/web-components/commit/25843fc))
- **gantt:** Hide the tooltip without popover support, batch its placement ([b767f3e](https://github.com/code2nguyen/web-components/commit/b767f3e))
- **flow:** A new-node drag released over the toolbar drops nothing ([45a03ba](https://github.com/code2nguyen/web-components/commit/45a03ba))
- **flow:** AddNode() from the toolbar goes beside the node the keyboard was on ([6fbac4e](https://github.com/code2nguyen/web-components/commit/6fbac4e))
- **mcp:** Address review of validate_markup ([3d822b3](https://github.com/code2nguyen/web-components/commit/3d822b3))
- **gantt:** Keep the tooltip whole and the task list above scrolled bars ([104d0b2](https://github.com/code2nguyen/web-components/commit/104d0b2))
- **mcp:** Do not flag border-radius on a c2 host, and check .mdx files ([40a4d8b](https://github.com/code2nguyen/web-components/commit/40a4d8b))
- **components:** Assign item slots by hand instead of writing slot on children ([d8bc79c](https://github.com/code2nguyen/web-components/commit/d8bc79c))
- **skill:** Limit the c2-table default to data grids and cover AGENTS.md re-install ([57af24d](https://github.com/code2nguyen/web-components/commit/57af24d))
- **week-planner:** One pair of arrows on a narrow dated planner ([b756f13](https://github.com/code2nguyen/web-components/commit/b756f13))

### Docs site & examples

- **ui:** Use the non-expiring Discord invite ([d85471c](https://github.com/code2nguyen/web-components/commit/d85471c))
- **ui:** Set the Discord invite link ([3e88130](https://github.com/code2nguyen/web-components/commit/3e88130))
- **ui:** Link the c2n-webcomponents Discord from the site header ([e13bab8](https://github.com/code2nguyen/web-components/commit/e13bab8))
- **ui:** Tone instead of variant on c2-badge, no size on c2-button in the table gallery ([8a0c810](https://github.com/code2nguyen/web-components/commit/8a0c810))
- **examples:** Replace no-op c2 attributes and slots found by c2n-mcp validate ([4df79c8](https://github.com/code2nguyen/web-components/commit/4df79c8))

## [1.0.2](https://github.com/code2nguyen/web-components/releases/tag/v1.0.2) — 2026-10-05

### Fixes

- **log-viewer:** Recognize the scroll event echoing a clamped tail write ([b4ffda7](https://github.com/code2nguyen/web-components/commit/b4ffda7))
- **log-viewer:** Bound append renders by time in tests and on disconnect ([85fc73c](https://github.com/code2nguyen/web-components/commit/85fc73c))
- **log-viewer:** Throttle append renders by time instead of animation frames ([e2d19cf](https://github.com/code2nguyen/web-components/commit/e2d19cf))
- **log-viewer:** Stay on the latest entry when an app replaces its snapshot ([2969b92](https://github.com/code2nguyen/web-components/commit/2969b92))
- **log-viewer:** Keep realtime appends responsive with frame-coalesced updates ([ac66641](https://github.com/code2nguyen/web-components/commit/ac66641))

## [1.0.1](https://github.com/code2nguyen/web-components/releases/tag/v1.0.1) — 2026-10-05

### Fixes

- **pagination:** Read document focus only once it has left the pagination ([49ae73e](https://github.com/code2nguyen/web-components/commit/49ae73e))
- **pagination:** Leave focus that a page-change handler moved elsewhere ([6c1de80](https://github.com/code2nguyen/web-components/commit/6c1de80))
- **gantt:** Keep the initial scroll for the render after hydration ([f288de1](https://github.com/code2nguyen/web-components/commit/f288de1))
- **pagination:** Keep keyboard focus when Next or Previous disables itself ([7d9c9ca](https://github.com/code2nguyen/web-components/commit/7d9c9ca))
- **gantt:** Match the server's empty frame while hydrating ([e35b99e](https://github.com/code2nguyen/web-components/commit/e35b99e))
- **kanban:** Readable over-limit count in both themes ([4e5eaba](https://github.com/code2nguyen/web-components/commit/4e5eaba))
- **components:** Import isServer from lit so the bundle keeps it external ([4ea7ea9](https://github.com/code2nguyen/web-components/commit/4ea7ea9))

### Docs site & examples

- **ui:** Give the week-planner Dated week today header a dark-mode colour ([c4e8d9d](https://github.com/code2nguyen/web-components/commit/c4e8d9d))
- **ui:** Pair the log-viewer border and icon-button danger fallback for dark mode ([f8f2015](https://github.com/code2nguyen/web-components/commit/f8f2015))
- **ui:** Address review findings on the light-dark() gallery pairs ([6ad6019](https://github.com/code2nguyen/web-components/commit/6ad6019))
- **gallery:** Give variant colours explicit light-dark() pairs ([135a3f0](https://github.com/code2nguyen/web-components/commit/135a3f0))
- **gallery:** Theme tinted examples so they read in dark mode ([9364ff5](https://github.com/code2nguyen/web-components/commit/9364ff5))
- **gallery:** Keep the autocomplete issue-jump card dark in both themes ([8f8d84c](https://github.com/code2nguyen/web-components/commit/8f8d84c))
- **ui:** Use the color-outline-variant token in the google-map gallery ([29cc319](https://github.com/code2nguyen/web-components/commit/29cc319))

## [1.0.0](https://github.com/code2nguyen/web-components/releases/tag/v1.0.0) — 2026-10-04

### Breaking changes

- **components:** Export element subpaths without the .js extension ([5d06804](https://github.com/code2nguyen/web-components/commit/5d06804))
- **components:** Publish @c2n/components as the only component package ([9490c75](https://github.com/code2nguyen/web-components/commit/9490c75))
- **steps, chart, avatar:** No host writes on first render ([ff2b634](https://github.com/code2nguyen/web-components/commit/ff2b634))
- **text-field:** Expose state as custom states instead of host classes ([6a0de84](https://github.com/code2nguyen/web-components/commit/6a0de84))
- **table:** Name cell slots by display line and report rendered rows ([7a4ff4d](https://github.com/code2nguyen/web-components/commit/7a4ff4d))

### Features

- **working-indicator:** Add c2-working-indicator ([4d3d1d8](https://github.com/code2nguyen/web-components/commit/4d3d1d8))
- **table:** Row-activate for keyboard and pointer, grid named from the host ([4e81bc8](https://github.com/code2nguyen/web-components/commit/4e81bc8))
- **table:** Ship useRenderedRows for React and Vue ([63ee3aa](https://github.com/code2nguyen/web-components/commit/63ee3aa))
- **core:** Raw-html helper for many-instance markup; check app CSS variables in CI ([2f0e3e9](https://github.com/code2nguyen/web-components/commit/2f0e3e9))
- **table:** Row parts, cell wrapping, rendered-range event and keys for cell controls ([0a88c2b](https://github.com/code2nguyen/web-components/commit/0a88c2b))
- **command:** Cap the whole palette with --c2-command--max-height ([7b4eec9](https://github.com/code2nguyen/web-components/commit/7b4eec9))
- **theme:** Let a component shorthand variable work under base.css ([b9ff328](https://github.com/code2nguyen/web-components/commit/b9ff328))
- **dashboard:** Named panel sizes stored with the layout ([3ba3c1c](https://github.com/code2nguyen/web-components/commit/3ba3c1c))
- **kanban:** Render cards from items through renderItem ([b1d1707](https://github.com/code2nguyen/web-components/commit/b1d1707))
- **kanban:** Add c2-kanban board ([6f72719](https://github.com/code2nguyen/web-components/commit/6f72719))
- **log-lens:** Adopt the new c2n components across every view ([99d8d9f](https://github.com/code2nguyen/web-components/commit/99d8d9f))
- **gantt:** Add @c2n/gantt, a read-only Gantt chart ([77eaf2d](https://github.com/code2nguyen/web-components/commit/77eaf2d))
- **google-map:** Add @c2n/google-map with map, marker, route and street view ([d4da6a8](https://github.com/code2nguyen/web-components/commit/d4da6a8))
- Add Log Lens, an OpenTelemetry log analyzer example in Next.js ([b0edf73](https://github.com/code2nguyen/web-components/commit/b0edf73))

### Fixes

- **code-viewer, page-editor:** A failed grammar warm-up no longer unloads the grammar ([81b4469](https://github.com/code2nguyen/web-components/commit/81b4469))
- **code-viewer, page-editor:** Compile a grammar before shiki times its first line ([f88ebe1](https://github.com/code2nguyen/web-components/commit/f88ebe1))
- **code-viewer, page-editor:** Fall back to the ES2018 regex target without the v flag ([34ef6f3](https://github.com/code2nguyen/web-components/commit/34ef6f3))
- **code-viewer, page-editor:** Pin shiki's regex target so WebKit highlights code ([5bfd084](https://github.com/code2nguyen/web-components/commit/5bfd084))
- **components:** Element-only subpaths and accurate README imports ([f1c3ce4](https://github.com/code2nguyen/web-components/commit/f1c3ce4))
- **components:** Per-module subpaths, docs and READMEs on @c2n/components ([f2234bd](https://github.com/code2nguyen/web-components/commit/f2234bd))
- **gantt:** Measure on the next frame to avoid a ResizeObserver loop ([dc87f3a](https://github.com/code2nguyen/web-components/commit/dc87f3a))
- **page-editor:** Warn when a code grammar fails to load ([2076b20](https://github.com/code2nguyen/web-components/commit/2076b20))
- **working-indicator:** Keep the label when space runs out ([987e7d1](https://github.com/code2nguyen/web-components/commit/987e7d1))
- **theme:** Define shadow-sm and reject overrides naming an unknown token ([96854f3](https://github.com/code2nguyen/web-components/commit/96854f3))
- **button:** Name the inner button from the host aria-label ([414af07](https://github.com/code2nguyen/web-components/commit/414af07))
- **overlay, hover-card:** Reposition an open popup when its offset variables change ([d83d3ef](https://github.com/code2nguyen/web-components/commit/d83d3ef))
- **chart:** Wire grid width, axis-line colour and sparkline tones; document mark variables only where drawn ([b1af6e1](https://github.com/code2nguyen/web-components/commit/b1af6e1))
- **reorder-list:** Kebab-case drag-start-threshold and auto-scroll-disabled ([31cbe93](https://github.com/code2nguyen/web-components/commit/31cbe93))
- **kanban:** Keep the dragged card under the pointer ([7809686](https://github.com/code2nguyen/web-components/commit/7809686))
- **google-map:** Fixes found against the live Maps API ([46de2cb](https://github.com/code2nguyen/web-components/commit/46de2cb))

### Docs site & examples

- **ui:** Radio's import, icon and font notes, and grouped tags in the studio ([864fb39](https://github.com/code2nguyen/web-components/commit/864fb39))
- **ui:** Icon class names in the studio, and theme/install wording cubic flagged ([7a26711](https://github.com/code2nguyen/web-components/commit/7a26711))
- **ui:** Import every element a usage card shows, and keep the studio's import map small ([1deef67](https://github.com/code2nguyen/web-components/commit/1deef67))
- **ui:** Point llms.txt chart pages at their own chart entry ([1809a21](https://github.com/code2nguyen/web-components/commit/1809a21))
- **examples:** Import table and step types from their component entries ([c48b97c](https://github.com/code2nguyen/web-components/commit/c48b97c))
- **examples:** Name Log Lens pattern-table cell slots by display line ([f92ee48](https://github.com/code2nguyen/web-components/commit/f92ee48))

## [0.0.24](https://github.com/code2nguyen/web-components/releases/tag/v0.0.24) — 2026-10-03

### Features

- **theme:** Add color-on-fill for text on a saturated fill ([d015383](https://github.com/code2nguyen/web-components/commit/d015383))
- **theme:** Add dark-block colour roles that stay dark in both themes ([b6295ad](https://github.com/code2nguyen/web-components/commit/b6295ad))

### Fixes

- **week-planner:** Hydrate with the server's clock ([388ec4f](https://github.com/code2nguyen/web-components/commit/388ec4f))
- **flow:** Regenerate the React and Vue declarations for actions-placement ([534f4ca](https://github.com/code2nguyen/web-components/commit/534f4ca))

### Docs site & examples

- **ui:** Gallery text on coloured fills takes color-on-fill ([95c76f0](https://github.com/code2nguyen/web-components/commit/95c76f0))
- **ui:** Dark gallery cards take their colours from the dark-block tokens ([b37d26e](https://github.com/code2nguyen/web-components/commit/b37d26e))

## [0.0.23](https://github.com/code2nguyen/web-components/releases/tag/v0.0.23) — 2026-10-03

### Features

- **flow:** Add an actions toolbar over the canvas, placeable on any edge ([bbf0111](https://github.com/code2nguyen/web-components/commit/bbf0111))
- **flow:** Arrowheads, edge labels and a variable to hide the status marker ([da4bb53](https://github.com/code2nguyen/web-components/commit/da4bb53))

### Fixes

- **theme:** Theme the code editor's syntax palette, the danger badge and the attachment status ([7057036](https://github.com/code2nguyen/web-components/commit/7057036))
- **otp-input:** Shrink inside flex and grid parents too ([fece866](https://github.com/code2nguyen/web-components/commit/fece866))
- **avatar:** Auto-color backgrounds keep white initials readable ([4c5ac36](https://github.com/code2nguyen/web-components/commit/4c5ac36))
- **code-editor:** Let --c2-code-editor__active-line--background win over CodeMirror ([0bcf2c3](https://github.com/code2nguyen/web-components/commit/0bcf2c3))
- **steps:** Hydrate a server-rendered step as the leaf the server drew ([facba45](https://github.com/code2nguyen/web-components/commit/facba45))
- **theme:** Deepen the primary badge's text so it reads on its container ([8bdd18a](https://github.com/code2nguyen/web-components/commit/8bdd18a))
- **otp-input:** Shrink the cells instead of overflowing a narrow column ([7f7e8c5](https://github.com/code2nguyen/web-components/commit/7f7e8c5))
- **theme:** Map the remaining neutral component colours to theme tokens ([bf0f962](https://github.com/code2nguyen/web-components/commit/bf0f962))
- **qr-code:** Expose the placeholder border as --c2-qr-code__placeholder--border ([d690092](https://github.com/code2nguyen/web-components/commit/d690092))
- **theme:** Map the accordion's frame colour to the outline token ([53bd233](https://github.com/code2nguyen/web-components/commit/53bd233))
- **theme:** Theme select's pressed trigger and its landing preview follow the theme ([4f5b8e7](https://github.com/code2nguyen/web-components/commit/4f5b8e7))
- **questionnaire:** Expose the indicator, shortcut and other-field colours so the theme reaches them ([5765b41](https://github.com/code2nguyen/web-components/commit/5765b41))
- **theme:** Draw the avatar group's separation ring in the surface colour ([64f5f3a](https://github.com/code2nguyen/web-components/commit/64f5f3a))
- **flow:** Record the actions slot in the slot styling audit ([7b1e849](https://github.com/code2nguyen/web-components/commit/7b1e849))
- **notepad:** Tighten the controls row and keep it below the perforation ([4ad238c](https://github.com/code2nguyen/web-components/commit/4ad238c))
- **notepad:** Put the actions slot left of the Paper and Tear off buttons, on their row ([90973f8](https://github.com/code2nguyen/web-components/commit/90973f8))

### Docs site & examples

- **ui:** Every gallery card passes the audit in both themes ([f3c68e2](https://github.com/code2nguyen/web-components/commit/f3c68e2))
- **ui:** Primary text reads on the site's primary container ([1898b70](https://github.com/code2nguyen/web-components/commit/1898b70))
- **ui:** Gallery cards pass the contrast audit in both themes ([ff9ca10](https://github.com/code2nguyen/web-components/commit/ff9ca10))
- **ui:** Readable muted text and the dark chart palette on the docs site ([673f88c](https://github.com/code2nguyen/web-components/commit/673f88c))
- **ui:** Theme the copy button and details previews ([982c74f](https://github.com/code2nguyen/web-components/commit/982c74f))
- **ui:** Fit the questionnaire preview in its card ([12148ec](https://github.com/code2nguyen/web-components/commit/12148ec))
- **ui:** Give the avatar preview room and theme its rings ([3bfb28d](https://github.com/code2nguyen/web-components/commit/3bfb28d))
- **ui:** Keep the split panel preview's divider visible ([893ee45](https://github.com/code2nguyen/web-components/commit/893ee45))
- **ui:** Theme the masonry preview and the neutral greys of the other landing previews ([e713cb8](https://github.com/code2nguyen/web-components/commit/e713cb8))
- **ui:** Theme the border beam preview card and make its beam easier to see ([68e8c8d](https://github.com/code2nguyen/web-components/commit/68e8c8d))

## [0.0.22](https://github.com/code2nguyen/web-components/releases/tag/v0.0.22) — 2026-10-03

### Features

- **notepad:** Actions slot, and controls that can show only on the note in use ([87c3390](https://github.com/code2nguyen/web-components/commit/87c3390))
- **flow:** Editable mode — add, connect, rename and delete nodes ([80190a0](https://github.com/code2nguyen/web-components/commit/80190a0))
- **week-planner:** Dated weeks, click to add and drag to reschedule ([72879d3](https://github.com/code2nguyen/web-components/commit/72879d3))
- **month-planner:** Click a day to add, drag to reschedule ([24d8d2a](https://github.com/code2nguyen/web-components/commit/24d8d2a))

### Fixes

- **notepad:** Add the actions slot to the slot styling audit ([1a383a2](https://github.com/code2nguyen/web-components/commit/1a383a2))
- **notepad:** On a touch screen, hidden controls show once the page is tapped ([4ebb9e8](https://github.com/code2nguyen/web-components/commit/4ebb9e8))

## [0.0.21](https://github.com/code2nguyen/web-components/releases/tag/v0.0.21) — 2026-10-03

### Breaking changes

- **todo-list:** Take custom backgrounds and palettes, stored by position ([76eefa9](https://github.com/code2nguyen/web-components/commit/76eefa9))
- **notepad:** Take custom ink and highlighter lists, stored by position ([5011b91](https://github.com/code2nguyen/web-components/commit/5011b91))
- **separator:** Rename @c2n/seperator to @c2n/separator ([37674f3](https://github.com/code2nguyen/web-components/commit/37674f3))

### Features

- **page-editor:** Add c2-page-editor, a Notion-style editor for long text ([f1d3857](https://github.com/code2nguyen/web-components/commit/f1d3857))
- **notepad:** Name list colours `{ value, name }`, with an optional name ([bfd8efd](https://github.com/code2nguyen/web-components/commit/bfd8efd))
- **todo-list:** Draw the ring and hero progress as a circular c2-progress ([7056c63](https://github.com/code2nguyen/web-components/commit/7056c63))

### Fixes

- **masonry:** Place a newly added tile before its authored successor ([04883b3](https://github.com/code2nguyen/web-components/commit/04883b3))
- **code-editor:** Apply value and options set while the engine loads ([aa3745d](https://github.com/code2nguyen/web-components/commit/aa3745d))
- **reorder-list:** Keep the drag preview under the pointer inside a containing ancestor ([ba20843](https://github.com/code2nguyen/web-components/commit/ba20843))
- **notepad:** Size the paper menu to its content on iOS Safari ([164b69d](https://github.com/code2nguyen/web-components/commit/164b69d))

## [0.0.20](https://github.com/code2nguyen/web-components/releases/tag/v0.0.20) — 2026-10-02

### Features

- **notepad:** Add pad presets (notebook, legal pad, sticky note, index card) to the paper picker ([037de7d](https://github.com/code2nguyen/web-components/commit/037de7d))
- **todo-list:** Edit tasks, list icons, four distinct palettes, and c2-tabs/c2-progress ([8ec21c7](https://github.com/code2nguyen/web-components/commit/8ec21c7))
- **progress:** Add circular variant ([6994887](https://github.com/code2nguyen/web-components/commit/6994887))
- **comparison-bar:** Segments touch by default ([e6318aa](https://github.com/code2nguyen/web-components/commit/e6318aa))
- **comparison-bar:** Support an optional third (middle) value ([95cde3e](https://github.com/code2nguyen/web-components/commit/95cde3e))
- **notepad:** Paper colours pair a sheet with its ink, in a hover card ([a986953](https://github.com/code2nguyen/web-components/commit/a986953))
- **comparison-bar:** Add c2-comparison-bar two-segment ratio bar ([8283c07](https://github.com/code2nguyen/web-components/commit/8283c07))
- **notepad:** Add a paper picker, and a dark washi-tape toolbar under the theme ([ce5a4df](https://github.com/code2nguyen/web-components/commit/ce5a4df))
- **notepad:** Group the inks and highlighters into one toolbar button each ([d5d2e46](https://github.com/code2nguyen/web-components/commit/d5d2e46))
- **chart:** Add c2-map-chart, a choropleth and point map on vector outlines ([e84cd3d](https://github.com/code2nguyen/web-components/commit/e84cd3d))
- **notepad:** Add c2-notepad, a paper notepad with a selection toolbar, checklists and tear-off pages ([1b21b03](https://github.com/code2nguyen/web-components/commit/1b21b03))
- **butterfly-chart:** Add c2-butterfly-chart, two series back to back ([05302b3](https://github.com/code2nguyen/web-components/commit/05302b3))
- **button-group:** Add toolbar mode, roving focus and form association ([2566aeb](https://github.com/code2nguyen/web-components/commit/2566aeb))
- **chart:** Add horizontal, stacked and value-labelled bar charts ([cf1724a](https://github.com/code2nguyen/web-components/commit/cf1724a))
- **status-panel:** Add media="illustration" and media="none" ([cf20366](https://github.com/code2nguyen/web-components/commit/cf20366))
- Add a custom 404 page to the docs site ([c49430f](https://github.com/code2nguyen/web-components/commit/c49430f))
- **changelog:** Show the 10 latest releases and preview new components ([74e4a5e](https://github.com/code2nguyen/web-components/commit/74e4a5e))
- **changelog:** Generate the changelog from git history and show it on the docs site ([c63e5de](https://github.com/code2nguyen/web-components/commit/c63e5de))
- **steps:** Horizontal rail always links the steps; text placement around the marker ([22b8f4d](https://github.com/code2nguyen/web-components/commit/22b8f4d))
- **steps:** Horizontal orientation and selectable steps ([33295e2](https://github.com/code2nguyen/web-components/commit/33295e2))
- **todo-list:** Add colour palettes to c2-todo-list ([ef3c458](https://github.com/code2nguyen/web-components/commit/ef3c458))
- **reorder-list, todo-list:** Add opt-in swipe actions to c2-reorder-list and use them in c2-todo-list ([2b27d11](https://github.com/code2nguyen/web-components/commit/2b27d11))
- **flow:** Add c2-flow: pipeline flow diagram component ([f544fd6](https://github.com/code2nguyen/web-components/commit/f544fd6))
- **todo-list:** Add c2-todo-list and the @c2n/task-icons set ([71659a1](https://github.com/code2nguyen/web-components/commit/71659a1))
- **week-planner:** Add c2-week-planner: typical-week schedule with odd/even weeks ([d5ee5ae](https://github.com/code2nguyen/web-components/commit/d5ee5ae))
- **chart:** Round the pyramid's corners ([0fa6d3f](https://github.com/code2nguyen/web-components/commit/0fa6d3f))
- **bubble-chart:** Hide the size key unless size-legend is set ([e628cb4](https://github.com/code2nguyen/web-components/commit/e628cb4))
- **calendar:** Add c2-calendar: inline single-date month calendar ([4d7fd0a](https://github.com/code2nguyen/web-components/commit/4d7fd0a))
- **overlap-chart:** Name the sets in one legend by default; set-labels="around" opts in ([98419b2](https://github.com/code2nguyen/web-components/commit/98419b2))
- **chart:** Add c2-pyramid-chart ([e1fcb73](https://github.com/code2nguyen/web-components/commit/e1fcb73))
- **chart:** Highlight is the default legend action; overlap chart polish ([8f46cce](https://github.com/code2nguyen/web-components/commit/8f46cce))
- **chart:** Clicking a series in the plot highlights it, on every chart ([0365dc5](https://github.com/code2nguyen/web-components/commit/0365dc5))
- **chart:** Legend-action="highlight" on every chart; slots verified for all ([0f142f9](https://github.com/code2nguyen/web-components/commit/0f142f9))
- **overlap-chart:** Selection="set" selects the whole circle under the pointer ([8583e3e](https://github.com/code2nguyen/web-components/commit/8583e3e))
- **overlap-chart:** Configurable look for the other circles while one set is highlighted ([78ad3fb](https://github.com/code2nguyen/web-components/commit/78ad3fb))
- **overlap-chart:** Highlight and select a whole set; region/set on tooltip context ([d57a2c8](https://github.com/code2nguyen/web-components/commit/d57a2c8))
- **chart:** Add c2-bubble-chart, a scatter plot sized by a third measure ([896e7bb](https://github.com/code2nguyen/web-components/commit/896e7bb))
- **chart:** Add c2-overlap-chart, a Venn diagram of two or three sets ([d0c8c0e](https://github.com/code2nguyen/web-components/commit/d0c8c0e))
- **marker:** Add c2-marker inline text marker ([54507ee](https://github.com/code2nguyen/web-components/commit/54507ee))
- **command:** Add c2-command searchable command list ([f8c4de6](https://github.com/code2nguyen/web-components/commit/f8c4de6))
- **hover-card:** Add c2-hover-card component ([5f65330](https://github.com/code2nguyen/web-components/commit/5f65330))
- **table:** Group rows by one or more fields ([d2959b0](https://github.com/code2nguyen/web-components/commit/d2959b0))
- **context-menu:** Add c2-context-menu: right-click / long-press menus, static or per clicked spot ([69cfc0c](https://github.com/code2nguyen/web-components/commit/69cfc0c))
- **otp-input:** Add c2-otp-input one-time-code field ([1275cd7](https://github.com/code2nguyen/web-components/commit/1275cd7))
- **slider:** Add range mode with two thumbs ([819fa5d](https://github.com/code2nguyen/web-components/commit/819fa5d))

### Fixes

- **notepad:** Read the caret through composed ranges, so a fast key acts at the real caret in WebKit ([837b0cb](https://github.com/code2nguyen/web-components/commit/837b0cb))
- **notepad:** Keep the toolbar and the paper card on their anchor while the page scrolls ([9f13221](https://github.com/code2nguyen/web-components/commit/9f13221))
- **reorder-list:** Hydrate server-rendered items, and style the drop slot and drag preview ([305934f](https://github.com/code2nguyen/web-components/commit/305934f))
- **notepad:** Mark the selected colour with a ring, not a highlighted square ([2908af9](https://github.com/code2nguyen/web-components/commit/2908af9))
- **notepad:** Keep the ink colour of selected text ([8414048](https://github.com/code2nguyen/web-components/commit/8414048))
- **notepad:** Sync the caret before key handling, clear the binding, ring only on keyboard focus ([8e651fb](https://github.com/code2nguyen/web-components/commit/8e651fb))
- **status-panel:** Show slotted title and description after SSR hydration ([8982b18](https://github.com/code2nguyen/web-components/commit/8982b18))
- **chart:** Zero-based bar value axis, one tick per band, readable inside labels ([6b093e7](https://github.com/code2nguyen/web-components/commit/6b093e7))
- **steps:** A selected step only recolours its label; steps gallery two cards per row ([66b343c](https://github.com/code2nguyen/web-components/commit/66b343c))
- **chart:** Keep every bubble inside the axes; meaningful one-column-per-series example ([8ce849e](https://github.com/code2nguyen/web-components/commit/8ce849e))
- **steps:** Equal-height horizontal steps; build the docs task demo in the browser ([bcd20c2](https://github.com/code2nguyen/web-components/commit/bcd20c2))
- **chart:** Keep pyramid labels readable and clear of each other ([56355b6](https://github.com/code2nguyen/web-components/commit/56355b6))
- **bubble-chart:** Draw bubble labels in the chart text colour so they read in dark mode ([f776921](https://github.com/code2nguyen/web-components/commit/f776921))
- **chart:** Honour declared series after hydration; tidy overlap labels ([486e180](https://github.com/code2nguyen/web-components/commit/486e180))
- **mcp:** Keep gallery screenshot names independent of card order ([2350ffa](https://github.com/code2nguyen/web-components/commit/2350ffa))
- **menu:** Mark the keyboard-focused row by its highlight only; widen the context-menu usage examples ([0188407](https://github.com/code2nguyen/web-components/commit/0188407))
- **navigation-menu:** Close the open panel when its trigger is clicked again ([208ec16](https://github.com/code2nguyen/web-components/commit/208ec16))
- **table:** Record the group:{groupKey} slot in the slot styling audit ([1060ae5](https://github.com/code2nguyen/web-components/commit/1060ae5))
- **chart:** Theme scatter grid lines and fit its axes to the data ([f5d39df](https://github.com/code2nguyen/web-components/commit/f5d39df))
- **banner:** Keep the icon on the message row in a narrow banner ([2331b07](https://github.com/code2nguyen/web-components/commit/2331b07))
- **theme:** Map chat message body text to the on-surface token ([39e8d33](https://github.com/code2nguyen/web-components/commit/39e8d33))
- **date-selector:** Keep the selected fill on a hovered day ([c8fa95e](https://github.com/code2nguyen/web-components/commit/c8fa95e))

### Improvements

- Planners: heading and actions parts, slot styling audit entries ([5dacbb5](https://github.com/code2nguyen/web-components/commit/5dacbb5))
- Month planner: heading and actions header slots ([4c2868f](https://github.com/code2nguyen/web-components/commit/4c2868f))
- Week planner: heading and actions header slots ([3ed6611](https://github.com/code2nguyen/web-components/commit/3ed6611))
- Responsive planners: day strip, compact month, heading, Planning category ([4cbdd72](https://github.com/code2nguyen/web-components/commit/4cbdd72))
- **calendar, month-planner:** Rename c2-calendar to c2-month-planner ([2826c3f](https://github.com/code2nguyen/web-components/commit/2826c3f))
- **todo-list:** Give c2-todo-list a paper feel, notes, archive, swipe, reorder and task colours ([3a0bc9e](https://github.com/code2nguyen/web-components/commit/3a0bc9e))
- Start the week on the locale's first day ([b0ca38b](https://github.com/code2nguyen/web-components/commit/b0ca38b))
- Translate the calendar and week planner; week number badge on the switch ([7364743](https://github.com/code2nguyen/web-components/commit/7364743))
- Keep white text on custom-coloured events in dark mode ([a2a9ac1](https://github.com/code2nguyen/web-components/commit/a2a9ac1))
- Today tints inside the grid lines; week planner's odd/even is opt-in ([f72d579](https://github.com/code2nguyen/web-components/commit/f72d579))
- Record @c2n/calendar in the umbrella package's lockfile entry ([ba5bb8b](https://github.com/code2nguyen/web-components/commit/ba5bb8b))
- **stat:** Dim the c2-stat placeholder through --c2-stat__placeholder--opacity ([bb73aed](https://github.com/code2nguyen/web-components/commit/bb73aed))
- **stat:** Show -- in c2-stat while value is null or undefined ([e6c7d91](https://github.com/code2nguyen/web-components/commit/e6c7d91))
- **calendar:** Rework c2-calendar into a month planner ([ddeb8d0](https://github.com/code2nguyen/web-components/commit/ddeb8d0))
- Tint shared zones of a highlighted circle in the other set's colour ([fbe0c3a](https://github.com/code2nguyen/web-components/commit/fbe0c3a))
- Bring highlighted series forward and fix area chart band picking ([d194af6](https://github.com/code2nguyen/web-components/commit/d194af6))

### Docs site & examples

- **ui:** Render the button-group toolbar example as plain children ([02c107d](https://github.com/code2nguyen/web-components/commit/02c107d))
- **ui:** Keep table rows in the studio and add a Data tab to the inspector ([373c81d](https://github.com/code2nguyen/web-components/commit/373c81d))
- **ui:** Keep the space before the full changelog link ([a9cdb64](https://github.com/code2nguyen/web-components/commit/a9cdb64))
- **ui:** Neutral theme-aware Sign in button in the header preview ([965d04e](https://github.com/code2nguyen/web-components/commit/965d04e))
- **ui:** Show sidebar counts only in the components section ([f9eae50](https://github.com/code2nguyen/web-components/commit/f9eae50))
- **ui:** Keep the header preview's Sign in on one line ([a2ef052](https://github.com/code2nguyen/web-components/commit/a2ef052))
- **ui:** Put the drawer close button on the overview row ([f2937f8](https://github.com/code2nguyen/web-components/commit/f2937f8))
- **ui:** Keep the search palette to one scrollbar ([212470c](https://github.com/code2nguyen/web-components/commit/212470c))
- **ui:** Build the ⌘K search palette on c2-command ([0f9e889](https://github.com/code2nguyen/web-components/commit/0f9e889))
- **ui:** Theme the neutral colours in docs examples for dark mode ([4164e9a](https://github.com/code2nguyen/web-components/commit/4164e9a))
- **ui:** Tighten menu separators and add icons to the menu examples ([fdd2bb3](https://github.com/code2nguyen/web-components/commit/fdd2bb3))
- **ui:** Fit the accordion landing preview inside its canvas ([40f377a](https://github.com/code2nguyen/web-components/commit/40f377a))
- **ui:** Declutter the gauge chart landing preview ([c3020ac](https://github.com/code2nguyen/web-components/commit/c3020ac))
- **ui:** Theme the steps preview and usage panel for dark mode ([c1c507f](https://github.com/code2nguyen/web-components/commit/c1c507f))
- **ui:** Add reorder-list preview to the landing gallery ([8ce0b0e](https://github.com/code2nguyen/web-components/commit/8ce0b0e))

## [0.0.19](https://github.com/code2nguyen/web-components/releases/tag/v0.0.19) — 2026-09-29

### Features

- **mcp, skill:** Know about @c2n/components ([8bc883e](https://github.com/code2nguyen/web-components/commit/8bc883e))
- **mcp:** Gallery looks for agents: index, search, themed CSS, screenshots ([660a575](https://github.com/code2nguyen/web-components/commit/660a575))
- **components:** Add @c2n/components, every component in one install ([8eaeeb6](https://github.com/code2nguyen/web-components/commit/8eaeeb6))
- **skill:** GitHub Copilot support, proxy-safe MCP startup, dashboard composition ([db7e699](https://github.com/code2nguyen/web-components/commit/db7e699))
- **table:** String row keys, getRowKey and row-based selection helpers ([ed68c34](https://github.com/code2nguyen/web-components/commit/ed68c34))
- **table:** Sticky summary row keyed by column id ([9b608ea](https://github.com/code2nguyen/web-components/commit/9b608ea))

### Fixes

- **gallery, chart:** Readable gallery cards in dark mode, category x ticks ([b95a708](https://github.com/code2nguyen/web-components/commit/b95a708))
- **core:** Keep reflected defaults off the host ([284e7bd](https://github.com/code2nguyen/web-components/commit/284e7bd))
- **framework-types:** Make every generated vue.d.ts compile ([b664fb4](https://github.com/code2nguyen/web-components/commit/b664fb4))
- **table:** Apply the selected row colour to its cells ([c84b829](https://github.com/code2nguyen/web-components/commit/c84b829))
- **table:** Clicking the selected row again clears the selection ([c1cbe45](https://github.com/code2nguyen/web-components/commit/c1cbe45))
- **masonry:** Stop writing tabindex on connect, which broke SSR hydration ([1f99f81](https://github.com/code2nguyen/web-components/commit/1f99f81))

### Docs site & examples

- **ui:** Gallery audit, automatic checks on every card in both themes ([b700c08](https://github.com/code2nguyen/web-components/commit/b700c08))
- **ui:** Keep the release version badge visible on mobile ([996e419](https://github.com/code2nguyen/web-components/commit/996e419))

## [0.0.18](https://github.com/code2nguyen/web-components/releases/tag/v0.0.18) — 2026-09-29

### Features

- **chat-message-list:** Theme the log's scrollbar ([6fb2e4b](https://github.com/code2nguyen/web-components/commit/6fb2e4b))
- **carousel:** Mouse drag, click-to-peek and edge-zone hover controls ([0ace2b8](https://github.com/code2nguyen/web-components/commit/0ace2b8))
- **split-panel:** Hide the divider until hovered, recolour it on focus ([b833880](https://github.com/code2nguyen/web-components/commit/b833880))
- **banner:** Add position (sticky top / fixed bottom) and polish defaults ([7b7815b](https://github.com/code2nguyen/web-components/commit/7b7815b))
- **time-input:** Replace native picker with a compact themeable picker ([2737319](https://github.com/code2nguyen/web-components/commit/2737319))
- **carousel:** Add c2-carousel component ([1aebf68](https://github.com/code2nguyen/web-components/commit/1aebf68))
- **timeline:** Add c2-timeline and c2-timeline-item ([28a99fa](https://github.com/code2nguyen/web-components/commit/28a99fa))
- **split-panel:** Add c2-split-panel component ([3af43c5](https://github.com/code2nguyen/web-components/commit/3af43c5))
- **banner:** Add c2-banner component ([26fdea3](https://github.com/code2nguyen/web-components/commit/26fdea3))
- **tag-input:** Add c2-tag-input for entering lists such as email recipients ([ced1869](https://github.com/code2nguyen/web-components/commit/ced1869))
- **time-input:** Add c2-time-input component ([84d3a66](https://github.com/code2nguyen/web-components/commit/84d3a66))
- **shortcut:** Add c2-shortcut and the core shortcut helper ([feffb80](https://github.com/code2nguyen/web-components/commit/feffb80))
- **date-selector:** Disable month navigation past min/max, add relative range examples ([f3863bb](https://github.com/code2nguyen/web-components/commit/f3863bb))
- **chat-message-list:** Add c2-chat-message-list conversation log ([a67bc1f](https://github.com/code2nguyen/web-components/commit/a67bc1f))
- **symbols:** Expand the set to 157 illustrations ([9caa65a](https://github.com/code2nguyen/web-components/commit/9caa65a))
- **symbols:** Add @c2n/symbols spot illustrations ([593fac7](https://github.com/code2nguyen/web-components/commit/593fac7))

### Fixes

- **shortcut:** Accept composed keys only and click inner controls ([0f9ad88](https://github.com/code2nguyen/web-components/commit/0f9ad88))
- **carousel:** Ignore a stale scrollend while a programmatic scroll is in flight ([d9bac17](https://github.com/code2nguyen/web-components/commit/d9bac17))
- **timeline:** Show slotted content after hydration, add release notes gallery card ([2dbd7f8](https://github.com/code2nguyen/web-components/commit/2dbd7f8))
- **icon-button:** Center the button in its host when the host is stretched or sized ([b6e9645](https://github.com/code2nguyen/web-components/commit/b6e9645))
- **side-nav:** No focus ring on the first drawer link after a tap ([1977453](https://github.com/code2nguyen/web-components/commit/1977453))
- **date-input:** Calendar icon focuses the input and tolerates showPicker() throwing ([c9a3f5c](https://github.com/code2nguyen/web-components/commit/c9a3f5c))
- **date-selector:** No range strip behind a lone start date ([3b65fc3](https://github.com/code2nguyen/web-components/commit/3b65fc3))
- **table:** Keep selected row background under the pointer, show row hover, resize columns by default ([a42568c](https://github.com/code2nguyen/web-components/commit/a42568c))
- **log-viewer:** Reveal copy button per tapped entry on touch devices ([1d54b2d](https://github.com/code2nguyen/web-components/commit/1d54b2d))

### Improvements

- Tidy autocomplete example header/footer on narrow screens ([d0e8dff](https://github.com/code2nguyen/web-components/commit/d0e8dff))

### Docs site & examples

- **ui:** Keep Astro's island bootstrap out of named slots ([1fbe4fd](https://github.com/code2nguyen/web-components/commit/1fbe4fd))
- **ui:** Keep long usage-row labels from overlapping examples on mobile ([18f709e](https://github.com/code2nguyen/web-components/commit/18f709e))

## [0.0.17](https://github.com/code2nguyen/web-components/releases/tag/v0.0.17) — 2026-09-28

### Features

- Add virtual log viewer with sticky columns and log highlighting ([647f60b](https://github.com/code2nguyen/web-components/commit/647f60b))
- Add persistent masonry component ([3989120](https://github.com/code2nguyen/web-components/commit/3989120))

### Fixes

- Stabilize virtual log keyboard scrolling in CI ([9854ce5](https://github.com/code2nguyen/web-components/commit/9854ce5))
- Complete log viewer styling and wrapped token contracts ([468f0ac](https://github.com/code2nguyen/web-components/commit/468f0ac))
- Fix tabs accessibility and chart font sizing ([fe083e5](https://github.com/code2nguyen/web-components/commit/fe083e5))

### Improvements

- Make switch thumb follow track height ([faea792](https://github.com/code2nguyen/web-components/commit/faea792))
- Allow table scroll to chain to the page ([b3c5cd7](https://github.com/code2nguyen/web-components/commit/b3c5cd7))

## [0.0.16](https://github.com/code2nguyen/web-components/releases/tag/v0.0.16) — 2026-09-24

### Features

- Add diagnostic CSS styling contract audit ([e674886](https://github.com/code2nguyen/web-components/commit/e674886))

### Docs site & examples

- **nextjs:** Track JSX custom element declarations ([3605230](https://github.com/code2nguyen/web-components/commit/3605230))

## [0.0.15](https://github.com/code2nguyen/web-components/releases/tag/v0.0.15) — 2026-09-23

### Features

- Add Next.js observability example and c2n improvements ([6077abb](https://github.com/code2nguyen/web-components/commit/6077abb))

### Fixes

- **button:** Rerender after form-disabled state changes ([fd97e6d](https://github.com/code2nguyen/web-components/commit/fd97e6d))

### Docs site & examples

- **ui:** Restore mobile site navigation ([05a6ebf](https://github.com/code2nguyen/web-components/commit/05a6ebf))

## [0.0.14](https://github.com/code2nguyen/web-components/releases/tag/v0.0.14) — 2026-09-21

### Features

- **reorder-list:** Make reordering reliable and accessible ([4be70ff](https://github.com/code2nguyen/web-components/commit/4be70ff))
- Complete slot styling contracts ([678a94c](https://github.com/code2nguyen/web-components/commit/678a94c))

### Fixes

- **core:** Read a "false" boolean attribute as false, and parse JSON assigned to a property ([9cdf0cb](https://github.com/code2nguyen/web-components/commit/9cdf0cb))

### Docs site & examples

- **ui:** Render API descriptions as safe markdown ([1301984](https://github.com/code2nguyen/web-components/commit/1301984))

## [0.0.13](https://github.com/code2nguyen/web-components/releases/tag/v0.0.13) — 2026-09-18

### Fixes

- Ship custom-elements.json in every published package ([822f232](https://github.com/code2nguyen/web-components/commit/822f232))

### Docs site & examples

- **ui:** llms-full.txt from the skill, richer llms.txt, footer links ([c81f3fa](https://github.com/code2nguyen/web-components/commit/c81f3fa))

## [0.0.12](https://github.com/code2nguyen/web-components/releases/tag/v0.0.12) — 2026-09-18

### Features

- **dashboard:** Responsive layouts, enter/leave motion, and SSR-safe attributes ([e729283](https://github.com/code2nguyen/web-components/commit/e729283))

## [0.0.11](https://github.com/code2nguyen/web-components/releases/tag/v0.0.11) — 2026-09-18

### Features

- **dashboard:** Add @c2n/dashboard, a grid of resizable panes ([498233e](https://github.com/code2nguyen/web-components/commit/498233e))

### Fixes

- **dashboard:** Sync the new package with v0.0.10 ([e5d01a4](https://github.com/code2nguyen/web-components/commit/e5d01a4))
- **theme-select:** Keep the menu open while the pointer crosses into it ([94e8ba4](https://github.com/code2nguyen/web-components/commit/94e8ba4))

## [0.0.10](https://github.com/code2nguyen/web-components/releases/tag/v0.0.10) — 2026-09-18

### Features

- **steps:** Add @c2n/steps, plus border-beam, code-editor, theme-select and avatar-group ([7a897e3](https://github.com/code2nguyen/web-components/commit/7a897e3))

### Fixes

- Sync the new packages with v0.0.9, and declare composed children ([182c364](https://github.com/code2nguyen/web-components/commit/182c364))

## [0.0.9](https://github.com/code2nguyen/web-components/releases/tag/v0.0.9) — 2026-09-17

### Features

- **tree:** Add @c2n/tree and rebuild the docs sidebar on it ([a093add](https://github.com/code2nguyen/web-components/commit/a093add))
- Expand component library and examples ([38fc60e](https://github.com/code2nguyen/web-components/commit/38fc60e))
- Improve chart examples and add radar charts ([06e2b60](https://github.com/code2nguyen/web-components/commit/06e2b60))

### Fixes

- Make questionnaire options directly interactive ([4750d9c](https://github.com/code2nguyen/web-components/commit/4750d9c))
- Keep chart hover active during entry animation ([ba1bb76](https://github.com/code2nguyen/web-components/commit/ba1bb76))
- Resolve chart theme before first paint ([2ad952a](https://github.com/code2nguyen/web-components/commit/2ad952a))

## [0.0.8](https://github.com/code2nguyen/web-components/releases/tag/v0.0.8) — 2026-09-15

### Features

- Add date and number inputs ([36e70a2](https://github.com/code2nguyen/web-components/commit/36e70a2))
- Add date selector component ([cb5aca9](https://github.com/code2nguyen/web-components/commit/cb5aca9))

### Fixes

- Preserve number input width in WebKit ([de560e4](https://github.com/code2nguyen/web-components/commit/de560e4))
- Correct date selector test semantics ([f17a244](https://github.com/code2nguyen/web-components/commit/f17a244))

## [0.0.7](https://github.com/code2nguyen/web-components/releases/tag/v0.0.7) — 2026-09-15

### Breaking changes

- Framework integration for React, Vue and Angular ([3502f6d](https://github.com/code2nguyen/web-components/commit/3502f6d))

### Features

- Refine docs shell interactions ([790bfa0](https://github.com/code2nguyen/web-components/commit/790bfa0))
- Expand chart and realtime table demos ([453ef10](https://github.com/code2nguyen/web-components/commit/453ef10))
- Improve chat components ([a0a3bfb](https://github.com/code2nguyen/web-components/commit/a0a3bfb))
- Add autocomplete component ([a72d74c](https://github.com/code2nguyen/web-components/commit/a72d74c))
- Improve data platform navigation ([31d76bc](https://github.com/code2nguyen/web-components/commit/31d76bc))
- Expand components and native form support ([a6b4ed3](https://github.com/code2nguyen/web-components/commit/a6b4ed3))
- Improve component docs and agent tooling ([f50b2ac](https://github.com/code2nguyen/web-components/commit/f50b2ac))
- Add attachment components and improve galleries ([1d4843a](https://github.com/code2nguyen/web-components/commit/1d4843a))
- **virtual-list:** Add the virtualized list with built-in search ([977a0b3](https://github.com/code2nguyen/web-components/commit/977a0b3))
- **pagination:** Add the pagination component and wire it into the table ([336cfe2](https://github.com/code2nguyen/web-components/commit/336cfe2))
- **sheet:** Add the edge-anchored sheet component ([a67a13a](https://github.com/code2nguyen/web-components/commit/a67a13a))
- **skeleton:** Add the skeleton placeholder component ([7123837](https://github.com/code2nguyen/web-components/commit/7123837))
- **progress:** Add the linear progress component ([0120a74](https://github.com/code2nguyen/web-components/commit/0120a74))
- **kbd:** Add the kbd component ([a8c11d9](https://github.com/code2nguyen/web-components/commit/a8c11d9))
- Add virtualized table component ([fa0df0b](https://github.com/code2nguyen/web-components/commit/fa0df0b))

### Fixes

- Publish regenerated framework metadata ([f1b9394](https://github.com/code2nguyen/web-components/commit/f1b9394))
- Resume releases from historical tags ([01a7970](https://github.com/code2nguyen/web-components/commit/01a7970))
- Resolve release before version lifecycle ([6059c47](https://github.com/code2nguyen/web-components/commit/6059c47))
- Make npm releases resumable ([c95b86f](https://github.com/code2nguyen/web-components/commit/c95b86f))
- Keep framework types on workspace version ([9a10c49](https://github.com/code2nguyen/web-components/commit/9a10c49))
- **tabs:** Move c2-tab's slot attribute out of the constructor ([c0711ce](https://github.com/code2nguyen/web-components/commit/c0711ce))
- **list-item:** Stop squashing non-icon content in the icon slots ([b8e5d71](https://github.com/code2nguyen/web-components/commit/b8e5d71))

### Docs site & examples

- **ui:** Split the chart docs, rebuild the sidebar, and dogfood c2n in the docs site ([e3636e2](https://github.com/code2nguyen/web-components/commit/e3636e2))
- **examples:** Add data-platform-html example app and component polish ([f670d12](https://github.com/code2nguyen/web-components/commit/f670d12))
- **examples:** Add example apps section with a Vue 3 inbox ([a5dc4d6](https://github.com/code2nguyen/web-components/commit/a5dc4d6))

## [0.0.6](https://github.com/code2nguyen/web-components/releases/tag/v0.0.6) — 2026-09-10

### Docs site & examples

- **ui:** Keep the sidebar scroll offset across navigations ([124f2e0](https://github.com/code2nguyen/web-components/commit/124f2e0))

## [0.0.5](https://github.com/code2nguyen/web-components/releases/tag/v0.0.5) — 2026-09-10

### Features

- **copy-button:** New @c2n/copy-button component ([9aa425f](https://github.com/code2nguyen/web-components/commit/9aa425f))
- Docs app restructure, design tokens, MCP server, skill plugin and studio inspector redesign ([1ce7584](https://github.com/code2nguyen/web-components/commit/1ce7584))

### Fixes

- **copy-button:** Stop the abandoned button flipping back to the copy icon ([2081bdb](https://github.com/code2nguyen/web-components/commit/2081bdb))

## [0.0.4](https://github.com/code2nguyen/web-components/releases/tag/v0.0.4) — 2022-11-04

_Maintenance release._

## [0.0.3](https://github.com/code2nguyen/web-components/releases/tag/v0.0.3) — 2022-11-03

_Maintenance release._

## [0.0.2](https://github.com/code2nguyen/web-components/releases/tag/v0.0.2) — 2022-09-22

### Fixes

- **checkbox:** Checked state does not reactive on vuejs binding ([a8cfa44](https://github.com/code2nguyen/web-components/commit/a8cfa44))

## [0.0.1](https://github.com/code2nguyen/web-components/releases/tag/v0.0.1) — 2022-09-22

_Maintenance release._
