# Research: `c2-app-shell` and `c2-page-header`

Roadmap #57 and #58 (section D, both P1). Collected 2026-10-23 before design; decisions and API in [spec.md](./spec.md). Mock: [c2-app-shell mock](https://claude.ai/artifact/PQgz6gegX8J4ByoctSR4X1) (findings, anatomy of both, an interactive prototype across desktop / tablet / phone, page header variants, API sketch).

The two belong together: the shell is the frame (header, navigation, main, aside), the page header is the top of `main` on every page (breadcrumb, title, status, metadata, page actions, tabs). The shell's header region takes the existing `c2-header`; no new application header is proposed.

## 1. Prior art

### App shells

| System                                          | Shape                                                                                                                                                                           | Regions                                                                                                                | Responsive model                                                                                                                                                                     | Notes                                                                                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mantine `AppShell` (core 9.x)                   | Config object per region (`header`, `navbar`, `aside`, `footer`), each with `height`/`width`, `breakpoint`, `collapsed: { mobile, desktop }`                                    | Header, Navbar, Aside, Footer, Main, `AppShell.Section` (grow / scroll inside the navbar)                              | Below `breakpoint` the navbar goes full width and reads `collapsed.mobile`; separate desktop / mobile collapse state                                                                 | `layout: 'default' \| 'alt'` (header spans the top, or navbar / aside run full height beside it), `mode: 'fixed' \| 'static'`, `withBorder`, `offsetScrollbars`, `disabled`, `useHeadroom`, `useAppShellResize` (drag widths) |
| Vaadin `vaadin-app-layout` 25.3                 | Slots `navbar`, `drawer`, default; `navbar touch-optimized` moves items to a bottom bar on touch devices                                                                        | Navbar, drawer, content, bottom navbar                                                                                 | `overlay` (read-only, driven by CSS `--vaadin-app-layout-drawer-overlay`), `drawerOpened`, `<vaadin-drawer-toggle>` anywhere                                                         | `primary-section="navbar \| drawer"` = Mantine's default / alt. `closeDrawerOn` global event closes the overlay drawer after navigation. Body vs content scrolling chosen by `html, body { height: 100% }`. Safe-area vars.   |
| Web Awesome `wa-page` 3.14                      | One element, 15 slots                                                                                                                                                           | banner, header, subheader, navigation-header / navigation / navigation-footer, main-header, main-footer, aside, footer | `mobile-breakpoint` (default 768), `view` reflects desktop / mobile, `nav-open`, `navigation-placement` (start / end) on mobile, built-in hamburger with `disable-navigation-toggle` | Ships its own `skip-to-content` slot. Sizes as `--menu-width`, `--aside-width`, `--header-height`, `--banner-height`. Closest model to c2's slot-first style; its `main-header` slot is where a page header goes.             |
| Carbon UI shell (`@carbon/web-components` 2.66) | Family of elements: `cds-header`, `cds-header-name`, `cds-header-nav`, `cds-header-global-action`, `cds-header-panel`, `cds-switcher`, `cds-side-nav`, `cds-header-menu-button` | Header (48px), left panel (side nav, rail), right panels (switcher, notifications)                                     | Header nav moves into the side nav below `lg`; side nav `expanded` / `collapse-mode="rail \| fixed \| responsive"`                                                                   | Global actions open "header panels" anchored to the right edge.                                                                                                                                                               |
| Polaris `Frame`                                 | `topBar`, `navigation`, `logo`, `skipToContentTarget`, `showMobileNavigation`, `onNavigationDismiss`                                                                            | Top bar, navigation, main                                                                                              | Navigation becomes a sheet on small screens, controlled by the app                                                                                                                   | The frame also owns app-wide chrome: loading bar, toast region, "unsaved changes" bar.                                                                                                                                        |
| Material 3 navigation                           | Not a shell component: drawer + rail + top app bar + navigation bar, chosen by window size class                                                                                | —                                                                                                                      | Compact (< 600): bottom bar / modal drawer; medium (600–839): rail; expanded (≥ 840): rail or standard drawer                                                                        | The clearest statement of which navigation fits which width.                                                                                                                                                                  |

Products: header-first (GitHub, Google Cloud, Carbon) or navigation-first (Linear, Stripe, Notion: the workspace switcher sits at the top of the sidebar and the header is over main).

### Page headers

Read from the published packages on 2026-10-23.

| System                                                  | Parts                                                                                                                                                                                                                                                  | Responsive / scroll                                                                                                                                                                                                                            | Notes                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Primer `PageHeader` (`@primer/react` 38.43)             | `ContextArea` (`ParentLink`, `ContextBar`, `ContextAreaActions`), `TitleArea` (`LeadingAction`, `LeadingVisual`, `Title`, `TrailingVisual`, `TrailingAction`), `Actions`, `Description`, `Navigation`, `Breadcrumbs`                                   | Every part takes `hidden` with responsive values; the context area (parent link "← Repositories") shows on narrow only, replacing the breadcrumb                                                                                               | `TitleArea variant="subtitle \| medium \| large"`, responsive. `hasBorder`. `role` / `as` overridable. Closest model to slots. |
| Carbon `PageHeader` next (`@carbon/ibm-products` 2.101) | `BreadcrumbBar` (breadcrumb + content actions + page actions), `Content` (icon, `title`, `titleTruncate`, `contextualActions`, `pageActions`), `HeroImage`, `TabBar` (tabs + `tags` with overflow), `ScrollButton`, `TitleBreadcrumb`                  | Breadcrumb bar and tab bar stick; when the title scrolls away it reappears in the breadcrumb bar (`TitleBreadcrumb`); page actions collapse into a menu button when clipped (`menuButtonLabel`); `ScrollButton` collapses / expands the header | Observer callbacks: `onTitleClipped`, `onContentActionsClipped`, `onContentFullyCollapsed`. `titleAs` sets the heading level.  |
| Polaris `Page` (`@shopify/polaris` 13.9)                | `title`, `subtitle`, `titleMetadata` (badges), `backAction`, `primaryAction`, `secondaryActions`, `actionGroups`, `pagination` (previous / next record), `additionalMetadata`                                                                          | Secondary actions roll up into a "More actions" menu as width runs out; `compactTitle`; `fullWidth` / `narrowWidth`                                                                                                                            | `titleHidden` keeps the heading for screen readers only. `pageReadyAccessibilityLabel`.                                        |
| Atlassian `@atlaskit/page-header` 13.3                  | `breadcrumbs`, `children` (the h1), `actions`, `bottomBar` (filters, search)                                                                                                                                                                           | `truncateTitle`                                                                                                                                                                                                                                | The bottom bar is the "toolbar under the title" every list page has.                                                           |
| Material 3                                              | No page header; the top app bar (medium / large flexible) carries the title and collapses on scroll                                                                                                                                                    | Large title collapses into the small bar                                                                                                                                                                                                       |                                                                                                                                |
| Products                                                | GitHub (repo / PR header: title + `#number`, state pill, metadata line, actions, tabs), Vercel (title row then a tabs row), Stripe (record header: title, status, ID, metadata, actions), Linear (breadcrumb-style title in the main column's top bar) | Long titles wrap to two lines then truncate; a condensed sticky bar keeps title + primary action while scrolling (GitHub PRs, Stripe)                                                                                                          |                                                                                                                                |

Takeaways:

- **Shell**: five regions everywhere (banner, header, navigation, aside, main) plus an optional footer; two arrangements (header-first, navigation-first); navigation is side / rail / over by width; the toggle lives in the header but controls the shell.
- **Page header**: the same parts in every system: **context** (breadcrumb, or a parent link on narrow widths), **title** (with a leading visual and trailing status badges), **description / metadata**, **page actions** (one primary, the rest rolling up into a "More actions" menu), **navigation** (tabs), and an optional **toolbar** under it (filters, search). Carbon and GitHub add a **condensed sticky state** with the title and the primary action.
- The heading level belongs to the author (Carbon `titleAs`, Primer `as`): a page header inside a dialog or a split view is not always an `h1`.
- Page tabs usually change the URL. They are links with `aria-current`, not an ARIA `tablist` (Primer `Navigation` is a `nav`, GitHub's repo tabs are links).

## 2. What the repo does today

### Shell

Three example apps hand-build a shell from `c2-header` + `c2-side-nav`:

| App                                            | What it hand-rolls                                                                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observability-nextjs` (`AppShell.tsx`)        | Skip link, `<main id tabIndex=-1>`, a polite live region, and the navigation toggle wired through React state + `useElementProperties` + an `opened-change` listener, because the toggle sits outside `c2-side-nav`. |
| `log-lens-nextjs` (`AppHeader.tsx`)            | A sticky header only; no navigation region.                                                                                                                                                                          |
| `close-workbench-sveltekit` (`+layout.svelte`) | `c2-header` + `c2-navigation-menu` with count badges; no side navigation at all.                                                                                                                                     |

1. **The toggle cannot reach the drawer.** `side-nav-toggle` only works on elements _inside_ `c2-side-nav`; a header above it needs app state.
2. **Skip link + main landmark** are rewritten each time (`c2-skip-link` exists but nothing places it or the `<main>` target).
3. **No aside region** (details / inspector panel) and no banner region anywhere.
4. **Breakpoints follow the viewport**, so `c2-side-nav` inside a docs example frame or an iframe picks the wrong mode. A shell should size from its own width.

### Page header

27 source files under `apps/examples` contain an `<h1>` (`grep -rln "<h1" apps/examples`, build output excluded): 11 in `observability-nextjs`, 7 in `data-platform-html`, 4 in `close-workbench-sveltekit`, one in each of the other five apps. Most of them hand-build the top of `main` with the same pieces:

| Page                                                                    | What it hand-rolls                                                                                                                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observability-nextjs` `ServiceDetail.tsx`, `TraceDetail.tsx`           | `<nav aria-label="Breadcrumb">` from raw links and `" / "` spans (not `c2-breadcrumb`), a `.section-heading` with an eyebrow line, `<h1>`, a mono ID line and a status `c2-badge` |
| `observability-nextjs` services, traces, logs, alerts, dashboards pages | `.section-heading` with eyebrow + `<h1>` + description                                                                                                                            |
| `trading-dashboard-react` `App.tsx`                                     | `<h1>Positions</h1>`, a metadata line with a live badge, and a controls row (search field, sector select) beside the title                                                        |
| `support-inbox-vue` `App.vue`                                           | `<h1>Inbox</h1>` with its own layout                                                                                                                                              |

5. **No shared title block**: eyebrow / title / status / description is re-styled per app, and its spacing differs page to page.
6. **Breadcrumbs skip `c2-breadcrumb`**, so they lose its overflow collapse and `aria-current`.
7. **Actions don't roll up.** Header actions wrap under the title on narrow widths instead of folding into a menu.
8. **No condensed state**: on long pages (trace detail, service detail) the title and actions scroll away.

## 3. Accessibility

Shell:

- Landmarks: one `banner` (the slotted `c2-header`), one `navigation` per nav region with a localised name ("Main"), one `main`, optional `complementary` (aside) and `contentinfo` (footer). The shell renders them in its shadow root around the slots, so authors write none.
- Skip link first in tab order, targeting the shell's `main` (`tabindex="-1"`, focused on activation; WCAG 2.4.1). Built in, label localised, overridable through a `skip-link` slot.
- Navigation in `over` mode is a modal dialog: focus trap, Escape, backdrop click, scroll lock, focus back to the toggle. `c2-side-nav` already does all of it; share the code.
- The toggle is a button with `aria-expanded` and a name that says what it does ("Open navigation"). `aria-controls` cannot cross from a slotted header into the shell's shadow root; `aria-expanded` is enough for the disclosure pattern.
- Rail mode keeps each item's accessible name (label hidden visually, tooltip on hover / focus).
- Close the over drawer after a navigation (Vaadin's `closeDrawerOn`), so focus lands on the new page.

Page header:

- The title is an author-written heading in the default slot (`<h1>` usually). The component never renders a heading itself, so the level is always right and server rendering emits it as written.
- No landmark of its own: a `<header>` inside `main` maps to no role, which is correct. The breadcrumb keeps its own `nav` ("Breadcrumb").
- The condensed sticky bar repeats the title visually; the copy is `aria-hidden` so screen readers do not read the title twice.
- The "More actions" button is an APG menu button (`c2-menu`), named "More actions" (localised). Items moved into it keep their own names.
- On narrow widths the parent link replaces the breadcrumb; its name is the parent page ("Back to Batches").
- Page tabs that navigate are links with `aria-current="page"`; tabs that switch panels in place are `c2-tabs`.
- Status badges after the title are part of its visible text, not of the heading's name, unless the author puts them inside the heading.

## 4. What c2 already has

| Need                                                                                                         | Existing piece                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Drawer side / over, focus trap, Escape, scroll lock, rail via `--c2-side-nav__close--width`, `opened-change` | `c2-side-nav`. Extract its drawer logic into a controller the shell reuses for both start and end panels. |
| Header bar                                                                                                   | `c2-header` (brand / default / actions / mobile-trigger slots, `sticky`, `blurred`), `c2-navigation-menu` |
| Skip link                                                                                                    | `c2-skip-link`                                                                                            |
| Banner strip                                                                                                 | `c2-banner`                                                                                               |
| Breadcrumb with overflow                                                                                     | `c2-breadcrumb` (collapses behind an ellipsis by priority, `max-items`, `aria-current`)                   |
| Status next to the title                                                                                     | `c2-badge`                                                                                                |
| Primary action with alternates                                                                               | `c2-split-button`, `c2-button`                                                                            |
| "More actions" menu                                                                                          | `c2-menu` / `c2-menu-item`                                                                                |
| Page tabs                                                                                                    | `c2-tabs` (in-place panels), `c2-navigation-menu` / `c2-link-button` (links)                              |
| Metadata row                                                                                                 | `c2-description-list`, `c2-relative-time`, `c2-avatar`                                                    |
| Title clamp                                                                                                  | `c2-truncate` (`--c2-truncate__content--line-clamp`)                                                      |
| Previous / next record                                                                                       | `c2-pagination` (or two `c2-icon-button`s)                                                                |
| Toolbar under the title                                                                                      | `c2-search-field`, `c2-filter-builder`, `c2-view-options`, `c2-button-group toolbar`                      |
| Breakpoints                                                                                                  | `Breakpoints` in `@c2n/core` (600 / 960)                                                                  |

No component in the repo lays out a page title block (`grep -rn "page-header" packages` finds only the roadmap row).

## 5. Recommendation

- **`c2-app-shell`**: a layout element with slots `banner`, `header` (a `c2-header`), `navigation`, `navigation-header`, `navigation-footer`, `aside`, `footer` and the default slot for main. Behaviour attributes: `layout="header-first | navigation-first"`, `navigation-opened`, `aside-opened`, `desktop-mode` / `tablet-mode` (`side | rail | over`), `scroll="page | main"`, `close-on-navigate`. Breakpoints from the host's own width. Toggles: any descendant with `app-shell-toggle="navigation | aside"`, including a button in the slotted `c2-header`, so no script is needed. Sizes, colours and dividers are `--c2-app-shell__*` variables. `c2-side-nav` stays as the lighter "drawer + content" primitive; both share one drawer controller in `@c2n/core`.
- **`c2-page-header`**: slots `breadcrumb`, `parent` (the narrow-width back link), `leading`, default (the author's heading), `title-suffix` (status badges), `description`, `meta`, `actions`, `navigation` (tabs) and `toolbar`. Behaviour: `sticky` with a condensed state once the title scrolls out (`condensed` reflects it, `condensed-change` fires), and actions that roll up into a "More actions" menu when they do not fit, keeping the one marked `primary` (`overflow-priority` on the others decides the order). Layout from its own width: actions move under the title below 600px, the parent link replaces the breadcrumb. Spacing, title size and dividers are `--c2-page-header__*` variables mapped to the theme's font sizes and spacing.
- The page header does not depend on the shell: it works in any page, a dialog or a split panel. Inside a shell with a sticky header, its sticky offset is the header height (`--c2-page-header--sticky-top`).

## 6. Open questions

Shell:

1. Container width or viewport for breakpoints? Container is more correct (iframes, docs frames, split views) but differs from `c2-side-nav`. Breakpoints switch behaviour, so they may need to be attributes.
2. Bottom navigation on phones: a `navigation-placement="bottom"` mode, or `c2-bottom-nav` (roadmap #66) in the `footer` slot? Proposal: the latter.
3. Remember the user's side / rail choice (`storage-key`, like `c2-theme-select`)?

Page header:

4. Roll-up of actions: build it inside `c2-page-header`, or build `c2-overflow-list` (roadmap #62) first and use it there?
5. Derive the narrow-width parent link from the breadcrumb's second-to-last item, or require the `parent` slot? Deriving saves markup but cannot know a better label.
6. Who owns the condensed sticky bar when a page has tabs: the title row condenses and the tabs stay (Carbon), or both condense into one row (GitHub)?
7. A previous / next record control (Polaris `pagination`): an `actions` item, or a named slot?
