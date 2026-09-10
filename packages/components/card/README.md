# @c2n/card

Themeable surface that groups related content and actions, built with Lit.

```bash
npm install @c2n/card
```

```html
<script type="module">
  import '@c2n/card'
</script>

<c2-card>
  <img slot="media" src="cover.jpg" alt="" />
  <h3 slot="header">Title</h3>
  Body text goes in the default slot.
  <c2-button slot="footer">Action</c2-button>
</c2-card>
```

- **Sections**: `media` (full-bleed, clipped to the card radius), `header`, the default slot (body) and `footer` (a flex row). A section is rendered only when its slot has content, so a plain `<c2-card>text</c2-card>` is just a padded box.
- **Link card**: set `href` (plus `target` / `rel`) and the whole card becomes an anchor.
- **Interactive card**: set `interactive` for button semantics: focusable, `role="button"`, Enter and Space dispatch `click`.
- **Disabled**: `disabled` dims the card and blocks interaction; a link card loses its anchor.

Everything visual is a CSS custom property: `--c2-card--*` for the surface (padding, radius, borders, background, color, shadow), `--c2-card__header--*`, `--c2-card__footer--*` and `--c2-card__media--*` for the sections, and `--c2-card__hover--*`, `--c2-card__focus--*`, `--c2-card__disabled--*` for the states. `--c2-card__hover--transform: translateY(-2px)` with a hover shadow gives the classic lift. The full list is in `custom-elements.json` and on the docs site.
