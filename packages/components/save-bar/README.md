# Save Bar

`c2-save-bar` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/save-bar'
```

```html
<form>…</form>
<c2-save-bar shortcut warn-on-leave></c2-save-bar>
```

A floating bar that appears while a form has unsaved changes: "Unsaved changes", then Discard and Save. The app owns
the changes: set `open` while there are some, handle `save` and `discard`, set `saving` while the save runs and
`invalid` while the changes cannot be saved. `shortcut` makes Ctrl+S / ⌘S fire `save`; `warn-on-leave` asks before
the page is closed with unsaved changes. Extra actions go in the default slot; the `message` slot replaces the text.

Theme it through the `--c2-save-bar__*` custom properties listed on the
[API page](https://code2nguyen.github.io/web-components/components/save-bar/api).
