# Emoji Picker

`c2-emoji-picker` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/emoji-picker'
```

```html
<c2-emoji-picker storage-key="my-app-emoji"></c2-emoji-picker>
```

A searchable grid of emoji in categories, with a skin-tone choice and the emoji used last, like the pickers of Slack, GitHub
and Discord. Picking one fires `emoji-select` with `detail.emoji` (in the chosen skin tone), `detail.base`, `detail.name`
and `detail.skinTone`; the picker inserts and closes nothing itself.

- `query` searches the names and keywords; `skin-tone` (0–5) applies a tone to emoji that have one.
- `recents` lists the emoji used last, first (`max-recents`, 18 by default); `storage-key` keeps them and the skin tone
  in `localStorage`.
- `emojis` replaces the default set (Unicode emoji up to 15.1, English names, from Emojibase) with `{ emoji, name, group,
keywords, skins }` entries of your own.
- Themed through `--c2-emoji-picker*` custom properties; see the API page of the docs site.

The default set is generated from `emojibase-data` by `npm run generate -w packages/components/emoji-picker`.
