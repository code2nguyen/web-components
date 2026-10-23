# Feature: `c2-rich-text-editor` — a compact formatted-text field for comments and emails

**Status**: Draft (design review)
**Roadmap**: #17, section A, P2
**Research**: [research.md](./research.md)
**Mock**: [c2-rich-text-editor mock](https://claude.ai/artifact/LT66A633VSXMByH2LPfweD): anatomy and keyboard, toolbar placements × states, in-context screens (email composer, comment thread, form field) and an interactive prototype with an event log.
**Related**: `c2-page-editor` (full block editor; source of the Markdown codec, `safeHref` and the mark vocabulary), `c2-textarea` (field look, counter), `c2-form-field` (label, hint, error), `c2-menu` (toolbar overflow), `c2-chat-input` (plain-text composer).

## Problem

Comments, replies, email bodies and short descriptions need bold, a link and a list, and nothing more. Apps today pick between a `c2-textarea` (no formatting) and `c2-page-editor` (a whole page with a `/` menu, headings, tables and colours). Whoever wires their own Quill or Tiptap gets the usual failures: a toolbar of unnamed buttons that is ten tab stops, `<p><br></p>` as an "empty" value, Google Docs pastes carrying inline styles, no form integration, and Tab trapped inside the field.

## Goals

1. A form control: form-associated, `name` / `value` / `required` / `maxlength`, validity, reset, disabled fieldsets, and the `c2-form-field` protocol.
2. A small, fixed format set: bold, italic, underline, strike, inline code, link, bullet list, numbered list, quote, code block. Which of them are allowed (toolbar, shortcuts, Markdown input rules and paste alike) is one attribute.
3. Toolbar at the top (default), the bottom, floating over the selection, or none, with one tab stop (APG toolbar) and overflow into a "More" menu.
4. Value is Markdown like the repo's other two ProseMirror editors; `toHTML()` for email bodies. An empty document is `''`.
5. App-owned actions and tools sit in slots (footer and toolbar end), and Mod+Enter fires a cancelable `submit`.
6. Server-renders with no host attributes written; all built-in text localisable; themed by CSS variables mapped to `@c2n/theme`.

Non-goals: headings, colours, alignment, fonts, tables, images and attachments (that is `c2-page-editor`); a built-in mention or emoji picker (a hook instead, below); collaborative editing; an HTML-in / HTML-out mode (open question 1).

## Usage

```html
<c2-form-field label="Reply" hint="Visible to everyone on the pull request.">
  <c2-rich-text-editor name="body" placeholder="Leave a comment…" maxlength="2000">
    <c2-button slot="footer-end" class="ghost">Cancel</c2-button>
    <c2-button slot="footer-end" type="submit">Comment</c2-button>
  </c2-rich-text-editor>
</c2-form-field>

<!-- email composer: toolbar at the bottom, beside the app's Send -->
<c2-rich-text-editor toolbar-position="bottom" formats="bold italic underline link ordered bullet quote">
  <c2-split-button slot="footer-start" type="submit">Send …</c2-split-button>
  <c2-icon-button slot="toolbar-end" label="Attach file">…</c2-icon-button>
</c2-rich-text-editor>

<!-- product description: limited formats -->
<c2-rich-text-editor name="description" formats="bold italic bullet" required></c2-rich-text-editor>
```

```js
editor.addEventListener('submit', () => post(editor.value)) // Mod+Enter
const html = editor.toHTML() // email body
```

## Anatomy

```
┌──────────────────────────── host (form-associated) ────────────────────────────┐
│ [part=toolbar role=toolbar]  B I U S │ link code │ • 1. ❝ </> │ … [toolbar-end] │  ← top (default)
├─────────────────────────────────────────────────────────────────────────────────┤
│ [part=content] ProseMirror, role=textbox aria-multiline                         │
│   grows between min-height and max-height, then scrolls                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [footer-start]   (toolbar here when bottom)        counter  [footer-end]        │
└─────────────────────────────────────────────────────────────────────────────────┘
   link popover / More menu / floating toolbar: c2-overlay in the shadow root
```

The footer row is not rendered while it is empty (no slotted content, no counter, toolbar not at the bottom).

## Public API

| Property          | Attribute          | Type                                        | Default | Purpose                                                                                                                                                                                                                         |
| ----------------- | ------------------ | ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`           | `value`            | `string`                                    | `''`    | Markdown (subset below). `''` when the document is empty.                                                                                                                                                                       |
| `name`            | `name`             | `string`                                    | `''`    | Form field name.                                                                                                                                                                                                                |
| `label`           | `label`            | `string`                                    | `''`    | Accessible name when not inside a `c2-form-field` and no `aria-label`.                                                                                                                                                          |
| `placeholder`     | `placeholder`      | `string`                                    | `''`    | Drawn on the empty first block; also `aria-placeholder`.                                                                                                                                                                        |
| `formats`         | `formats`          | `string`                                    | `''`    | Space-separated, from `bold italic underline strike code link bullet ordered quote code-block`. Toolbar, shortcuts, Markdown input rules and paste offer only these. Empty: all. Order is toolbar order; `\|` adds a separator. |
| `toolbarPosition` | `toolbar-position` | `'top' \| 'bottom' \| 'floating' \| 'none'` | `'top'` | Structural, so an attribute. `floating` shows the bar over a non-empty selection, and falls back to `bottom` under `(pointer: coarse)`.                                                                                         |
| `disabled`        | `disabled`         | `boolean`                                   | `false` | Not focusable, not submitted, toolbar inert. Also from a disabled `<fieldset>`.                                                                                                                                                 |
| `readOnly`        | `readonly`         | `boolean`                                   | `false` | Selectable and focusable, toolbar hidden, links open on click, value submitted.                                                                                                                                                 |
| `required`        | `required`         | `boolean`                                   | `false` | `valueMissing` when the text is empty or whitespace.                                                                                                                                                                            |
| `maxLength`       | `maxlength`        | `number`                                    | `-1`    | Counts text characters (not Markdown). Shows the counter; `tooLong` past it. Input is not blocked.                                                                                                                              |

Read-only getters: `text` (plain text), `form`, `labels`, `validity`, `validationMessage`, `willValidate`, `format` (current `RichTextFormat` at the selection).

Methods: `toHTML()`, `toggleMark(mark)`, `setBlock('paragraph' | 'bullet' | 'ordered' | 'quote' | 'code-block')`, `setLink(href | null)`, `clearFormatting()`, `insertText(text)`, `insertMention({ id, label })`, `focus(options)`, `reset()`, `checkValidity()`, `reportValidity()`, `setCustomValidity(message)`.

Events (`RichTextEditorEventMap`, merged via `TypedAddEventListener`):

| Event           | Detail                         | Bubbles | Notes                                                                                                                                         |
| --------------- | ------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `input`         | —                              | yes     | Each edit, after `value` updated.                                                                                                             |
| `change`        | —                              | yes     | On blur after the value changed.                                                                                                              |
| `format-change` | `RichTextFormat`               | no      | Marks and block at the selection changed (same shape as `PageEditorFormat`, minus colours).                                                   |
| `submit`        | —                              | no      | Mod+Enter. Cancelable; when not cancelled and the editor is in a form, the form is `requestSubmit()`ed.                                       |
| `trigger`       | `{ char, query, rect, range }` | no      | Opt-in through `triggers="@ #"`: typing a trigger character starts a query; fires on each keystroke until Space/Escape. App draws the picker. |

Slots: `toolbar-end` (app tools on the same roving row), `footer-start`, `footer-end`. Parts: `toolbar`, `content`, `footer`.

### Value format

The subset of `c2-page-editor`'s Markdown that the formats need: paragraphs, `-` bullets and `1.` numbers (nested by indentation, up to 3 levels), `>` quotes, fenced code blocks; `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[links](…)`, `<u>underline</u>` and `<br>` for a soft break. Parsing never throws; anything outside `formats` is read as text. `toHTML()` emits only `p br strong em u s code pre a[href] ul ol li blockquote`, with `href` through `safeHref`.

The Markdown codec and `safeHref` move from `@c2n/page-editor` to a shared module rather than being copied (open question 2).

## Behaviour

- **Toolbar**: APG toolbar, one tab stop, Left/Right/Home/End, wraps. Mark and list buttons are toggles (`aria-pressed`), link and clear are buttons, `toolbar-end` children join the roving order. Buttons do not take focus on pointer down, so the selection survives. Items that do not fit move into a "More" `c2-menu` at the end (ResizeObserver), which is `menuitemcheckbox` for toggles.
- **Keyboard** (mock board 1): Mod+B/I/U, Mod+Shift+X strike, Mod+E code, Mod+K link, Mod+Shift+7/8 lists, Mod+Shift+9 quote, Mod+Alt+C code block, Shift+Enter soft break, Enter on an empty list item leaves the list, Tab/Shift+Tab indent in lists only, Escape releases a list's Tab capture, Alt+F10 to the toolbar and Escape back, Mod+Enter submit, Mod+Shift+V plain paste.
- **Markdown input rules** as in `c2-page-editor` (`- `, `1. `, `> `, three backticks, `**x**`), with Backspace right after undoing the conversion; only for allowed formats.
- **Link popover**: Mod+K or the button. With a selection: URL field; on a link: URL, open, remove. Enter applies, Escape closes and restores the selection. A pasted URL over a selection links it.
- **Paste**: through the schema, after a pre-pass that maps inline styles (`font-weight` ≥ 600, `font-style: italic`, `text-decoration`) to marks and unwraps the Google Docs `<b id="docs-internal-guid-…">`. Formats outside `formats` become text.
- **Validity**: `valueMissing`, `tooLong`, custom. Error look while invalid and interacted, or while `field.invalid`.

## Styling

Defaults are `c2-textarea`'s literals for the box and `c2-page-editor`'s for the content, so the theme generator maps them to the same tokens.

| Variable                                                                                   | Default                                     | Notes                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------- |
| `--c2-rich-text-editor__container--border` / `__hover--border` / `__focus--border`         | `1px solid #bcbcc6` / `#a1a1aa` / `#476ef9` | As `c2-textarea`.                      |
| `--c2-rich-text-editor__container__focus--box-shadow`                                      | `none`                                      | The mock's focus ring is a preset.     |
| `--c2-rich-text-editor__container--border-radius` / `--background` / `--color`             | `6px` / `#ffffff` / `#18181b`               |                                        |
| `--c2-rich-text-editor__container__error--border`                                          | `1px solid #dc2626`                         |                                        |
| `--c2-rich-text-editor__container__read-only--background`, `__disabled--opacity`           | `#fafafa`, `0.38`                           |                                        |
| `--c2-rich-text-editor__toolbar--padding` / `--gap` / `--border-bottom`                    | `6px` / `2px` / `1px solid #e4e4e7`         | `--border-top` when at the bottom.     |
| `--c2-rich-text-editor__tool--size` / `--border-radius` / `--color`                        | `32px` / `4px` / `#3f3f46`                  | 44px under `(pointer: coarse)`.        |
| `--c2-rich-text-editor__tool__hover--background`                                           | `#f4f4f5`                                   |                                        |
| `--c2-rich-text-editor__tool__pressed--background` / `--color`                             | `#edf1fe` / `#0265dc`                       | `color-primary-container` / `primary`. |
| `--c2-rich-text-editor__separator--color`                                                  | `#e4e4e7`                                   |                                        |
| `--c2-rich-text-editor__content--padding` / `--min-height` / `--max-height`                | `10px 12px` / `80px` / `none`               | Auto-grow bounds.                      |
| `--c2-rich-text-editor__content--font-family` / `--font-size` / `--line-height`            | `inherit` / `14px` / `22px`                 |                                        |
| `--c2-rich-text-editor__placeholder--color`                                                | `#71717a`                                   |                                        |
| `--c2-rich-text-editor__link--color`, `__quote--border-left`, `__inline-code--background`… | as `c2-page-editor`                         |                                        |
| `--c2-rich-text-editor__footer--padding` / `__counter--color` / `__counter__error--color`  | `8px 10px` / `#71717a` / `#dc2626`          |                                        |
| `--c2-rich-text-editor__popover--background` / `--border` / `--box-shadow`                 | as `c2-page-editor`'s popover               | Floating toolbar, link popover.        |

Gallery presets: Default (top), Composer (bottom, rounded 10px, send button), Floating, Minimal (none), Borderless inline (comment edit in place), Dark block.

## Rendering constraints

- No attribute written on the host: `internals` for role-free host state; `aria-*` lives on the content element in the shadow root, which is named by `this.field.label` / `label` / `aria-label`.
- `FieldContextConsumer(this, { kind: 'text' })`; counter and hint hidden while `field.managed`. Added to the form-field matrix test.
- SSR: the server renders the toolbar and the value as static HTML in the content element (from the same `toHTML()`), and ProseMirror mounts over it on the client, so there is no layout shift and no hydration mismatch.
- `customElement` from `@c2n/core/element-helper.js`, `property` from `@c2n/core/lit-helper.js`; text in `src/messages.ts` (`defineMessages('rich-text-editor', en)`): tool names, "Formatting", "More formatting", link popover labels, counter announcement.
- Dependencies: the ProseMirror packages already used by `page-editor`/`notepad`, `@c2n/menu`, `@c2n/overlay`. Add `../menu:build` and `../overlay:build` to `type-check`.
- Size budget: the ProseMirror chunks are shared with the other editors; the entry itself should stay under ~25 kB gzipped.

## Tests (`packages/components/rich-text-editor/test/`)

- Value round-trip for every format; parsing unknown Markdown keeps text; empty doc → `''`; `toHTML()` whitelist and `javascript:` links dropped.
- `formats` limits toolbar, shortcuts, input rules and paste (pasted heading → paragraph).
- Toolbar: one tab stop, arrows/Home/End, `aria-pressed` follows the selection, Alt+F10 / Escape, buttons keep the selection.
- Tab leaves the field outside lists; indents inside; Escape then Tab leaves.
- Link popover: Mod+K, Enter, Escape restores selection, remove link, `safeHref`.
- Paste: Google Docs fixture (bold span, wrapper `<b>`), Word fixture, plain paste.
- Form: submit value, reset, required whitespace, `maxlength` counter and `tooLong`, disabled fieldset, `submit` event cancel, Mod+Enter `requestSubmit`.
- Positions: bottom, floating (appears on selection, gone on collapse), none, coarse-pointer fallback, overflow into More.
- Localisation from `test/translations.ts`; SSR hydration with a value; form-field matrix entry.

## Docs and wiring

`npm run generate` (category Inputs), doc page with rows "Comment", "Composer" and "Limited formats", gallery presets above, preview card, module import, manifest registration, `size:add`. `page-editor.mdx` and `textarea.mdx` get a one-line pointer.

## Open questions

1. **Value format.** Markdown (consistent with `c2-page-editor` / `c2-notepad`, safe to store, diff-friendly; `toHTML()` for email) vs HTML (what PrimeVue, Mantine, Trix and Gmail use). Proposal: Markdown, plus `toHTML()`; add a `value-format="html"` later only if apps ask.
2. **Shared codec.** Extract the Markdown codec, schema pieces and `safeHref` from `@c2n/page-editor` into a shared module (`@c2n/core/prose/*.js`, which would make core depend on ProseMirror) or a new private `@c2n/prose` package. Proposal: a new package, so `@c2n/core` stays dependency-free.
3. **Mentions.** A `trigger` event + `insertMention()` (proposed) vs composing `c2-mention-input` (roadmap #15) inside it once that exists. The event keeps the editor independent of a user directory.
4. **`submit` name.** It shadows the meaning of the form's own `submit` for listeners on the element; `send` or `submit-request` are alternatives.
