const REPOSITORY_ROOT = 'https://github.com/code2nguyen/web-components/blob/develop/'
const DOCS_ORIGIN = 'https://code2nguyen.github.io'

export function componentDocsUrl(path: `/web-components/components/${string}`): string {
  return `${DOCS_ORIGIN}${path.replace(/\/+$/, '')}/`
}

export function componentSourceUrl(path: string): string {
  const safe = path.replace(/^\/+/, '')
  if (!safe.startsWith('apps/examples/observability-nextjs/')) throw new Error('Source path must remain inside the observability example')
  return `${REPOSITORY_ROOT}${safe}`
}
