# @c2n/code-editor

Source-code field built with Lit on **CodeMirror 6**, which is an _optional_ peer dependency: nothing is imported until an editor mounts, and without it the element degrades to a plain `<textarea>` with the same value, events and form behaviour.

```bash
npm install @c2n/code-editor
# the engine, installed alongside — only the grammars you need
npm install @codemirror/state @codemirror/view @codemirror/commands @codemirror/language \
  @codemirror/autocomplete @codemirror/search @lezer/highlight @codemirror/lang-javascript
```

```html
<script type="module">
  import '@c2n/code-editor'
</script>

<c2-code-editor label="Handler" language="javascript" line-numbers autocomplete value="export const answer = 42"></c2-code-editor>
```

- **Value**: `value` is the document; assigning it replaces the text without losing scroll position or undo history, and is silent — only a user edit fires `input`, with `change` on the blur that follows, as a native control does.
- **Forms**: form-associated. `name` and `value` are submitted, `required` sets `valueMissing`, `checkValidity()` / `setCustomValidity()` work, and reset restores the `value` **attribute** — the same `defaultValue` contract a native control has.
- **Languages**: `javascript`, `typescript`, `jsx`, `tsx`, `html`, `css` and `json` have built-in loaders, each its own dynamic import. Anything else comes from the `languageLoader` property, so adding Python or SQL costs this package no dependency. An empty `language` is a plain editor with no highlighting.
- **Behaviour**: `line-numbers`, `wrap`, `autocomplete`, `tab-size`, `placeholder`, `readonly` and `disabled` are all live — each is its own CodeMirror `Compartment`, so toggling one never rebuilds the document.
- **Engine**: `ready` resolves once the engine settles and `engine` reads `codemirror` or `basic`; the `ready` event carries the same. The fallback textarea is not a second editor — it has no highlighting, no gutter and no bracket matching.
- **Events**: the editor's `contenteditable` fires native composed `input` / `beforeinput`, which are stopped at the component boundary so a consumer sees exactly one `input` per edit and none for an edit `readonly` rejected.
- **Accessibility**: the editable element carries `role="textbox"` with the label as its accessible name, plus `aria-readonly` and `aria-disabled`. The default token palette meets WCAG AA on both the surface and the active-line tint.

**Theming is plain CSS.** CodeMirror renders real DOM inside the shadow root, so there is no JavaScript theme: the frame, gutter, selection, cursor and the whole syntax palette are `--c2-code-editor__*` custom properties, and the token names (`--c2-code-editor__theme--token-keyword`, `…-string`, `…-comment`, …) match `@c2n/code-viewer`'s `css-variables` theme so one palette can drive the viewer and the editor. Dark mode is different variable values and nothing else:

```css
.midnight {
  --c2-code-editor--background: #0d1117;
  --c2-code-editor--color: #c9d1d9;
  --c2-code-editor--border: 1px solid #30363d;
  --c2-code-editor__theme--token-keyword: #ff7b72;
  --c2-code-editor__theme--token-string: #a5d6ff;
  --c2-code-editor__theme--token-comment: #8b949e;
}
```

The full list is in `custom-elements.json` and on the docs site.
