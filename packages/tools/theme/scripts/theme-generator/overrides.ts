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
  // The highlighter is a translucent hue on purpose: it tints any surface, light or dark, and the text keeps its colour.
  '--c2-marker__mark--background-color': { exclude: 'translucent highlighter hue' },
  // Message body text is a slightly softer ink than the title; it is still body text on the surface.
  '--c2-chat-message__message--color': { token: 'color-on-surface' },
  // Terminal typography and colors form one readable palette; a generic sans/light theme must not split it.
  '--c2-log-viewer--background': { exclude: 'default terminal palette' },
  '--c2-log-viewer--color': { exclude: 'default terminal palette' },
  '--c2-log-viewer--font-family': { exclude: 'monospace text layout' },
  '--c2-log-viewer--border': { exclude: 'default terminal frame' },
  '--c2-log-viewer--border-radius': { exclude: 'default terminal frame' },
  '--c2-log-viewer__viewport__focus--outline': { exclude: 'terminal focus contrast' },
  '--c2-log-viewer__empty--color': { exclude: 'terminal metadata contrast' },
  '--c2-log-viewer__token--color': { exclude: 'terminal log token contrast' },
  '--c2-log-viewer__timestamp--color': { exclude: 'terminal metadata contrast' },
  '--c2-log-viewer__attribute--color': { exclude: 'terminal metadata contrast' },
  '--c2-log-viewer__level--color': { exclude: 'terminal level contrast' },
  '--c2-log-viewer__level__info--color': { exclude: 'terminal severity contrast' },
  '--c2-log-viewer__level__warning--color': { exclude: 'terminal severity contrast' },
  '--c2-log-viewer__level__error--color': { exclude: 'terminal severity contrast' },
  '--c2-log-viewer__entry--box-shadow': { exclude: 'terminal row divider contrast' },
  '--c2-log-viewer__entry__highlighted--background': { exclude: 'terminal match contrast' },
  '--c2-log-viewer__entry__highlighted--box-shadow': { exclude: 'terminal match accent' },
  '--c2-log-viewer__entry__hover--background': { exclude: 'terminal hover surface contrast' },
  '--c2-log-viewer__copy--background': { exclude: 'terminal copy control contrast' },
  '--c2-log-viewer__copy--color': { exclude: 'terminal copy control contrast' },
  '--c2-log-viewer__copy--border': { exclude: 'terminal copy control contrast' },
  '--c2-log-viewer__copy--border-radius': { exclude: 'terminal copy control shape' },
  '--c2-log-viewer__copy__hover--background': { exclude: 'terminal copy control contrast' },
  '--c2-log-viewer__copy__focus--outline': { exclude: 'terminal copy focus contrast' },
  // Masonry defaults have no outer rounding; the edit preview and elevation follow the active brand theme.
  '--c2-masonry--border-radius': { exclude: 'square outer layout by default' },
  '--c2-masonry-item--border-radius': { exclude: 'square tile by default' },
  '--c2-masonry__placeholder--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, #2563eb) 8%, transparent)',
  },
  '--c2-masonry__placeholder--border': {
    token: 'color-primary',
    value: '2px dashed var(--c2-theme--color-primary, #2563eb)',
  },
  '--c2-masonry-item__dragging--box-shadow': { token: 'shadow-md' },
  // Planner tints are the accent at a low strength, so they follow the brand colour and read on a dark surface.
  '--c2-week-planner__day__today--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, rgb(2, 101, 220)) 5%, transparent)',
  },
  // Translucent text colour rather than an opaque grey, so the line still shows over today's tinted column.
  '--c2-week-planner__hour--border': {
    token: 'color-on-surface',
    value: 'var(--c2-theme--border-width, 1px) solid color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 6%, transparent)',
  },
  // The editable planner's ghost blocks: the hour under the pointer and where a dragged event lands.
  '--c2-week-planner__slot__hover--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, rgb(2, 101, 220)) 10%, transparent)',
  },
  '--c2-week-planner__preview--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, rgb(2, 101, 220)) 10%, transparent)',
  },
  '--c2-week-planner__preview--border': {
    token: 'color-primary',
    value: '2px dashed var(--c2-theme--color-primary, rgb(2, 101, 220))',
  },
  '--c2-week-planner__event__dragging--opacity': { exclude: 'drag feedback, not a disabled state' },
  '--c2-month-planner__day__today--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, rgb(2, 101, 220)) 5%, transparent)',
  },
  '--c2-month-planner__month__marked--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, rgb(2, 101, 220)) 10%, transparent)',
  },
  '--c2-month-planner__month__marked__hover--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, rgb(2, 101, 220)) 18%, transparent)',
  },
  // Border Beam geometry and timing belong to the decorative effect. Its principal colour and radius follow the
  // active theme while the second gradient stop remains an intentionally coordinated accent.
  '--c2-border-beam--outset': { exclude: 'container border alignment geometry' },
  '--c2-border-beam__beam--width': { exclude: 'decorative stroke geometry' },
  '--c2-border-beam__beam--size': { exclude: 'decorative highlight length' },
  '--c2-border-beam__beam--radius': { token: 'radius-lg' },
  '--c2-border-beam__beam--color-from': { token: 'color-primary' },
  '--c2-border-beam__beam--color-to': { exclude: 'coordinated decorative gradient stop' },
  '--c2-border-beam__beam--opacity': { exclude: 'decorative effect opacity' },
  '--c2-border-beam__beam--filter': { exclude: 'decorative glow effect' },
  '--c2-border-beam__beam--duration': { exclude: 'decorative animation timing' },
  '--c2-border-beam__beam--delay': { exclude: 'decorative animation timing' },
  '--c2-border-beam--z-index': { exclude: 'consumer stacking context' },
  // Status-panel dimensions follow the surrounding page/card composition. Semantic outcome colours stay stable across
  // brand themes so success, warning and error do not inherit unrelated accent colours.
  '--c2-status-panel__container--width': { exclude: 'responsive status-panel width' },
  '--c2-status-panel__container--max-width': { exclude: 'readable status-panel measure' },
  '--c2-status-panel__container--min-height': { exclude: 'status-panel composition height' },
  '--c2-status-panel__container--padding': { exclude: 'status-panel composition spacing' },
  '--c2-status-panel__container--gap': { exclude: 'status-panel composition rhythm' },
  '--c2-status-panel__container--border': { exclude: 'transparent opt-in panel frame' },
  '--c2-status-panel__media--size': { exclude: 'status media geometry' },
  '--c2-status-panel__media-icon--size': { exclude: 'status icon geometry' },
  '--c2-status-panel__illustration--size': { exclude: 'status illustration geometry' },
  '--c2-status-panel__media__success--background-color': { exclude: 'semantic success colour' },
  '--c2-status-panel__media__success--color': { exclude: 'semantic success colour' },
  '--c2-status-panel__media__warning--background-color': { exclude: 'semantic warning colour' },
  '--c2-status-panel__media__warning--color': { exclude: 'semantic warning colour' },
  '--c2-status-panel__media__error--background-color': { exclude: 'semantic error colour' },
  '--c2-status-panel__media__error--color': { exclude: 'semantic error colour' },
  '--c2-status-panel__header--gap': { exclude: 'status copy rhythm' },
  '--c2-status-panel__title--font-size': { exclude: 'status heading scale' },
  '--c2-status-panel__title--line-height': { exclude: 'status heading line height' },
  '--c2-status-panel__description--line-height': { exclude: 'status description line height' },
  '--c2-status-panel__description--max-width': { exclude: 'readable status description measure' },
  '--c2-status-panel__actions--gap': { exclude: 'status action rhythm' },
  '--c2-status-panel__content--max-width': { exclude: 'readable status detail measure' },
  '--c2-status-panel__content--padding': { exclude: 'status detail spacing' },
  // QR dimensions protect scan geometry; the white module field follows the active surface token.
  '--c2-qr-code--size': { exclude: 'consumer-controlled QR output size' },
  '--c2-qr-code__background--color': { token: 'color-surface' },
  '--c2-qr-code__center--size': { exclude: 'center mark constrained by QR scan geometry' },
  '--c2-qr-code__center--padding': { exclude: 'center mark quiet spacing' },
  // Upload measurements belong to the drop-zone composition; dashed borders keep their style while following theme colours.
  '--c2-upload--width': { exclude: 'responsive upload width' },
  '--c2-upload__dropzone--padding': { exclude: 'drop-zone spacing' },
  '--c2-upload__dropzone--gap': { exclude: 'drop-zone rhythm' },
  '--c2-upload__dropzone--border': {
    token: 'border',
    value: 'var(--c2-theme--border-width, 1px) dashed var(--c2-theme--color-outline, #bcbcc6)',
  },
  '--c2-upload__dropzone__hover--border': {
    token: 'border',
    value: 'var(--c2-theme--border-width, 1px) dashed var(--c2-theme--color-outline, #a1a1aa)',
  },
  '--c2-upload__dropzone__drag--background': { token: 'color-primary-container' },
  '--c2-upload__dropzone__drag--border': {
    token: 'color-primary',
    value: 'var(--c2-theme--border-width, 1px) dashed var(--c2-theme--color-primary, rgb(2, 101, 220))',
  },
  '--c2-upload__dropzone__focus--outline-offset': { exclude: 'drop-zone focus geometry' },
  '--c2-upload__icon--size': { exclude: 'drop-zone icon size' },
  '--c2-upload__list--gap': { exclude: 'attachment queue rhythm' },
  '--c2-upload__list--margin-top': { exclude: 'attachment queue spacing' },
  '--c2-upload__error--gap': { exclude: 'validation message rhythm' },
  // Rate geometry and its familiar gold score colour are intentionally independent of the brand accent.
  '--c2-rate__icon--size': { exclude: 'rating icon size' },
  '--c2-rate__container--gap': { exclude: 'rating icon rhythm' },
  '--c2-rate__icon__filled--color': { exclude: 'semantic rating colour' },
  '--c2-rate__icon__preview--color': { exclude: 'semantic rating preview colour' },
  '--c2-rate__icon__hover--scale': { exclude: 'rating hover motion' },
  '--c2-rate__container__focus--outline-offset': { exclude: 'rating focus geometry' },
  // Cascader measurements describe its multi-column interaction geometry rather than the global control scale.
  '--c2-cascader__trigger--min-height': { exclude: 'cascader trigger geometry' },
  '--c2-cascader__trigger--width': { exclude: 'responsive trigger width' },
  '--c2-cascader__trigger--padding': { exclude: 'internal trigger spacing' },
  '--c2-cascader__trigger--gap': { exclude: 'internal trigger spacing' },
  '--c2-cascader__trigger__focus--outline-offset': { exclude: 'flush focus ring offset' },
  '--c2-cascader__icon--size': { exclude: 'cascader affordance size' },
  '--c2-cascader__panel--box-shadow': { token: 'shadow-md' },
  '--c2-cascader__panel--max-width': { exclude: 'viewport-aware panel width' },
  '--c2-cascader__column--min-width': { exclude: 'hierarchy column geometry' },
  '--c2-cascader__column--max-width': { exclude: 'hierarchy column geometry' },
  '--c2-cascader__column--max-height': { exclude: 'viewport-aware column height' },
  '--c2-cascader__column--padding': { exclude: 'internal column spacing' },
  '--c2-cascader__option--min-height': { exclude: 'hierarchy row geometry' },
  '--c2-cascader__option--padding': { exclude: 'internal option spacing' },
  '--c2-cascader__option--gap': { exclude: 'internal option spacing' },
  '--c2-cascader__option__active--background': { token: 'color-primary-container' },
  '--c2-cascader__empty--padding': { exclude: 'empty-state spacing' },
  // Questionnaire dimensions follow its content and embedding context rather than global component sizing tokens.
  '--c2-questionnaire--width': { exclude: 'responsive flow width' },
  '--c2-questionnaire--max-width': { exclude: 'readable flow measure' },
  '--c2-questionnaire__title--font-size': { exclude: 'question heading scale' },
  '--c2-questionnaire__options--gap': { exclude: 'internal option rhythm' },
  '--c2-questionnaire__option--padding': { exclude: 'internal option spacing' },
  '--c2-questionnaire__control--size': { exclude: 'native-choice control size' },
  '--c2-questionnaire__primary-action--color': onPrimary,
  // A date selector is commonly used as a floating booking panel, so its surface follows the shared popover shadow.
  '--c2-date-selector--box-shadow': { token: 'shadow-md' },
  // The calendar's month picker floats over the grid like any popover.
  '--c2-month-planner__picker--box-shadow': { token: 'shadow-md' },
  // The chart's categorical palette is one coordinated set. Series 1 would otherwise follow `color-primary`
  // on its own, so re-tinting a brand would recolour exactly one series out of eight and break the set.
  '--c2-chart__series-1--color': { token: 'chart-series-1' },
  '--c2-chart__series-2--color': { token: 'chart-series-2' },
  '--c2-chart__series-3--color': { token: 'chart-series-3' },
  '--c2-chart__series-4--color': { token: 'chart-series-4' },
  '--c2-chart__series-5--color': { token: 'chart-series-5' },
  '--c2-chart__series-6--color': { token: 'chart-series-6' },
  '--c2-chart__series-7--color': { token: 'chart-series-7' },
  '--c2-chart__series-8--color': { token: 'chart-series-8' },
  // Direction is not status: a falling candle is not an error, and a brand must be able to recolour the
  // pair (green/red, or blue/orange in Japan) without touching what an error looks like.
  '--c2-chart__positive--color': { token: 'chart-positive' },
  '--c2-chart__negative--color': { token: 'chart-negative' },
  '--c2-chart__tone-positive--color': { token: 'chart-positive' },
  '--c2-chart__tone-negative--color': { token: 'chart-negative' },
  // The comparison bar's end side is the opposing quantity (asks, sellers), not an error: it follows the
  // falling-direction colour so a brand recolours the pair together with the charts.
  '--c2-comparison-bar__end-segment--background-color': { token: 'chart-negative' },
  '--c2-comparison-bar__end-value--color': { token: 'chart-negative' },
  // The neutral middle share (draws, abstentions) reads as a strong outline grey in either theme.
  '--c2-comparison-bar__middle-segment--background-color': { token: 'color-outline-strong' },
  // Handed to the engine to draw marker and slice borders against the card, so it follows the surface
  // rather than reading as white text, which is how the colour rule would otherwise classify it.
  '--c2-chart__surface--color': { token: 'color-surface' },
  // The tooltip is an inverse surface, so its text follows the inverse pair rather than the body colour.
  '--c2-chart__tooltip--color': { token: 'color-on-inverse-surface' },
  // Map regions are drawn on the card, so the borders between them are the surface colour, not white ink.
  '--c2-chart__region--border-color': { token: 'color-surface' },
  // A selected region with no data takes the soft accent surface, as a selected list item does.
  '--c2-chart__region__selected--background-color': { token: 'color-primary-container' },
  // The sequential ramp runs from a whisper of the first series colour on the surface to the series colour pulled
  // toward the text colour: dark navy on a light card, bright blue on a dark one, so "more" always reads as stronger.
  '--c2-chart__scale-start--color': {
    token: 'chart-series-1',
    value: 'color-mix(in srgb, var(--c2-theme--chart-series-1, #0265dc) 15%, var(--c2-theme--color-surface, #ffffff))',
  },
  '--c2-chart__scale-end--color': {
    token: 'chart-series-1',
    value: 'color-mix(in srgb, var(--c2-theme--chart-series-1, #0265dc) 70%, var(--c2-theme--color-on-surface, #18181b))',
  },
  // The diverging scale's negative pole is the second series colour, deepened the same way as the positive end.
  '--c2-chart__scale-negative--color': {
    token: 'chart-series-2',
    value: 'color-mix(in srgb, var(--c2-theme--chart-series-2, #ea580c) 80%, var(--c2-theme--color-on-surface, #18181b))',
  },
  // Attachment upload completion is a semantic status colour; its progress groove is the standard hairline surface.
  '--c2-attachment__status__complete--color': { exclude: 'success status colour' },
  '--c2-attachment__progress--background': { token: 'color-outline-variant' },
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
  // Virtual list: the search highlight is a marker yellow, deliberately outside the surface/accent ramp so a match
  // stands out in every theme.
  '--c2-virtual-list__highlight--background': { exclude: 'marker highlight, not a surface colour' },
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
  // Selected + hovered tree row: the same stronger tint of the selected surface as the list item.
  '--c2-tree-item__selected__hover--background': {
    token: 'color-primary-container',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary-container, #edf1fe), var(--c2-theme--color-primary, #0265dc) 8%)',
  },
  // Selected + hovered table row: the same stronger tint of the selected surface as the list item.
  '--c2-table__row__selected__hover--background': {
    token: 'color-primary-container',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary-container, #edf1fe), var(--c2-theme--color-primary, #0265dc) 8%)',
  },
  // Keep the left edge of the color slider on the same outline token as its siblings.
  '--c2-color-slider--border-left': {
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
  '--c2-avatar__editor--color': { token: 'color-on-inverse-surface' },
  '--c2-avatar__editor__focus--outline-offset': { exclude: 'avatar editor focus geometry' },
  '--c2-avatar__editor-icon--size': { exclude: 'avatar editor icon size' },
  '--c2-avatar__remove--size': { exclude: 'avatar remove action geometry' },
  // The accordion's frame and dividers are the same grey as c2-details' borders (rgb(213, 213, 213)), written as hex,
  // so they take the same outline token.
  '--c2-accordion--border-color': { token: 'color-outline' },
  '--c2-avatar__remove--box-shadow': { token: 'shadow-sm' },
  // Avatar-group width, overlap and item measurements are responsive composition controls. The overflow badge uses
  // the inverse surface pair so it remains legible in both light and dark themes.
  '--c2-avatar-group--max-width': { exclude: 'responsive avatar-group width' },
  '--c2-avatar-group--overlap': { exclude: 'avatar stacking geometry' },
  // The ring cuts each avatar out of the one under it, so it is drawn in the surface colour, like the badge's border.
  '--c2-avatar-group__avatar--box-shadow': {
    token: 'color-surface',
    value: '0 0 0 2px var(--c2-theme--color-surface, #ffffff)',
  },
  '--c2-avatar-group__overflow--size': { exclude: 'overflow badge geometry' },
  // A selected questionnaire indicator is filled with the inverse surface; its dot and tick take the matching ink.
  '--c2-questionnaire__control__selected--color': { token: 'color-on-inverse-surface' },
  '--c2-avatar-group__overflow--background': { token: 'color-inverse-surface' },
  '--c2-avatar-group__overflow--color': { token: 'color-on-inverse-surface' },
  // Month planner, compact layout: the selected day is an inverse-surface circle, today's a primary one.
  '--c2-month-planner__date__selected--color': { token: 'color-on-inverse-surface' },
  '--c2-month-planner__date__today__selected--color': onPrimary,
  // Code viewer: monospace font and theme-neutral translucent greys / status colours that work on any syntax theme.
  '--c2-code-viewer--font-family': { exclude: 'monospace font, not the UI font' },
  '--c2-code-viewer__header--background': { exclude: 'translucent grey works on light and dark syntax themes' },
  '--c2-code-viewer__header--border-bottom': { exclude: 'translucent grey works on light and dark syntax themes' },
  '--c2-code-viewer__copy__hover--background': { exclude: 'translucent grey works on light and dark syntax themes' },
  '--c2-code-viewer__copy__copied--color': { exclude: 'success status colour' },
  '--c2-code-viewer__line__highlighted--background': { exclude: 'highlight colour tied to the syntax theme' },
  '--c2-code-viewer__line__highlighted--border-left': { exclude: 'highlight colour tied to the syntax theme' },
  '--c2-side-nav__scrollbar--color': { exclude: 'translucent scrollbar thumb works on any surface' },
  // Text-entry fields use their accent border as the focus indicator; adding the global ring creates a doubled border.
  '--c2-autocomplete__focus--outline': { exclude: 'focus is indicated by the accent border' },
  '--c2-text-field__focus--outline': { exclude: 'focus is indicated by the accent border' },
  '--c2-textarea__container__focus--outline': { exclude: 'focus is indicated by the accent border' },
  '--c2-tag-input__focus--outline': { exclude: 'focus is indicated by the accent border' },
  '--c2-date-input__focus--outline': { exclude: 'focus is indicated by the accent border' },
  '--c2-time-input__focus--outline': { exclude: 'focus is indicated by the accent border' },
  '--c2-number-input__focus--outline': { exclude: 'focus is indicated by the accent border' },
  // A selected tag is marked by a darker fill, not a ring.
  '--c2-tag-input__tag__focus--background': { token: 'color-outline-variant' },
  // The error state is carried by the red border, so no error ring either.
  '--c2-text-field__error__focus--outline': { exclude: 'error state is indicated by the red border' },
  '--c2-date-input__error__focus--outline': { exclude: 'error state is indicated by the red border' },
  '--c2-time-input__error__focus--outline': { exclude: 'error state is indicated by the red border' },
  '--c2-number-input__error__focus--outline': { exclude: 'error state is indicated by the red border' },
  '--c2-tag-input__error__focus--outline': { exclude: 'error state is indicated by the red border' },
  // 1px radii on the colour picker swatch are a detail, not a shape token.
  '--c2-color-select--border-top-left-radius': { exclude: 'swatch detail radius' },
  '--c2-color-select--border-top-right-radius': { exclude: 'swatch detail radius' },
  '--c2-color-select--border-bottom-left-radius': { exclude: 'swatch detail radius' },
  '--c2-color-select--border-bottom-right-radius': { exclude: 'swatch detail radius' },
  // The destructive row tint has no error-container token to hang on; the label itself maps to color-error.
  // The focused row is marked by its highlight, like a hovered one; a ring on top of it is opt-in.
  '--c2-menu-item__focus--outline': { exclude: 'the row highlight is the focus indicator' },
  '--c2-menu-item__destructive__hover--background': { exclude: 'destructive tint (the label maps to color-error)' },
  // The panel description is deliberately the normal weight, which the scale has no token for.
  '--c2-navigation-menu-link__description--font-weight': { exclude: 'normal weight, below the font-weight scale' },
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
  // The pressed trigger sits one step past the hover surface; the ramp has no token for that step, so it is the hover
  // surface tinted towards the ink, like the copy button's pressed state.
  '--c2-theme-select__trigger__active--background': {
    token: 'color-surface-container',
    value: 'color-mix(in srgb, var(--c2-theme--color-surface-container, #f4f4f5), var(--c2-theme--color-on-surface, #18181b) 8%)',
  },
  // Code editor: the foreground and the code font size belong to the syntax palette, which is themed as one unit
  // through `--c2-code-editor__theme--token-*` (the `theme` part is excluded wholesale, as it is for the viewer).
  // Splitting the foreground off would leave a theme-aware body colour over a fixed token palette.
  '--c2-code-editor--color': { exclude: 'code foreground; the syntax palette is themed as a unit' },
  '--c2-code-editor--font-size': { exclude: 'code font size, off the 12/14 text scale' },
  // The editor's three accent tints are alpha blends the colour ramp has no entries for, but they should still
  // follow the app's accent — `color-mix` expresses that without a token per opacity step.
  '--c2-code-editor__active-line--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, #0265dc) 4%, transparent)',
  },
  '--c2-code-editor__selection--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, #0265dc) 18%, transparent)',
  },
  '--c2-code-editor__matching-bracket--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, #0265dc) 16%, transparent)',
  },
  // Steps: success and warning are outcomes, and stay stable across brand themes the way status-panel's do — the
  // ramp has no token for either. `error`, `running` and `current` do map, to color-error and color-primary.
  '--c2-step__success--color': { exclude: 'semantic success colour' },
  '--c2-step__warning--color': { exclude: 'semantic warning colour' },
  // The secondary runs are deliberately the normal weight, which the scale has no token for.
  '--c2-step__detail--font-weight': { exclude: 'normal weight, below the font-weight scale' },
  '--c2-step__trailing--font-weight': { exclude: 'normal weight, below the font-weight scale' },
  // A dashboard pane is bare by design — the surface it holds owns the radius — while its resize handle floats over
  // that content, so the bar under the pointer is an accent tint rather than one of the surfaces.
  '--c2-dashboard--border-radius': { exclude: 'square by default; the grid is a frame only once an app fills it' },
  '--c2-dash-card--border-radius': { exclude: 'bare pane; the surface inside it owns the radius' },
  '--c2-dash-card__handle__hover--background': { token: 'color-primary-glow' },
  // Symbols are drawn with colour roles, not parts: each role follows the surface or accent token it stands in for,
  // so a brand theme and dark mode recolour every illustration. The outline is the stronger border grey (the text
  // rule would read #a1a1aa as secondary text); the golden highlight, success and warning stay stable, as status-panel's and steps' do.
  '--c2-symbol__backdrop--color': { token: 'color-surface-container' },
  '--c2-symbol__surface--color': { token: 'color-surface' },
  '--c2-symbol__line--color': { token: 'color-outline-strong' },
  '--c2-symbol__primary-soft--color': { token: 'color-primary-container' },
  '--c2-symbol__accent--color': { exclude: 'decorative golden highlight' },
  '--c2-symbol__success--color': { exclude: 'semantic success colour' },
  '--c2-symbol__warning--color': { exclude: 'semantic warning colour' },
  // Reorder list swipe actions are semantic colours, like the todo list's: they stay put in every theme.
  '--c2-reorder-list__swipe-action__danger--background-color': { token: 'color-error' },
  '--c2-reorder-list__swipe-action__warning--background-color': { exclude: 'semantic warning action' },
  '--c2-reorder-list__swipe-action__success--background-color': { exclude: 'semantic success action' },
  '--c2-reorder-list__swipe-action__neutral--background-color': { exclude: 'neutral action fill under white text' },
  '--c2-reorder-list__swipe-action--color': { exclude: 'white text on the coloured actions' },
  // Todo list: the pens follow the chart palette and the error colour, so a brand theme and dark mode recolour the
  // ink as they recolour a chart; the highlighters are hues mixed into whatever background the list has, and the
  // swipe actions are semantic colours that stay put.
  '--c2-todo-list__container--box-shadow': { token: 'shadow-md' },
  '--c2-todo-list__on-accent--color': { token: 'color-on-primary' },
  '--c2-todo-list__add--border-color': { token: 'color-outline' },
  '--c2-todo-list__row__divider--color': { token: 'color-surface-container' },
  '--c2-todo-list__mark--color': { token: 'color-outline-strong' },
  '--c2-todo-list__dropped--color': { token: 'color-error' },
  '--c2-todo-list__pen-blue--color': { token: 'chart-series-1' },
  '--c2-todo-list__pen-red--color': { token: 'color-error' },
  '--c2-todo-list__pen-green--color': { token: 'chart-series-3' },
  '--c2-todo-list__pen-violet--color': { token: 'chart-series-6' },
  '--c2-todo-list__pen-graphite--color': { token: 'color-on-surface-variant' },
  '--c2-todo-list__toast--background-color': { token: 'color-inverse-surface' },
  '--c2-todo-list__toast--color': { token: 'color-on-inverse-surface' },
  '--c2-todo-list__highlight-yellow--color': { exclude: 'highlighter hue, mixed into the list background' },
  '--c2-todo-list__highlight-green--color': { exclude: 'highlighter hue, mixed into the list background' },
  '--c2-todo-list__highlight-blue--color': { exclude: 'highlighter hue, mixed into the list background' },
  '--c2-todo-list__highlight-pink--color': { exclude: 'highlighter hue, mixed into the list background' },
  '--c2-todo-list__highlight-orange--color': { exclude: 'highlighter hue, mixed into the list background' },
  '--c2-todo-list__highlight-violet--color': { exclude: 'highlighter hue, mixed into the list background' },
  '--c2-todo-list__heading--font-size': { exclude: 'list heading, one step above body text' },
  // Carousel indicator dots are small fills, not surfaces: they take the strong outline and the muted text colour.
  '--c2-carousel__indicator--background-color': { token: 'color-outline-strong' },
  '--c2-carousel__indicator__hover--background-color': { token: 'color-on-surface-variant' },
  // Timeline: the connector is the standard hairline grey; success and warning markers are semantic status colours.
  '--c2-timeline-item__connector--background': { token: 'color-outline-variant' },
  '--c2-timeline-item__marker__success--border-color': { exclude: 'success status colour' },
  '--c2-timeline-item__marker__success--color': { exclude: 'success status colour' },
  '--c2-timeline-item__marker__warning--border-color': { exclude: 'warning status colour' },
  '--c2-timeline-item__marker__warning--color': { exclude: 'warning status colour' },
  // The split panel divider is a line drawn as a background: the hairline at rest, the hover border colour under the pointer.
  '--c2-split-panel__divider--background': { token: 'color-outline-variant' },
  '--c2-split-panel__divider__hover--background': { token: 'color-outline-strong' },
  // Flow: the edges of steps that have not run are drawn lines, the resting outline grey; the dot grid is that grey at
  // 40% strength, so it stays a backdrop on any canvas colour in either mode. The success and warning colours are
  // semantic status colours, as on c2-steps.
  '--c2-flow__dot--color': { token: 'color-outline', value: 'color-mix(in srgb, var(--c2-theme--color-outline, #d4d4d8) 40%, transparent)' },
  '--c2-flow__edge--color': { token: 'color-outline' },
  '--c2-flow__success--color': { exclude: 'success status colour' },
  '--c2-flow__warning--color': { exclude: 'warning status colour' },
  // Notepad: the paper, rules, margin and inks are mixed from the surface tokens rather than replaced by them, so the
  // sheet stays slightly warm paper with blue rules in light mode and turns into night paper (dark sheet, light ink,
  // dimmed rules, brighter inks) under a dark theme. Highlighters are translucent on purpose, the washi-tape toolbar
  // and the glued binding are materials with their own colour, and the handwriting face is the component's identity.
  '--c2-notepad__sheet--background': {
    token: 'color-surface',
    value: 'color-mix(in srgb, var(--c2-theme--color-surface, #ffffff) 90%, #f3ead0)',
  },
  '--c2-notepad__writing--color': {
    token: 'color-on-surface',
    value: 'color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 80%, #2f4fb0)',
  },
  '--c2-notepad__rule--color': { token: 'color-surface', value: 'color-mix(in srgb, #8fb0dc 50%, var(--c2-theme--color-surface, #ffffff))' },
  '--c2-notepad__margin--color': { token: 'color-surface', value: 'color-mix(in srgb, #d9534f 50%, var(--c2-theme--color-surface, #ffffff))' },
  '--c2-notepad__ink-blue--color': { token: 'color-on-surface', value: 'color-mix(in srgb, #3b5bdb 70%, var(--c2-theme--color-on-surface, #18181b))' },
  '--c2-notepad__ink-red--color': { token: 'color-on-surface', value: 'color-mix(in srgb, #e03131 70%, var(--c2-theme--color-on-surface, #18181b))' },
  '--c2-notepad__ink-green--color': { token: 'color-on-surface', value: 'color-mix(in srgb, #2f9e44 70%, var(--c2-theme--color-on-surface, #18181b))' },
  '--c2-notepad__ink-black--color': { token: 'color-on-surface' },
  '--c2-notepad__placeholder--color': { token: 'color-on-surface-variant' },
  '--c2-notepad__header--color': { token: 'color-on-surface-variant' },
  '--c2-notepad__perforation--color': { token: 'color-outline-strong' },
  '--c2-notepad__selection--background': { exclude: 'translucent highlighter hue' },
  '--c2-notepad__highlight-yellow--background': { exclude: 'translucent highlighter hue' },
  '--c2-notepad__highlight-green--background': { exclude: 'translucent highlighter hue' },
  '--c2-notepad__highlight-pink--background': { exclude: 'translucent highlighter hue' },
  // The washi tape is a little of its kraft hue on the surface: cream on light paper, dark kraft under a dark theme.
  '--c2-notepad__toolbar--background': {
    token: 'color-surface',
    value: 'color-mix(in srgb, #c9b98f 30%, var(--c2-theme--color-surface, #ffffff))',
  },
  '--c2-notepad__toolbar--color': { token: 'color-on-surface' },
  '--c2-notepad__toolbar__button__active--background': {
    token: 'color-on-surface',
    value: 'color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 14%, transparent)',
  },
  // Paper colours are a pastel of their hue on the surface, so they darken with it and keep the theme ink readable.
  '--c2-notepad__paper-yellow--background': { token: 'color-surface', value: 'color-mix(in srgb, #f5d547 35%, var(--c2-theme--color-surface, #ffffff))' },
  '--c2-notepad__paper-green--background': { token: 'color-surface', value: 'color-mix(in srgb, #bddcb2 35%, var(--c2-theme--color-surface, #ffffff))' },
  '--c2-notepad__paper-blue--background': { token: 'color-surface', value: 'color-mix(in srgb, #b8ceee 35%, var(--c2-theme--color-surface, #ffffff))' },
  '--c2-notepad__paper-pink--background': { token: 'color-surface', value: 'color-mix(in srgb, #f4b8c3 35%, var(--c2-theme--color-surface, #ffffff))' },
  // Each paper's ink is the theme text colour with a touch of the paper's hue, so it follows light and dark mode.
  '--c2-notepad__paper-yellow--color': { token: 'color-on-surface', value: 'color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 85%, #966800)' },
  '--c2-notepad__paper-green--color': { token: 'color-on-surface', value: 'color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 85%, #39cc57)' },
  '--c2-notepad__paper-blue--color': { token: 'color-on-surface', value: 'color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 85%, #3390ff)' },
  '--c2-notepad__paper-pink--color': { token: 'color-on-surface', value: 'color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 85%, #ff4786)' },
  // Night paper is a dark sheet with light ink in either mode.
  '--c2-notepad__paper-night--background': { exclude: 'night paper is dark in both modes' },
  '--c2-notepad__paper-night--color': { exclude: 'night paper is dark in both modes' },
  '--c2-notepad__glue--background': { exclude: 'binding material colour' },
  // Each pad's own sheet colour is mixed into the surface like the pastel papers, so a legal pad or a sticky note
  // darkens with a dark theme instead of glowing on it.
  '--c2-notepad__pad-legal--background': { token: 'color-surface', value: 'color-mix(in srgb, #f5d547 35%, var(--c2-theme--color-surface, #ffffff))' },
  '--c2-notepad__pad-sticky--background': { token: 'color-surface', value: 'color-mix(in srgb, #ffd23f 40%, var(--c2-theme--color-surface, #ffffff))' },
  '--c2-notepad__pad-index-card--background': { token: 'color-surface', value: 'color-mix(in srgb, var(--c2-theme--color-surface, #ffffff) 94%, #9ec1e8)' },
  '--c2-notepad__headline--color': { exclude: 'transparent unless a pad draws it' },
  '--c2-notepad__writing--font-family': { exclude: 'the bundled handwriting face is the component identity' },
  '--c2-notepad__sheet--border-radius': { exclude: 'paper corner, not a control radius' },
  '--c2-notepad__sheet--box-shadow': { exclude: 'paper elevation over the desk' },
  '--c2-notepad__sheet__focus--box-shadow': { exclude: 'paper elevation over the desk' },
  // Page editor: the floating toolbar and menus are popovers, and the caret's code block and selection follow the accent.
  '--c2-page-editor__popover--box-shadow': { token: 'shadow-md' },
  '--c2-page-editor__selection--background': {
    token: 'color-primary',
    value: 'color-mix(in srgb, var(--c2-theme--color-primary, rgb(2, 101, 220)) 18%, transparent)',
  },
  '--c2-page-editor__code-block__focus--box-shadow': {
    token: 'color-primary',
    value: '0 0 0 2px color-mix(in srgb, var(--c2-theme--color-primary, rgb(2, 101, 220)) 25%, transparent)',
  },
  '--c2-page-editor__quote--border-left': { exclude: 'follows the text colour' },
  '--c2-page-editor__code--font-family': { exclude: 'monospace code face' },
  '--c2-page-editor__inline-code--background': { exclude: 'translucent tint, reads on any surface' },
  '--c2-page-editor__color-gray--color': { exclude: 'named hue, mixed with the text colour inside the component' },
  '--c2-page-editor__color-brown--color': { exclude: 'named hue, mixed with the text colour inside the component' },
  '--c2-page-editor__color-orange--color': { exclude: 'named hue, mixed with the text colour inside the component' },
  '--c2-page-editor__color-yellow--color': { exclude: 'named hue, mixed with the text colour inside the component' },
  '--c2-page-editor__color-green--color': { exclude: 'named hue, mixed with the text colour inside the component' },
  '--c2-page-editor__color-blue--color': { exclude: 'named hue, mixed with the text colour inside the component' },
  '--c2-page-editor__color-purple--color': { exclude: 'named hue, mixed with the text colour inside the component' },
  '--c2-page-editor__color-red--color': { exclude: 'named hue, mixed with the text colour inside the component' },
  '--c2-page-editor__inline-code--color': { exclude: 'named hue, mixed with the text colour inside the component' },
  '--c2-page-editor__background-gray--background': { exclude: 'translucent named tint, reads on any surface' },
  '--c2-page-editor__background-brown--background': { exclude: 'translucent named tint, reads on any surface' },
  '--c2-page-editor__background-orange--background': { exclude: 'translucent named tint, reads on any surface' },
  '--c2-page-editor__background-yellow--background': { exclude: 'translucent named tint, reads on any surface' },
  '--c2-page-editor__background-green--background': { exclude: 'translucent named tint, reads on any surface' },
  '--c2-page-editor__background-blue--background': { exclude: 'translucent named tint, reads on any surface' },
  '--c2-page-editor__background-purple--background': { exclude: 'translucent named tint, reads on any surface' },
  '--c2-page-editor__background-red--background': { exclude: 'translucent named tint, reads on any surface' },
  '--c2-page-editor__syntax-keyword--color': { exclude: 'syntax colours are not themed' },
  '--c2-page-editor__syntax-string--color': { exclude: 'syntax colours are not themed' },
  '--c2-page-editor__syntax-function--color': { exclude: 'syntax colours are not themed' },
  '--c2-page-editor__syntax-constant--color': { exclude: 'syntax colours are not themed' },
  '--c2-page-editor__syntax-comment--color': { exclude: 'syntax colours are not themed' },
  '--c2-page-editor__syntax-parameter--color': { exclude: 'syntax colours are not themed' },
  '--c2-page-editor__syntax-link--color': { exclude: 'syntax colours are not themed' },
}
