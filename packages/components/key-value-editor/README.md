# Key Value Editor

`c2-key-value-editor` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/key-value-editor'
```

```html
<c2-key-value-editor label="Environment variables" masked entries='[{"key":"API_URL","value":"https://api.example.com"}]'></c2-key-value-editor>
```

Editable `KEY=value` rows, the environment-variable form of Vercel, Netlify and Supabase:

- **Paste a `.env`** into any key field and it splits into rows; a key that already has a row has its value updated.
- **`masked`** hides values behind a password field with a show/hide toggle per row (`masked: false` on an entry opts it out).
- **Validation**: duplicate keys and keys that do not match `key-pattern` are marked with a message under the row.
- **Forms**: with `name`, the rows are submitted as `.env` text; `required` needs at least one keyed row.
- **Keyboard**: Enter moves from a key to its value and on to the next row (adding one after the last); Backspace in an empty key field removes the row.

`entries` (an array of `{ key, value, masked? }`) is replaced on every edit; listen for `input` or `change`. `toEnv()` returns the rows as `.env` text, and the module also exports `parseEnv(text)` and `formatEnv(entries)`.

Style it through the `--c2-key-value-editor*` custom properties listed in `custom-elements.json`.
