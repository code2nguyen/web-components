# Research: `c2-bottom-nav`

Roadmap #66 (section D, P2). Collected 2026-10-24 before design. Mock: [c2-bottom-nav mock](https://claude.ai/artifact/YM7h3MdDLDoDLYbmbuexxj) (anatomy, looks, label modes, states, in-context phone screens and an interactive prototype with hide-on-scroll and an event log).

## 1. Prior art

| System                                        | Shape                                                                                                                   | Selection and labels                                                                                                     | Notes                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Material 3 navigation bar                     | Full-width bar, 3–5 destinations, icon over label; pill active indicator behind the icon; filled icon when selected     | `labelVisibilityMode`: `auto` (all labels with ≤ 3 items, selected only with 4+), `selected`, `labeled`, `unlabeled`     | M3: 80dp bar, 64×32 indicator. M3 Expressive: 64dp bar, 56×32 indicator, label no longer bold, items turn horizontal (icon start) at ≥ 600dp. `setOnItemReselectedListener` for a tap on the current item. [Android docs](https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/BottomNavigation.md) |
| Apple tab bar (iOS 26)                        | Floating Liquid Glass bar over content; up to 5 tabs on iPhone, "More" beyond; separate search tab on the trailing edge | Always labelled; selected tab tinted, no indicator shape                                                                 | `tabBarMinimizeBehavior = .onScrollDown`: shrinks while scrolling down, expands on scroll up. HIG: tab bars are navigation, not actions; never disable or hide a tab, keep badges for critical information. [WWDC25 284](https://developer.apple.com/videos/play/wwdc2025/284/)                                                                         |
| Vant `van-tabbar`                             | Fixed bar, `placeholder` element so content is not covered, `safe-area-inset-bottom`                                    | `v-model` + `change`; `before-change(name)` may return `false` or a promise to block; item `dot` / `badge`; `route` mode | Colours are props (`active-color`, `inactive-color`), height 50px, icon 22px. [README](https://raw.githubusercontent.com/youzan/vant/main/packages/vant/src/tabbar/README.md)                                                                                                                                                                           |
| Ionic `ion-tab-bar` / `ion-tab-button`        | Lives in `ion-tabs` (a router outlet), `slot="bottom"`; `layout` = icon-top / icon-start / label-hide …                 | `selected`, badge child, `href`                                                                                          | Renders `role="tab"` on the anchors even though they navigate: the pattern the a11y sources below warn against. Hides itself while the on-screen keyboard is open. [source](https://raw.githubusercontent.com/ionic-team/ionic-framework/main/core/src/components/tab-button/tab-button.tsx)                                                            |
| MDUI `mdui-navigation-bar` (web component)    | Bar + `mdui-navigation-bar-item`                                                                                        | `value` + `change`; `label-visibility` like M3                                                                           | `scroll-behavior="hide"` with `scroll-target` / `scroll-threshold`; cancelable `hide` / `show` events. No ARIA roles, no keyboard handling.                                                                                                                                                                                                             |
| Telerik / Kendo BottomNavigation              | `<nav>` with a list of link items                                                                                       | `aria-current` on the selected item                                                                                      | Documented a11y spec: navigation landmark, links, Tab moves between items. [a11y](https://www.telerik.com/design-system/docs/components/bottomnavigation/accessibility/)                                                                                                                                                                                |
| Spectrum, Carbon, Polaris, Fluent web, Ant v6 | No component (desktop-first systems)                                                                                    | —                                                                                                                        | Ant Design Mobile has `TabBar` (`safeArea`, `badge` with `Badge.dot`).                                                                                                                                                                                                                                                                                  |

Takeaways:

- Everyone agrees on the anatomy: icon over a short label, a selected state that changes more than colour (indicator shape and/or filled icon), a count or dot badge on the icon, 3–5 destinations.
- The two native looks differ only in presentation: Material's pill indicator on an opaque surface, Apple's tint on a translucent floating bar. In c2 both are CSS presets on one element.
- The bar is the app's primary navigation. Two things only a component gets right every time: the safe-area inset under the home indicator, and the minimise-on-scroll behaviour.
- "Reselect" (tap the current tab again to scroll to top or pop to the root) is in both native platforms and none of the web libraries.

## 2. Accessibility

- A bar whose items change the page (route or view) is a **navigation landmark with links**, the current one announced with `aria-current="page"`. Not a tablist: `role="tab"` promises a panel on the same page and arrow-key navigation, which a destination bar has neither of (Telerik a11y spec; Ionic is the counter-example).
- Keyboard: each item is a normal tab stop, Enter activates. No roving tabindex.
- The landmark needs a name when the page has another `nav` (the header's): default "Main", localised, overridable with `aria-label` on the host.
- The selected state must not be colour-only (WCAG 1.4.1): indicator shape, filled icon or weight change. All three presets keep one of them.
- Badges must be in the accessible name: "Inbox, 3 new", "Chat, new activity". A visual-only red dot is invisible to a screen reader.
- Hidden labels (`unlabeled`, or non-selected with `selected`) stay the accessible name, visually hidden.
- Minimise-on-scroll must not hide the bar from keyboard users: focus entering the bar brings it back, and reduced motion drops the slide.
- Touch target at least 48px tall (M3), items share the width equally.

## 3. States and edge cases seen

- Selected, unselected, hover / pressed state layer, focus ring, badge (count, `99+`, dot).
- Disabled tabs: Vant and Ionic have them, Apple's HIG says never. Not adopted (a destination that cannot be opened explains why on its own page).
- More than five destinations: Apple's "More" tab, M3 says use a rail or drawer. Out of scope; the docs show a "More" item opening a `c2-sheet`.
- Blocking a switch (Vant `before-change`, e.g. unsaved changes): a cancelable event covers it.
- Placement: Vant `fixed` + `placeholder`. CSS `position: sticky; bottom: 0` as the last child of the page sticks to the viewport bottom without covering the end of the content, so no placeholder is needed; `fixed` stays one variable away.
- On-screen keyboard (Ionic hides the bar): with a sticky bar the visual viewport already handles it; not adopted.
- Wide windows: M3 swaps to a rail at 600dp, or lays items horizontally. That is a media query in the app (or the app shell), plus a variable for the horizontal item layout.

## 4. What c2 already has

| Need                                   | Existing piece                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Count / dot badge, `99+`, ring, tones  | `c2-badge` (`count`, `max`, `dot`, `tone="danger"`, `--c2-badge__*`). Rendered inside the item's shadow root, `aria-hidden`; the accessible text is a localised message. |
| Link semantics, `aria-current="page"`  | `c2-navigation-menu-item` (`href`, `target`, `current`): same shape, same names.                                                                                         |
| Host semantics without host attributes | `ElementInternals` (`role`, `ariaLabel`) and custom states (`:state(current)`), as `c2-tab` does.                                                                        |
| Localised text                         | `defineMessages` / `LocalizeController` from `@c2n/core/localize.js`.                                                                                                    |
| Where it goes                          | `c2-app-shell` spec (016) reserves its `footer` slot for `c2-bottom-nav` and drops a `navigation-placement="bottom"` mode in its favour.                                 |

No component in the repo draws a bottom tab bar (`grep bottom-nav` → only the roadmap row and the app-shell spec).
