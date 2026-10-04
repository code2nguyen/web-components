/** Languages offered by a code block's language picker: id (as written after the fence) and label. */
export const LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: '', label: 'Plain text' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'jsx', label: 'JSX' },
  { id: 'tsx', label: 'TSX' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'json', label: 'JSON' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'bash', label: 'Bash' },
  { id: 'python', label: 'Python' },
  { id: 'sql', label: 'SQL' },
  { id: 'yaml', label: 'YAML' },
  { id: 'java', label: 'Java' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'swift', label: 'Swift' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'diff', label: 'Diff' },
]

const ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  py: 'python',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  rb: 'ruby',
  rs: 'rust',
  kt: 'kotlin',
  text: '',
  txt: '',
  plain: '',
  plaintext: '',
}

/** The canonical id of a fence language (`ts` → `typescript`); unknown ids are kept as written. */
export function normalizeLanguage(language: string | null | undefined): string {
  const id = (language ?? '').trim().toLowerCase()
  return id in ALIASES ? ALIASES[id] : id
}

export function languageLabel(language: string): string {
  const id = normalizeLanguage(language)
  return LANGUAGES.find((each) => each.id === id)?.label ?? (id ? id : 'Plain text')
}
