import type { ConsoleMessage, Page } from '@playwright/test'

/**
 * Two 404s the browser logs are expected, and each is matched by its request URL, never by the message alone:
 *
 * - an unknown id (`/services/not-a-service/`), which the static host answers with the 404 page and a 404 status;
 * - a Next.js 16.3 client navigation's RSC payload request for a route without its trailing slash. With
 *   `output: 'export'` and `trailingSlash: true`, the App Router's segment cache builds the canonical URL of a
 *   navigation without the slash (`router.push('/traces/?x')` lands on `/traces?x`) and then asks for `/traces.txt`,
 *   which the export never writes (it writes `/traces/index.txt`). Next.js recovers with a full document navigation to
 *   the same URL, so the page still arrives; the app avoids it where the change is client state (LogResults).
 */
function isExpectedNotFound(message: ConsoleMessage): boolean {
  if (!/status of 404/.test(message.text())) return false
  const url = new URL(message.location().url)
  return /\/not-an?-[a-z]+\/$/.test(url.pathname) || (url.pathname.endsWith('.txt') && url.searchParams.has('_rsc'))
}

/** Fails the test on any other browser console error. */
export function failOnConsoleErrors(page: Page): void {
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedNotFound(message)) throw new Error(`Browser console error: ${message.text()} (${message.location().url})`)
  })
}
