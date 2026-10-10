import { Lexer, Marked, type Links, type Token } from 'marked'
import { heal } from './heal'
import { mathExtensions, type MathMode } from './math-extension'

export interface LexOptions {
  breaks: boolean
  math: MathMode
}

export interface LexResult {
  /** Top-level blocks to render (spacing tokens dropped). */
  blocks: Token[]
  /** Reference definitions found in the whole document. */
  links: Links
  /** Index of the first block lexed from the healed tail, or -1 when nothing is streaming. */
  tailStart: number
}

const instances = new Map<string, Marked>()

/** marked configured once per option set; only its lexer is used, never its HTML renderer. */
function markedFor(options: LexOptions): Marked {
  const key = `${options.breaks}:${options.math}`
  let instance = instances.get(key)
  if (!instance) {
    instance = new Marked({ gfm: true, breaks: options.breaks, extensions: mathExtensions(options.math) })
    instances.set(key, instance)
  }
  return instance
}

function lexWith(marked: Marked, source: string, links?: LexResult['links']) {
  const lexer = new Lexer(marked.defaults)
  if (links) Object.assign(lexer.tokens.links, links)
  return lexer.lex(source)
}

/**
 * Lexes a document into top-level blocks. While `streaming`, the last block may be unfinished: it is lexed again
 * from its healed source (see `heal`) with the document's reference definitions, so `**bold`, an open fence or a
 * half-typed link render sensibly. Every block keeps the `raw` source the renderer memoizes on.
 */
export function lexBlocks(source: string, options: LexOptions, streaming: boolean): LexResult {
  const marked = markedFor(options)
  const tokens = lexWith(marked, source)
  const links = { ...tokens.links }
  const blocks = tokens.filter((token) => token.type !== 'space' && token.type !== 'def')
  if (!streaming || blocks.length === 0) return { blocks, links, tailStart: -1 }
  const tail = blocks[blocks.length - 1]
  const healed = heal(tail.raw)
  if (healed === tail.raw.replace(/\s+$/, '')) return { blocks, links, tailStart: blocks.length - 1 }
  const tailBlocks = lexWith(marked, healed, links).filter((token) => token.type !== 'space' && token.type !== 'def')
  return { blocks: [...blocks.slice(0, -1), ...tailBlocks], links, tailStart: blocks.length - 1 }
}
