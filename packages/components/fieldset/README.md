# Fieldset

`c2-fieldset` groups related controls under a legend, like a native `<fieldset>`: the legend names the group for
assistive technology, `description` and `error-text` describe it, `required` marks the legend and `disabled` disables
every control inside. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/fieldset'
```

```html
<c2-fieldset legend="Notifications" description="Choose what we email you about.">
  <c2-checkbox name="notify" value="mentions">Mentions and replies</c2-checkbox>
  <c2-checkbox name="notify" value="digest">Weekly digest</c2-checkbox>
</c2-fieldset>
```

Layout and the box are CSS custom properties: `--c2-fieldset__content--direction: row` lays the controls out in a
row, `--c2-fieldset--border: none` and `--c2-fieldset--padding: 0` give a bare group. See the API tab of the docs for
every slot, part and variable.
