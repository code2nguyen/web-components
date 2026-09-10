# @c2n/radio

Radio built with Lit: `c2-radio` options on native `<input type="radio">` elements, and a `c2-radio-group` that turns them into one control with a single value, one name and native-style keyboard navigation.

```bash
npm install @c2n/radio
```

```html
<script type="module">
  import '@c2n/radio'
</script>

<c2-radio-group name="plan" value="pro">
  <span slot="label">Plan</span>
  <c2-radio value="free">Free</c2-radio>
  <c2-radio value="pro">Pro<span slot="description">Unlimited projects</span></c2-radio>
  <c2-radio value="team" disabled>Team</c2-radio>
</c2-radio-group>
```

- **Group**: `value` is the checked option's value (set it to select from code), `name` applies to every option, `disabled` disables them all, `orientation="horizontal"` lays them out in a row. It fires one `change` (`detail.value`) per user selection and swallows the options' own `change` events. `role="radiogroup"` is named by the `label` slot or `aria-label`.
- **Keyboard**: Arrow keys move and select (wrapping, disabled options skipped), Space checks the focused option, and only the checked option is a tab stop, exactly like native radios.
- **Option**: `value`, `checked`, `disabled`, `label` (or slotted text) and a `description` slot. Options can be nested in wrapper elements inside the group. Standalone options sharing a `name` in the same root uncheck each other.
- **Indicator**: `--c2-radio__control--border-radius` reshapes the ring (square at `4px`); the `dot` slot replaces the filled dot with a mark such as a check; `icon` and `checked-icon` replace the whole control with an icon per state (`--c2-radio__icon--color`, `--c2-radio__icon__checked--color`, `--c2-radio__icon--size`). With only `icon` the same icon shows in both states and recolours; with only `checked-icon` the ring stays while unchecked.
- **Forms**: the inputs live in shadow roots and are not submitted with a surrounding form; read `value` from the group or mirror it into a hidden input.

Import `@c2n/radio` for both elements, or `@c2n/radio/radio.js` for the option alone. Every visual aspect is a CSS custom property: `--c2-radio__control--*` and `--c2-radio__dot--*` for the circle (an accent border with a transparent fill gives the outlined look), `--c2-radio__label--*` / `--c2-radio__description--*` for the text, `--c2-radio__container--*` for the row (border, padding and checked background make card-style options), and `--c2-radio-group--*` for spacing and the header. Variables set on the group inherit into every option. The full list is in `custom-elements.json` and on the docs site.
