# Styling property migration

## `c2-color-slider`

| Old property                       | Replacement                                                                                                                                                                                                        | Reason                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--c2-color-slider--borde-leftr`   | `--c2-color-slider--border-left`                                                                                                                                                                                   | The old spelling was documented but never consumed by the gradient's left border. Replace it immediately; there is no compatibility alias. |
| `--c2-color-slider--border-radius` | Four corner properties: `--c2-color-slider--border-top-left-radius`, `--c2-color-slider--border-top-right-radius`, `--c2-color-slider--border-bottom-left-radius`, `--c2-color-slider--border-bottom-right-radius` | The shorthand was documented but never consumed. Use the individual corner controls to retain the intended shape.                          |

These corrections affect the next release containing this feature. Search application styles, theme overrides, presets, and exported configurations for the old names before upgrading.

## Chart family (`@c2n/chart`)

No chart variable was renamed or removed. Six mark variables are no longer documented on the chart types that never draw that mark; setting them there was always a no-op, so nothing changes visually.

| Property                              | Now documented on                                                                                                                                                       | No longer documented on                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--c2-chart__line--width`             | `c2-line-chart`, `c2-area-chart`, `c2-sparkline`, `c2-radar-chart`                                                                                                      | every other chart                                                                         |
| `--c2-chart__point--radius`           | `c2-line-chart`, `c2-area-chart`, `c2-radar-chart`                                                                                                                      | every other chart                                                                         |
| `--c2-chart__area--opacity`           | `c2-area-chart`, `c2-radar-chart`, `c2-sparkline` (`type="area"`, default `0.18`)                                                                                       | every other chart                                                                         |
| `--c2-chart__bar--border-radius`      | `c2-bar-chart`, `c2-butterfly-chart`                                                                                                                                    | every other chart                                                                         |
| `--c2-chart__grid--width`             | `c2-line-chart`, `c2-area-chart`, `c2-bar-chart`, `c2-sparkline`, `c2-bubble-chart`, `c2-butterfly-chart`, `c2-candlestick-chart`, `c2-radar-chart`, `c2-scatter-chart` | gauge, map, overlap, pie and pyramid charts                                               |
| `--c2-chart__series__dimmed--opacity` | every chart except the two below                                                                                                                                        | `c2-candlestick-chart`, `c2-overlap-chart` (which has `--c2-chart__set__dimmed--opacity`) |

Previously documented but inert, now applied: `--c2-chart__grid--width` (it was hard-coded to 1px in both engines), `--c2-chart__axis-line--color` (the uPlot charts' axis ticks, which used `--c2-chart__grid--color`; both default to `#e4e4e7`), `--c2-chart__tone-positive--color` / `--c2-chart__tone-negative--color` (the sparkline used `--c2-chart__positive--color` / `--c2-chart__negative--color`, which remain the fallback) and `--c2-chart__area--opacity` on an area sparkline (its fill was a fixed `0.18`, now the variable's default).

## `c2-text-field` host state classes

No variable changed. The host no longer carries the `.focus-within`, `.error`, `.read-only` and `.disabled` classes the component used to toggle on it (writing `class` on the host made server-rendered markup differ from the hydrated element). They are custom states now:

| Old selector                 | Replacement                                                           |
| ---------------------------- | --------------------------------------------------------------------- |
| `c2-text-field.focus-within` | `c2-text-field:state(focus-within)` (or `c2-text-field:focus-within`) |
| `c2-text-field.error`        | `c2-text-field:state(error)`                                          |
| `c2-text-field.read-only`    | `c2-text-field:state(read-only)`                                      |
| `c2-text-field.disabled`     | `c2-text-field:state(disabled)`                                       |

## `c2-list` host classes and `c2-list-item` join attributes

No variable changed. `c2-list` no longer toggles `.padding-top-0` / `.padding-bottom-0` classes on its own host, and no longer writes `joined-before` / `joined-after` attributes on its rows (both happened on the first render, so a server-rendered list differed from the hydrated one, and a framework that owns `class` wiped the classes). They are custom states now. `c2-list-item` still accepts `joined-before` / `joined-after` as attributes (that is how `c2-virtual-list` sets them); the list sets the `joinedBefore` / `joinedAfter` properties instead.

| Old selector                  | Replacement                         |
| ----------------------------- | ----------------------------------- |
| `c2-list.padding-top-0`       | `c2-list:state(padding-top-0)`      |
| `c2-list.padding-bottom-0`    | `c2-list:state(padding-bottom-0)`   |
| `c2-list-item[joined-before]` | `c2-list-item:state(joined-before)` |
| `c2-list-item[joined-after]`  | `c2-list-item:state(joined-after)`  |

## `c2-tabs` slot assignment and `c2-tab[selected]`

No variable changed. `c2-tab` no longer writes `slot="tab"` on itself, and `c2-tabs` no longer writes `slot="tab-content"` on the selected panel: the strip's shadow root uses manual slot assignment and assigns its `c2-tab` children and the selected panel itself. Markup that already carries `slot="tab"` / `slot="tab-content"` keeps working (the attributes are ignored). A server-rendered (declarative shadow DOM) strip, whose shadow root is always in named mode, falls back to writing `slot` as before. `selected` on `c2-tab` is no longer reflected; it is the custom state `selected`.

| Old selector                                 | Replacement                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `c2-tab[selected]`                           | `c2-tab:state(selected)`                                                   |
| `c2-tab[slot='tab']`, `[slot='tab-content']` | `c2-tabs > c2-tab`; the visible panel is `c2-tabs > [id='<selected-tab>']` |

## `c2-timeline-item` position attributes

No variable changed. `c2-timeline-item` no longer writes the `last` and `split` attributes on itself (the timeline set them while the page upgraded); they are custom states.

| Old selector              | Replacement                     |
| ------------------------- | ------------------------------- |
| `c2-timeline-item[last]`  | `c2-timeline-item:state(last)`  |
| `c2-timeline-item[split]` | `c2-timeline-item:state(split)` |

## `c2-menu` host attributes

No variable changed. `c2-menu` no longer writes `has-trigger` on its host (now a custom state), no longer writes `placement="right-start"` on a submenu (the default is applied without touching the attribute), and no longer reflects `reserve-indicator` onto its rows (`reserveIndicator` is still accepted as a property or attribute).

| Old selector                                       | Replacement                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `c2-menu[has-trigger]`                             | `c2-menu:state(has-trigger)`                                     |
| `c2-menu[slot='submenu'][placement='right-start']` | `c2-menu[slot='submenu']:not([placement])`                       |
| `c2-menu-item[reserve-indicator]`                  | none: style a checkable row by `c2-menu-item:not([type='item'])` |

## `c2-step` host attributes and reflection

No variable changed. `c2-step` no longer writes `entering`, `settling`, `last`, `marker`, `grouped` or `has-children` on its own host (the parent `c2-steps` wrote `entering`, the step the rest), no longer sets an inline `--level` style on the host (the indent is set inside the shadow root), and no longer reflects `status` or `collapsed`: the list rolls a status up onto a group that authored none, and a reflected value was an attribute the server never rendered. An authored `status` or `collapsed` attribute still works; read the live value from the property or the state. They are custom states now:

| Old selector                                         | Replacement                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `c2-step[status='<status>']` (when rolled up or set) | `c2-step:state(<status>)` (`pending`, `running`, `current`, `success`, `error`, `warning`, `skipped`) |
| `c2-step[collapsed]` (after a toggle or reopen)      | `c2-step:state(collapsed)`                                                                            |
| `c2-step[last]`                                      | `c2-step:state(last)`                                                                                 |
| `c2-step[grouped]`                                   | `c2-step:state(grouped)`                                                                              |
| `c2-step[has-children]`                              | `c2-step:state(has-children)`                                                                         |
| `c2-step[marker='icon']`                             | `c2-step:state(marker-icon)`                                                                          |
| `c2-step[marker='number']`                           | `c2-step:state(marker-number)`                                                                        |
| `c2-step[marker='none']`                             | `c2-step:state(marker-none)`                                                                          |
| `c2-step[entering]`                                  | `c2-step:state(entering)`                                                                             |
| `c2-step[settling]`                                  | `c2-step:state(settling)`                                                                             |

## Chart readiness attributes and `c2-chart-tooltip` visibility

No variable changed. Every `c2-*-chart` / `c2-sparkline` no longer writes `data-chart-ready` and `data-chart-engine` on its host once the engine has drawn, and `c2-chart-tooltip` no longer toggles `hidden` on itself (it did so from its constructor, so `document.createElement('c2-chart-tooltip')` threw). The `chart-ready` event is unchanged.

| Old selector                                    | Replacement                          |
| ----------------------------------------------- | ------------------------------------ |
| `c2-line-chart[data-chart-ready]`               | `c2-line-chart:state(ready)`         |
| `el.hasAttribute('data-chart-ready')`           | `el.matches(':state(ready)')`        |
| `c2-line-chart[data-chart-engine='uplot']`      | `c2-line-chart:state(engine-uplot)`  |
| `c2-pie-chart[data-chart-engine='echarts']`     | `c2-pie-chart:state(engine-echarts)` |
| `c2-chart-tooltip:not([hidden])`                | `c2-chart-tooltip:state(open)`       |
| `c2-chart-tooltip[hidden]` (set by the tooltip) | `c2-chart-tooltip:not(:state(open))` |

## `c2-avatar-group` hidden avatars

No variable changed. `c2-avatar-group` no longer writes `data-c2-avatar-group-hidden` on the slotted `c2-avatar` elements that do not fit; it sets the avatar's `groupHidden` property, which the avatar exposes as a custom state.

| Old selector                             | Replacement                     |
| ---------------------------------------- | ------------------------------- |
| `c2-avatar[data-c2-avatar-group-hidden]` | `c2-avatar:state(group-hidden)` |
