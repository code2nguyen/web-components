import { html, svg, type TemplateResult } from 'lit'

/** What a file is, for its icon and its Kind column. */
export type FileCategory = 'folder' | 'pdf' | 'image' | 'video' | 'audio' | 'archive' | 'document' | 'spreadsheet' | 'presentation' | 'text' | 'code' | 'file'

const EXTENSIONS: Record<string, FileCategory> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  avif: 'image',
  heic: 'image',
  bmp: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  avi: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  ogg: 'audio',
  flac: 'audio',
  zip: 'archive',
  gz: 'archive',
  tgz: 'archive',
  tar: 'archive',
  rar: 'archive',
  '7z': 'archive',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  pages: 'document',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  numbers: 'spreadsheet',
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
  key: 'presentation',
  txt: 'text',
  md: 'text',
  log: 'text',
  json: 'code',
  js: 'code',
  mjs: 'code',
  ts: 'code',
  tsx: 'code',
  jsx: 'code',
  html: 'code',
  css: 'code',
  scss: 'code',
  py: 'code',
  rb: 'code',
  go: 'code',
  rs: 'code',
  java: 'code',
  c: 'code',
  cpp: 'code',
  sh: 'code',
  yml: 'code',
  yaml: 'code',
  xml: 'code',
  sql: 'code',
}

const MIME_PREFIX: [RegExp, FileCategory][] = [
  [/^application\/pdf$/, 'pdf'],
  [/^image\//, 'image'],
  [/^video\//, 'video'],
  [/^audio\//, 'audio'],
  [/(zip|x-tar|gzip|x-7z|x-rar|compressed)/, 'archive'],
  [/(wordprocessingml|msword|opendocument\.text|rtf)/, 'document'],
  [/(spreadsheetml|ms-excel|opendocument\.spreadsheet|text\/csv)/, 'spreadsheet'],
  [/(presentationml|ms-powerpoint|opendocument\.presentation)/, 'presentation'],
  [/(json|javascript|typescript|x-python|x-sh|html|css|xml|yaml|x-sql)/, 'code'],
  [/^text\//, 'text'],
]

/** The extension of a file name in upper case (`PNG`), or an empty string. */
export function fileFormat(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : ''
}

/** Sorts a file into a category from its MIME type, else from its extension. */
export function fileCategory(item: { kind: string; name: string; type?: string }): FileCategory {
  if (item.kind === 'folder') return 'folder'
  const type = (item.type ?? '').toLowerCase()
  if (type) for (const [pattern, category] of MIME_PREFIX) if (pattern.test(type)) return category
  return EXTENSIONS[fileFormat(item.name).toLowerCase()] ?? 'file'
}

const page = svg`<path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" />`

/** The 24×24 icon of a category, drawn in `currentColor`. */
export function fileIcon(category: FileCategory): TemplateResult {
  switch (category) {
    case 'folder':
      return html`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
      </svg>`
    case 'image':
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4 17 5-5 4 4 3-3 4 4" />
      </svg>`
    case 'video':
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m10 9 5 3-5 3z" />
      </svg>`
    case 'audio':
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        ${page}
        <path d="M10 17.5V11l5-1.5V16" />
        <circle cx="9" cy="17.5" r="1.3" />
        <circle cx="14" cy="16" r="1.3" />
      </svg>`
    case 'pdf':
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        ${page}
        <path d="M9 14h6M9 17h4" />
      </svg>`
    case 'archive':
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        ${page}
        <path d="M11 6h1M11 8h1M11 10h1M10.5 13h2v3h-2z" />
      </svg>`
    case 'spreadsheet':
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        ${page}
        <path d="M9 11h6v7H9zM9 14.5h6M12 11v7" />
      </svg>`
    case 'presentation':
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        ${page}
        <rect x="9" y="11" width="6" height="5" rx="0.5" />
        <path d="M12 16v2" />
      </svg>`
    case 'code':
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        ${page}
        <path d="m10 12-2 2 2 2M14 12l2 2-2 2" />
      </svg>`
    case 'document':
    case 'text':
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        ${page}
        <path d="M9 12h6M9 15h6M9 18h4" />
      </svg>`
    default:
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${page}</svg>`
  }
}
