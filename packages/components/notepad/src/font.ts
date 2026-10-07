/** Family name the bundled handwriting face (Patrick Hand, SIL OFL 1.1) is registered under. */
export const NOTEPAD_FONT_FAMILY = 'C2 Notepad Hand'

let loading: Promise<void> | undefined

/**
 * Registers the bundled face with `document.fonts`. Called by an element whose writing surface resolves to
 * {@link NOTEPAD_FONT_FAMILY}, so an app that sets its own `--c2-notepad__writing--font-family` never downloads it.
 * `FontFace` touches no markup, which keeps a server-rendered page free of hydration mismatches.
 */
export function loadNotepadFont(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve()
  loading ??= import('./font-data')
    .then(async ({ default: source }) => {
      for (const face of document.fonts) if (face.family.replace(/["']/g, '') === NOTEPAD_FONT_FAMILY) return
      // Patrick Hand keeps 1.04em above the baseline for 0.66em capitals, and 0.31em below: the browser draws the caret
      // that tall, well past the letters and across the rule. Tighter metrics give a 1.04em caret; their difference
      // stays the 0.8em the rules' baseline is computed with (notepad.scss), so the writing still sits on its rule.
      // Glyphs are drawn as before. Browsers without the descriptors keep the font's own metrics.
      const face = new FontFace(NOTEPAD_FONT_FAMILY, `url(${source}) format('woff2')`, {
        display: 'swap',
        ascentOverride: '92%',
        descentOverride: '12%',
        lineGapOverride: '0%',
      })
      document.fonts.add(face)
      await face.load()
    })
    .catch(() => {})
  return loading
}
