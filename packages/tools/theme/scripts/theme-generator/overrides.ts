/**
 * Hand-curated exceptions to the classifier rules, keyed by full variable name.
 *
 * - `{ token, value? }` maps the variable to a token; `value` is the emitted expression (`{orig}` = the
 *   component default) and defaults to `var(--c2-theme--<token>, {orig})`.
 * - `{ exclude }` keeps the variable out of the base theme with a reason shown in the report.
 */
export type Override = { token: string; value?: string } | { exclude: string }

const onPrimary = { token: 'color-on-primary' }

export const overrides: Record<string, Override> = {
  // Marks drawn on the accent background of a selected checkbox.
  '--c2-checkbox__checkmark--color': onPrimary,
  '--c2-checkbox__mixedmark--color': onPrimary,
  '--c2-checkbox__uncheckmark--color': onPrimary,
  // Radio dot drawn on the accent fill of a checked control.
  '--c2-radio__dot--color': onPrimary,
  // Slider: white thumb on the page surface, accent thumb border, white ticks on the accent fill, bubble text on the inverse surface.
  '--c2-slider__thumb--color': { token: 'color-surface' },
  '--c2-slider__thumb--border': { token: 'color-primary', value: '2px solid var(--c2-theme--color-primary, #0265dc)' },
  '--c2-slider__tick__filled--color': onPrimary,
  '--c2-slider__value--color': { token: 'color-on-inverse-surface' },
  // Switch: hovered off-track uses the outline colour, the thumb is a surface.
  '--c2-switch__track__hover--color': { token: 'color-outline' },
  '--c2-switch__thumb--color': { token: 'color-surface' },
  // Progress: the unfilled groove is the same hairline grey as the spinner's ring, which the background rule table
  // does not cover; the filled indicator maps to the accent on its own.
  '--c2-progress__track--background-color': { token: 'color-outline-variant' },
  // Skeleton: the resting block is the same hairline grey as the progress track. The wave highlight is a translucent
  // white sheen rather than a surface colour, and the theme has no token for one.
  '--c2-skeleton--background-color': { token: 'color-outline-variant' },
  '--c2-skeleton__sheen--color': { exclude: 'translucent highlight, not a surface colour' },
  // Tooltip text sits on the inverse surface.
  '--c2-tooltip--color': { token: 'color-on-inverse-surface' },
  // Tabs: the selected indicator is the accent; the baseline is a hairline drawn with an inset shadow.
  '--c2-tabs__indicator--color': { token: 'color-primary' },
  '--c2-tabs--box-shadow': { token: 'color-outline-variant', value: 'inset 0px -2px 0px 0px var(--c2-theme--color-outline-variant, rgb(230, 230, 230))' },
  // Selected + hovered list item: a slightly stronger tint of the selected surface.
  '--c2-list-item__selected__hover--background': {
    token: 'color-primary-container',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary-container, #edf1fe), var(--c2-theme--color-primary, #0265dc) 8%)',
  },
  // Typo in the component's variable name (`borde-leftr`); it is the real name the slider reads, so theme it like its siblings.
  '--c2-color-slider--borde-leftr': {
    token: 'border',
    value: 'var(--c2-theme--border, var(--c2-theme--border-width, 1px) solid var(--c2-theme--color-outline, rgb(177, 177, 177)))',
  },
  // Copy button: the pressed surface is a slightly stronger tint of the hover surface (same trick as the selected +
  // hovered list item above), so it follows the theme instead of staying a hard-coded grey. The copied state is a
  // success colour, which the theme has no token for.
  '--c2-copy-button__container__active--background-color': {
    token: 'color-surface-container',
    value: 'color-mix(in srgb, var(--c2-theme--color-surface-container, #f4f4f5), var(--c2-theme--color-on-surface, #18181b) 8%)',
  },
  '--c2-copy-button__container__copied--color': { exclude: 'status colour' },
  // Badge status tones are semantic colours with no theme token; the neutral/primary/danger pairs map on their own.
  '--c2-badge__success--background': { exclude: 'status colour' },
  '--c2-badge__success--color': { exclude: 'status colour' },
  '--c2-badge__warning--background': { exclude: 'status colour' },
  '--c2-badge__warning--color': { exclude: 'status colour' },
  '--c2-badge__info--background': { exclude: 'status colour' },
  '--c2-badge__danger--background': { exclude: 'status colour (the text maps to color-error)' },
  '--c2-badge__info--color': { exclude: 'status colour' },
  // Avatar fallback colours identify a person; leave them alone.
  '--c2-avatar--background': { exclude: 'identity colour' },
  '--c2-avatar--color': { exclude: 'identity colour' },
  // Code viewer: monospace font and theme-neutral translucent greys / status colours that work on any syntax theme.
  '--c2-code-viewer--font-family': { exclude: 'monospace font, not the UI font' },
  '--c2-code-viewer__header--background': { exclude: 'translucent grey works on light and dark syntax themes' },
  '--c2-code-viewer__header--border-bottom': { exclude: 'translucent grey works on light and dark syntax themes' },
  '--c2-code-viewer__copy__hover--background': { exclude: 'translucent grey works on light and dark syntax themes' },
  '--c2-code-viewer__copy__copied--color': { exclude: 'success status colour' },
  '--c2-code-viewer__line__highlighted--background': { exclude: 'highlight colour tied to the syntax theme' },
  '--c2-code-viewer__line__highlighted--border-left': { exclude: 'highlight colour tied to the syntax theme' },
  '--c2-side-nav__scrollbar--color': { exclude: 'translucent scrollbar thumb works on any surface' },
  // Error focus ring stays red on purpose.
  '--c2-text-field__error__focus--outline': { exclude: 'error focus ring is intentionally red' },
  // 1px radii on the colour picker swatch are a detail, not a shape token.
  '--c2-color-select--border-top-left-radius': { exclude: 'swatch detail radius' },
  '--c2-color-select--border-top-right-radius': { exclude: 'swatch detail radius' },
  '--c2-color-select--border-bottom-left-radius': { exclude: 'swatch detail radius' },
  '--c2-color-select--border-bottom-right-radius': { exclude: 'swatch detail radius' },
  // Table: the pinned-column separators are hairlines drawn as shadows, so they follow the outline colour (same trick
  // as the tabs baseline above) instead of staying a hard-coded grey on a dark table.
  '--c2-table__pinned-start--box-shadow': {
    token: 'color-outline-variant',
    value: '1px 0 0 0 var(--c2-theme--color-outline-variant, #e4e4e7)',
  },
  '--c2-table__pinned-end--box-shadow': {
    token: 'color-outline-variant',
    value: '-1px 0 0 0 var(--c2-theme--color-outline-variant, #e4e4e7)',
  },
}
