export const APP_BASE_PATH = '/web-components/demo/observability-nextjs'

export function withAppBasePath(href: string): string {
  if (!href.startsWith('/') || href.startsWith('//') || href === APP_BASE_PATH || href.startsWith(`${APP_BASE_PATH}/`)) return href
  return `${APP_BASE_PATH}${href}`
}

export function parseDetailReturnContext(input: string | URLSearchParams): string | null {
  try {
    const parameters = typeof input === 'string' ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input) : input
    const value = parameters.get('return')
    if (!value || value.length > 2_000 || value.startsWith('//')) return null
    const url = new URL(value, 'https://local.invalid')
    if (url.origin !== 'https://local.invalid') return null
    if (!/^\/(?:services|traces|incidents)\/[a-z0-9-]+\/?$/.test(url.pathname)) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}
