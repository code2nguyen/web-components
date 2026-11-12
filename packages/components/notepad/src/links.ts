import type { Node as ProseNode } from 'prosemirror-model'
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

/** A web address found in a line of text: where it is and the address it opens. */
export interface TextLink {
  from: number
  to: number
  href: string
}

// An address ends at a space, and at the punctuation of a script written without spaces (`见https://a.com。然后`).
const ADDRESS = /(?:https?:\/\/|www\.)[^\s<>\u3000-\u303f\uff00-\uff65]+/gi
const TRAILING = /[.,;:!?'"*]$/

/**
 * The web addresses in `text`: `http://`, `https://` and `www.` ones, which is all a page links. The punctuation that
 * ends a sentence is left out of the address, and so is a closing bracket the address did not open.
 */
export function findLinks(text: string): TextLink[] {
  const links: TextLink[] = []
  for (const match of text.matchAll(ADDRESS)) {
    // Not the tail of a word (`awww.example`), which is not an address.
    if (match.index > 0 && /[\w@]/.test(text[match.index - 1])) continue
    let address = match[0]
    for (;;) {
      if (TRAILING.test(address)) address = address.slice(0, -1)
      else if (address.endsWith(')') && address.split(')').length > address.split('(').length) address = address.slice(0, -1)
      else if (address.endsWith(']') && address.split(']').length > address.split('[').length) address = address.slice(0, -1)
      else break
    }
    const href = safeWebAddress(/^www\./i.test(address) ? `https://${address}` : address)
    if (href) links.push({ from: match.index, to: match.index + address.length, href })
  }
  return links
}

/** The address as the browser reads it, or nothing when it is not a web address with a host. */
function safeWebAddress(address: string): string | null {
  try {
    const url = new URL(address)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url.href : null
  } catch {
    return null
  }
}

/** The links of a page, as links (`live`) and as the same marks with nothing to open (`plain`). */
interface LinkSets {
  live: DecorationSet
  plain: DecorationSet
}

const linksKey = new PluginKey<LinkSets>('c2-notepad-links')

function decorate(doc: ProseNode): LinkSets {
  const live: Decoration[] = []
  const plain: Decoration[] = []
  doc.forEach((block, offset) => {
    if (!block.isTextblock) return
    // A line holds text only, so a position in its text is a position in the document.
    for (const link of findLinks(block.textContent)) {
      const from = offset + 1 + link.from
      const to = offset + 1 + link.to
      // Not draggable: a drag that starts on an address selects its text, as anywhere else on the page.
      live.push(
        Decoration.inline(
          from,
          to,
          { nodeName: 'a', class: 'link', href: link.href, target: '_blank', rel: 'noopener noreferrer', draggable: 'false' },
          { href: link.href },
        ),
      )
      plain.push(Decoration.inline(from, to, { nodeName: 'a', class: 'link' }))
    }
  })
  return { live: DecorationSet.create(doc, live), plain: DecorationSet.create(doc, plain) }
}

/**
 * Draws every web address written on the page as a link. The document is not changed: an address stays plain text in
 * the value, and stops being a link as soon as it is edited into something else. While `openable` says no (a disabled
 * notepad), the addresses keep their look but are not links: nothing to focus, nothing to open.
 */
export function links(openable: () => boolean): Plugin<LinkSets> {
  return new Plugin<LinkSets>({
    key: linksKey,
    state: {
      init: (_config, state) => decorate(state.doc),
      apply: (tr, sets) => (tr.docChanged ? decorate(tr.doc) : sets),
    },
    props: {
      decorations: (state) => {
        const sets = linksKey.getState(state)
        return openable() ? sets?.live : sets?.plain
      },
    },
  })
}

/** The address of the link the caret is in, or at an end of. */
export function linkAtCaret(state: EditorState): string | null {
  const { from, empty } = state.selection
  if (!empty) return null
  const [link] = linksKey.getState(state)?.live.find(from, from) ?? []
  return (link?.spec as { href?: string } | undefined)?.href ?? null
}
