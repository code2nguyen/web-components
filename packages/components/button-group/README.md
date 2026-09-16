# @c2n/button-group

Button group built with Lit: attach `c2-button` / `c2-icon-button` items into one joined control or a polished segmented selector.

```bash
npm install @c2n/button-group
```

```html
<script type="module">
  import '@c2n/button-group'
</script>

<c2-button-group>
  <c2-button>Save</c2-button>
  <c2-button>Publish</c2-button>
</c2-button-group>

<c2-button-group selection="single" value="week">
  <c2-button value="day">Day</c2-button>
  <c2-button value="week">Week</c2-button>
  <c2-button value="month">Month</c2-button>
</c2-button-group>

<c2-button-group appearance="segmented" size="m" value="week">
  <c2-button value="day">Day</c2-button>
  <c2-button value="week">Week</c2-button>
  <c2-button value="month">Month</c2-button>
</c2-button-group>
```

- **Layout**: items share borders and only the outside corners are rounded (`--c2-button-group--border-radius`); a divider (`--c2-button-group__divider--width` / `--color`) separates them. `--c2-button-group--border` puts one border on every item for an outlined group. A positive `--c2-button-group--gap` separates the items into individually rounded buttons. `orientation="vertical"` stacks them.
- **Segmented**: `appearance="segmented"` provides an inset track and animated single-selection indicator. It selects the first enabled item by default, supports `size="s|m|l"`, and can fill its container with `stretched`.
- **Selection**: `selection="single"` keeps exactly one item pressed, `selection="multiple"` toggles items independently. Items identify themselves with `value` (their index otherwise); the group's `value` is the pressed value or a comma-separated list. `change` fires on pointer or keyboard selection with `detail.value`; setting `value` from code is silent.
- **Accessibility**: `role="group"` (name it with `aria-label`); pressed items carry `selected`, which `c2-button` and `c2-icon-button` announce as `aria-pressed`. Single selection supports Arrow, Home and End keys and skips disabled items.
- **Disabled**: `disabled` on the group disables every item and restores them when cleared, leaving items you disabled yourself alone.

Colours and sizes come from the buttons' own variables set on the group (`--c2-button__container--*`, including the `__selected--*` pressed state added for groups; `--c2-icon-button--*` for icon items). `--c2-button-group__item--flex: 1 1 0` makes every item the same width. The full list is in `custom-elements.json` and on the docs site.
