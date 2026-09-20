import { micromark } from 'micromark'

/** Renders the small Markdown subset used by custom-elements manifest descriptions without trusting embedded HTML. */
export function renderManifestDescription(description?: string): string {
  if (!description) return ''

  const html = micromark(description)
  const firstParagraphEnd = html.indexOf('</p>')

  // Table cells and element leads already provide their own block container. Avoid adding a nested paragraph for the
  // usual one-line description, while preserving real multi-paragraph documentation when it appears in a manifest.
  if (html.startsWith('<p>') && firstParagraphEnd === html.trimEnd().length - '</p>'.length) {
    return html.slice('<p>'.length, firstParagraphEnd)
  }

  return html
}
