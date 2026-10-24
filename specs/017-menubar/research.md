# Research: `c2-menubar`

Roadmap #61 (section D, P2). Collected 2026-10-24 before design. Mock: [c2-menubar mock](https://claude.ai/artifact/NyfGoAa6vRShtwFJMLtjQi) (anatomy and trigger states, looks, a document editor and a dark code-editor title bar, the keyboard map).

## 1. Prior art

Sources were read from the projects' repositories (`raw.githubusercontent.com`); their documentation sites were not reachable from the research environment.

| System                        | Shape                                                                                                    | Notes                                                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WAI-ARIA APG (editor example) | `menubar` > `menuitem` (`aria-haspopup`, `aria-expanded`) > `menu`; roving `tabindex`, one Tab stop      | The keyboard contract below. Hosts between the menubar and its items are `role="none"` (`<li role="none">`).                                                                                               |
| Radix `Menubar`               | `Root` > `Menu` > `Trigger` + `Content`; `value`/`onValueChange` (open menu), `loop` (default on), `dir` | Pointer-enter on a trigger opens it while another menu is open. ArrowLeft/Right in content moves to the neighbouring menu and focuses its first item.                                                      |
| Mantine `Menubar` (9.x)       | `Menubar` > `Menubar.Menu` > `Target` + `Dropdown`; `openIndex`, `trigger: 'click' \| 'hover'`, `loop`   | `click` is the desktop pattern: click opens, then hover switches. A 120 ms close delay for `hover`.                                                                                                        |
| PrimeVue `Menubar`            | Model-driven (`model` array); `breakpoint` collapses to a hamburger `menubutton`                         | `aria-activedescendant` focus rather than roving tabindex. Mobile collapse is a separate concern in c2 (`c2-overflow-list`, roadmap #62).                                                                  |
| Products                      | Google Docs, VS Code for the Web, Figma                                                                  | Docs: flat, compact bar under the document title, View has checkbox rows and radio groups. VS Code: square triggers in a dark title bar with a centred title. Both switch menus on hover once one is open. |

Takeaways:

- Every system composes a menubar from "a menu per trigger", which c2 already has as `c2-menu`. The component's own work is the bar: one Tab stop, the arrow keys across it, the open state that travels with hover and with ArrowLeft/Right inside a menu.
- Declarative children beat a `model` array here: `c2-menu-item` already covers checkbox/radio rows, shortcuts, descriptions and submenus.
- Click-then-hover is the common default; a hover-only mode is rarely used in apps and is left out.

## 2. Accessibility

- APG keyboard on the bar: ArrowLeft/Right (wrapping), Home/End, a letter, Enter/Space/ArrowDown open on the first item, ArrowUp on the last.
- In a menu: ArrowRight opens a submenu or moves to the next bar menu; ArrowLeft closes a submenu or moves to the previous bar menu; Escape closes and returns focus to the trigger. Right-to-left mirrors the arrows.
- The trigger is a native `<button role="menuitem">` in the shadow root, so `aria-haspopup`/`aria-expanded` sit on the element that has the role (c2-menu already writes them on its slotted trigger). The `c2-menubar-menu` host is `role="none"` through `ElementInternals`, and the menu's name goes in as a property: an `aria-label` attribute on the inner `c2-menu` host made axe report `aria-required-children` on the menubar.
- Disabled bar menus: APG keeps disabled items focusable; here the arrows skip them (as `c2-menu` skips disabled rows), and the trigger carries `aria-disabled`.

## 3. What c2 already has

| Need                                   | Existing piece                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Menu surface, rows, submenus, keyboard | `c2-menu` + `c2-menu-item` + `c2-menu-row`; top-layer popover through `c2-overlay`, flip, light dismiss, focus return.                           |
| Re-slotting rows from a wrapper        | `c2-split-button` renders `c2-menu` in its shadow root with `<slot>` inside it; `c2-menu` reads rows with `assignedElements({ flatten: true })`. |
| Site-level menus                       | `c2-navigation-menu` (links and panels, not commands) — the docs page points at it for site navigation.                                          |

Two `c2-menu` gaps surfaced while building it and were fixed in the same change: ArrowRight on a plain row of a submenu reopened that submenu (now it bubbles on to the bar), and `c2-menu` crashed under a server render (`querySelector` in `willUpdate`) and on a `defer-hydration` upgrade (`renderRoot` read before it exists).
