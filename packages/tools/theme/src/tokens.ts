/**
 * The `@c2n/theme` design tokens.
 *
 * Tokens follow the component variable grammar with the pseudo-component prefix `c2-theme` and no part
 * segment: `--c2-theme--<name>`. The generated `base.css` maps every `@c2n/*` component variable onto one
 * of them, keeping the component's own default as the innermost fallback, e.g.
 * `--c2-list--border-top: var(--c2-theme--border, var(--c2-theme--border-width, 1px) solid var(--c2-theme--color-outline, #e4e4e7))`.
 *
 * Keep this file to erasable TypeScript syntax: the theme generator imports it directly under Node.
 */

export const TOKEN_PREFIX = '--c2-theme--'

export type TokenCategory = 'color' | 'font' | 'radius' | 'border' | 'focus' | 'disabled' | 'motion' | 'shadow'

export interface TokenDef {
  /** Full custom property name, e.g. `--c2-theme--color-primary`. */
  name: string
  category: TokenCategory
  /** Light value. `null` means "not set by default" (the component fallback applies). */
  light: string | null
  /** Dark value; omitted when the token is theme-invariant. */
  dark?: string
  description: string
}

function token(name: string, category: TokenCategory, light: string | null, description: string, dark?: string): TokenDef {
  return { name: `${TOKEN_PREFIX}${name}`, category, light, dark, description }
}

export const tokens: TokenDef[] = [
  // Colour roles
  token('color-primary', 'color', '#0265dc', 'Accent colour: filled buttons, selected states, focused borders, links.', '#5aa3ff'),
  token('color-primary-hover', 'color', '#0154b8', 'Accent colour on hover.', '#7bb6ff'),
  token('color-primary-active', 'color', '#01469a', 'Accent colour while pressed.', '#9cc9ff'),
  token('color-on-primary', 'color', '#ffffff', 'Text and icons drawn on the accent colour.', '#032a5c'),
  token('color-primary-container', 'color', '#edf1fe', 'Soft accent surface, e.g. a selected list item.', '#0f2d5c'),
  token('color-surface', 'color', '#ffffff', 'Default surface of inputs, lists, cards, dialogs.', '#18181b'),
  token('color-surface-container-low', 'color', '#fafafa', 'Slightly raised surface: side navigation, read-only fields, subtle hover.', '#1f1f23'),
  token('color-surface-container', 'color', '#f4f4f5', 'Hover surface for rows and icon buttons.', '#27272a'),
  token('color-on-surface', 'color', '#18181b', 'Primary text colour.', '#f4f4f5'),
  token('color-on-surface-variant', 'color', '#71717a', 'Secondary text, placeholders, icons, supporting text.', '#a1a1aa'),
  token('color-outline', 'color', '#d4d4d8', 'Resting border colour of inputs, cards and lists.', '#3f3f46'),
  token('color-outline-variant', 'color', '#e4e4e7', 'Hairline dividers and light borders.', '#27272a'),
  token('color-outline-strong', 'color', '#a1a1aa', 'Border colour on hover.', '#52525b'),
  token('color-error', 'color', '#dc2626', 'Error borders, error text, required indicators.', '#f87171'),
  token('color-scrim', 'color', 'rgba(9, 9, 11, 0.45)', 'Backdrop behind dialogs and drawers.', 'rgba(0, 0, 0, 0.6)'),
  token('color-inverse-surface', 'color', '#18181b', 'High-contrast surface, e.g. tooltips.', '#f4f4f5'),
  token('color-on-inverse-surface', 'color', '#fafafa', 'Text drawn on the inverse surface.', '#18181b'),
  // Typography
  token('font-family', 'font', null, 'Font family of every component. Unset by default so components inherit the page font.'),
  token('font-size-sm', 'font', '12px', 'Small text: supporting text, tooltips, descriptions, timestamps.'),
  token('font-size-md', 'font', '14px', 'Body text: buttons, inputs, list items, dialog content.'),
  token('font-weight-medium', 'font', '500', 'Medium weight: buttons, headers, tooltips.'),
  token('font-weight-semibold', 'font', '600', 'Semibold weight: dialog titles, list headings, avatars.'),
  // Shape
  token('radius-sm', 'radius', '4px', 'Small radius: checkboxes, link buttons, inline controls.'),
  token('radius-md', 'radius', '6px', 'Default radius: buttons, inputs, list items, tooltips.'),
  token('radius-lg', 'radius', '8px', 'Large radius: cards, panels, popovers.'),
  token('radius-xl', 'radius', '14px', 'Extra large radius: dialogs.'),
  token('radius-full', 'radius', '999px', 'Pill / circle radius: avatars, icon buttons.'),
  // Borders
  token('border-width', 'border', '1px', 'Width of every themed border.'),
  token('border', 'border', null, 'Complete resting border shorthand. Unset by default: it falls back to `border-width solid color-outline`.'),
  // Interaction
  token('focus-ring', 'focus', '2px solid rgba(2, 101, 220, 0.4)', 'Focus-visible outline of every component.', '2px solid rgba(90, 163, 255, 0.5)'),
  token('disabled-opacity', 'disabled', '0.38', 'Opacity of disabled components.'),
  token('motion-scale', 'motion', '1', 'Multiplier applied to every transition and animation duration (0 disables motion).'),
  // Elevation
  token('shadow-md', 'shadow', '0 8px 24px rgba(24, 24, 27, 0.08)', 'Shadow of popovers, menus and tooltips.', '0 8px 24px rgba(0, 0, 0, 0.45)'),
  token('shadow-lg', 'shadow', '0 24px 60px rgba(0, 0, 0, 0.25)', 'Shadow of dialogs and drawers.', '0 24px 60px rgba(0, 0, 0, 0.6)'),
]

export const tokenNames = tokens.map((t) => t.name)

/** Look up a token by its full name. */
export function getToken(name: string): TokenDef | undefined {
  return tokens.find((t) => t.name === name)
}
