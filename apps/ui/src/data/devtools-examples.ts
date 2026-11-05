import type { FileBrowser, FileBrowserItem } from '@c2n/components/file-browser'
import type { Terminal, TerminalCommandContext } from '@c2n/components/terminal'

/**
 * Makes the developer-tool examples live. `c2-terminal[data-terminal-demo]` gets a pretend CLI for its handler, and
 * `c2-file-browser[data-file-browser-demo="editable"]` plays the application: the browser never changes `items`, so
 * each rename, move, delete and desktop drop is applied here.
 */

const seeded = new WeakSet<Element>()
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true })
  })

// ANSI colours, as a real CLI prints them: green, red, yellow, cyan, dim and reset.
const green = (text: string) => `\u001b[32m${text}\u001b[0m`
const red = (text: string) => `\u001b[31m${text}\u001b[0m`
const yellow = (text: string) => `\u001b[33m${text}\u001b[0m`
const cyan = (text: string) => `\u001b[36m${text}\u001b[0m`
const dim = (text: string) => `\u001b[90m${text}\u001b[0m`

async function* logs(service: string, signal: AbortSignal): AsyncIterable<string> {
  const lines = ['GET /health 200 2ms', 'GET /api/orders 200 41ms', 'POST /api/checkout 201 118ms', 'GET /api/orders/1182 404 6ms']
  for (let index = 0; !signal.aborted && index < 40; index += 1) {
    await wait(450, signal)
    if (signal.aborted) return
    const line = lines[index % lines.length]
    yield `${dim(new Date().toISOString().slice(11, 19))} ${cyan(service)} ${line.includes(' 404 ') ? yellow(line) : line}`
  }
}

async function* tests(signal: AbortSignal): AsyncIterable<string> {
  const files: [string, number, boolean][] = [
    ['billing/invoice.spec.ts', 14, true],
    ['billing/tax.spec.ts', 6, true],
    ['billing/refund.spec.ts', 1, false],
  ]
  for (const [file, count, passed] of files) {
    await wait(500, signal)
    if (signal.aborted) return
    yield `${passed ? green('✓') : red('✗')} ${file} ${dim(`(${count} ${count === 1 ? 'test' : 'tests'})`)}`
  }
  yield ''
  yield `Tests  ${red('1 failed')} | ${green('20 passed')} (21)`
}

function acmeCli(_command: string, { name, args, signal }: TerminalCommandContext) {
  switch (name) {
    case 'deploy':
      if (args[0] === 'status') return `Service ${args[1] ?? 'web'}  revision ${cyan('r-2041')}\n  replicas  ${green('6/6 ready')}`
      if (args[0] === 'rollback') return red(`error: revision ${args[args.length - 1] ?? '?'} not found for service "${args[1] ?? 'api'}"`)
      return (async function* () {
        for (const step of ['Building image', 'Pushing to registry', 'Rolling out 6 replicas']) {
          yield `${dim('›')} ${step}…`
          await wait(600, signal)
          if (signal.aborted) return
        }
        yield green(`✓ ${args[0] ?? 'web'} is live at r-2042`)
      })()
    case 'logs':
      return logs(args[0] ?? 'web', signal)
    case 'test':
      return tests(signal)
    default:
      return red(`${name}: command not found. Type help for commands.`)
  }
}

function wireTerminal(terminal: Terminal): void {
  terminal.handler = acmeCli
  terminal.complete = (input) =>
    ['deploy status web', 'deploy web', 'deploy rollback api --to r-1999', 'logs web', 'logs api', 'test --changed'].filter((line) => line.startsWith(input))
}

function wireFileBrowser(browser: FileBrowser): void {
  let next = 1
  const update = (change: (items: FileBrowserItem[]) => FileBrowserItem[]) => (browser.items = change(browser.items))
  const inside = (items: FileBrowserItem[], ids: Set<string>): Set<string> => {
    // A deleted folder takes everything inside it along.
    let grown = true
    while (grown) {
      grown = false
      for (const item of items) {
        if (item.parent && ids.has(item.parent) && !ids.has(item.id)) {
          ids.add(item.id)
          grown = true
        }
      }
    }
    return ids
  }
  browser.addEventListener('item-rename', ({ detail }) =>
    update((items) => items.map((item) => (item.id === detail.item.id ? { ...item, name: detail.name } : item))),
  )
  browser.addEventListener('item-move', ({ detail }) => {
    const moving = new Set(detail.items.map((item) => item.id))
    update((items) => items.map((item) => (moving.has(item.id) ? { ...item, parent: detail.target || null } : item)))
  })
  browser.addEventListener('item-action', ({ detail }) => {
    if (detail.action !== 'delete') return
    update((items) => {
      const gone = inside(items, new Set(detail.items.map((item) => item.id)))
      return items.filter((item) => !gone.has(item.id))
    })
  })
  browser.addEventListener('files-drop', ({ detail }) =>
    update((items) => [
      ...items,
      ...detail.files.map((file) => ({
        id: `upload-${next++}`,
        name: file.name,
        parent: detail.folder || null,
        kind: 'file' as const,
        size: file.size,
        type: file.type,
        modified: Date.now(),
      })),
    ]),
  )
}

function seedExamples(): void {
  document.querySelectorAll<Terminal>('c2-terminal[data-terminal-demo]').forEach((terminal) => {
    if (seeded.has(terminal)) return
    wireTerminal(terminal)
    seeded.add(terminal)
  })
  document.querySelectorAll<FileBrowser>('c2-file-browser[data-file-browser-demo="editable"]').forEach((browser) => {
    if (seeded.has(browser)) return
    wireFileBrowser(browser)
    seeded.add(browser)
  })
}

seedExamples()
new MutationObserver(seedExamples).observe(document.documentElement, { childList: true, subtree: true })
document.addEventListener('astro:page-load', seedExamples)
