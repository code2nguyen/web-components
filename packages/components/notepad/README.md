# @c2n/notepad

A rich-text notepad that reads as a sheet of paper: handwriting on ruled lines, a margin, a spiral binding and paper grain. Selecting text opens a formatting toolbar drawn as a strip of washi tape (bold, italic, underline, strikethrough, and one button each for the four inks and the three highlighters). `[ ] ` starts a checklist item, and a `tearable` pad can have its page torn off. Built on ProseMirror.

```sh
npm install @c2n/notepad
```

```js
import '@c2n/notepad'
```

```html
<c2-notepad name="notes" label="Meeting notes" placeholder="Write something…">
  <span slot="header">Notes · Oct 1</span>
</c2-notepad>
```

`value` is line-based Markdown: one line per line, `- [ ]` / `- [x]` checklist items, `**bold**`, `*italic*`, `~~strike~~`, `==highlight==`, and inline HTML for what Markdown cannot say (`<u>`, `<span data-ink="red">`, `<mark data-color="pink">`). `text` returns plain text. The element is form-associated (`name`, `required`, `maxlength`, reset, disabled fieldsets).

`paper-picker` adds a "Paper" button that lets the writer pick the ruling (`paper`: lined, grid, dot, blank) and the paper colour with its ink (`paper-color`: default, yellow, green, blue, pink, night). It opens on hover, like a hover card.

Events: `input`, `change`, `format-change`, `check-change`, `page-tear` (cancelable), `paper-change`. Methods: `formatSelection(mark, color?)`, `clearFormatting()`, `tearOff()`, `reset()`, `checkValidity()`, `reportValidity()`, `setCustomValidity()`.

The paper is styled with CSS variables only: `--c2-notepad__rule--color`, `__grid--color`, `__dot--color`, `__margin--color`, `__sheet--background`, `__writing--color`, `__spiral--display`, `__glue--display` and more. See `custom-elements.json` for the full list.

## Font

The default handwriting face is [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) by Patrick Wagesreiter, licensed under the SIL Open Font License 1.1 (`fonts/OFL.txt`), subset to Latin and Vietnamese and registered as `'C2 Notepad Hand'`. It lives in its own chunk and is only fetched when a notepad's writing surface uses it; set `--c2-notepad__writing--font-family` to use another face.
