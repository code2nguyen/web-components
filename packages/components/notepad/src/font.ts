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
      const face = new FontFace(NOTEPAD_FONT_FAMILY, `url(${source}) format('woff2')`, { display: 'swap' })
      document.fonts.add(face)
      await face.load()
    })
    .catch(() => {})
  return loading
}
