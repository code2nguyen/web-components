# Rich Text Editor

A compact formatted-text field for comments, replies, email bodies and short descriptions: bold, italic, underline, strikethrough, inline code, links, bulleted and numbered lists, quotes and code blocks. For long documents with headings, tables, colours and images, use `c2-page-editor`. Built on ProseMirror, sharing `c2-page-editor`'s editing core.

`c2-rich-text-editor` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/rich-text-editor'
```

```html
<c2-form-field label="Reply">
  <c2-rich-text-editor name="body" placeholder="Leave a comment…" maxlength="2000">
    <c2-button slot="footer-end" type="submit">Comment</c2-button>
  </c2-rich-text-editor>
</c2-form-field>
```

- `formats` chooses the toolbar buttons, their order and groups (`"bold italic | link | bullet ordered"`), and limits what shortcuts, typed Markdown and paste may produce. Empty allows all of `bold italic underline strike code link bullet ordered quote code-block`.
- `toolbar-position`: `top` (default), `bottom` (in the footer, after `footer-start`), `floating` (over selected text; at the bottom on touch screens) or `none`. Buttons that do not fit move into a "More" menu.
- `value` is GitHub-flavoured Markdown (`<u>` for underline), `''` when empty. `toHTML()` returns `p br strong em u s code pre a ul ol li blockquote` HTML for an email body.
- Form control: `name`, `required`, `maxlength` (counts text characters; shows a counter; invalid past it), `readonly`, `disabled`, reset, disabled fieldsets, `c2-form-field`.
- Keyboard: Mod+B/I/U, Mod+Shift+X strike, Mod+E code, Mod+K link, Mod+Shift+7/8 lists, Mod+Shift+9 quote, Mod+Alt+C code block, Mod+\ clear formatting, Alt+F10 toolbar, Mod+Enter `submit`. Tab leaves the field except in a list or code block; Escape there gives Tab back.
- Mentions and tags: `triggers="@ #"`, the `trigger` event (`{ active, char, query, rect }`) and `completeTrigger(text, { href })`.

Events: `input`, `change`, `format-change`, `submit` (cancelable), `trigger`. Methods: `toggleMark()`, `setBlock()`, `setLink()`, `clearFormatting()`, `insertText()`, `completeTrigger()`, `toHTML()`, `reset()`, `checkValidity()`, `reportValidity()`, `setCustomValidity()`. Slots: `toolbar-end`, `footer-start`, `footer-end`. See `custom-elements.json` for the CSS variables.
