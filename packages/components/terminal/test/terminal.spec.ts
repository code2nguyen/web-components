import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

const terminal = (page: Page, selector = 'c2-terminal') => page.locator(selector)
const input = (locator: Locator) => locator.locator('input.input')
const blocks = (locator: Locator) => locator.locator('.output > .block')
const announcement = (locator: Locator) => locator.locator('.announcement')
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')

async function enter(locator: Locator, command: string) {
  await input(locator).fill(command)
  await input(locator).press('Enter')
}

test('a command runs through the handler: ANSI colours are drawn as text, markup stays text, and the parts are named', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-terminal heading="acme-cli · production"><span slot="banner">Acme CLI 4.2.0. Type help for commands.</span></c2-terminal>`)
  await terminal(page).evaluate((element) => {
    ;(element as HTMLElement & { handler: unknown }).handler = (command: string) =>
      command === 'status'
        ? 'Service \u001b[1mweb\u001b[0m  revision \u001b[36mr-2041\u001b[0m\n  replicas  \u001b[32m6/6 ready\u001b[0m\u001b[2J'
        : '<b>not bold</b>'
  })
  await expect(terminal(page)).toHaveHostAria('role', 'region')
  await expect(terminal(page)).toHaveHostAria('aria-label', 'acme-cli · production')
  await expect(terminal(page).locator('[part="titlebar"]')).toContainText('⌃L clear · ⌃C cancel')
  await expect(input(terminal(page))).toHaveAccessibleName('Command')

  await enter(terminal(page), 'status')
  await expect(blocks(terminal(page)).nth(0)).toHaveText('$ status')
  const output = blocks(terminal(page)).nth(1)
  await expect(output.locator('.line')).toHaveText(['Service web  revision r-2041', '  replicas  6/6 ready'])
  await expect(output.locator('.bold')).toHaveText('web')
  await expect(output.locator('.ansi-cyan')).toHaveText('r-2041')
  await expect(output.locator('.ansi-green')).toHaveCSS('color', 'rgb(74, 222, 128)')

  await enter(terminal(page), 'echo')
  await expect(blocks(terminal(page)).nth(3)).toHaveText('<b>not bold</b>')
  await expect(blocks(terminal(page)).nth(3).locator('b')).toHaveCount(0)
  // A short output is read out once the command ends.
  await expect(announcement(terminal(page))).toHaveText('<b>not bold</b>')
  await expect(input(terminal(page))).toBeFocused()
  await accessible(page)
})

test('without a handler the command event carries the parsed words and a print; kinds colour the blocks', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-terminal></c2-terminal>`)
  await watch(terminal(page), 'command')
  await terminal(page).evaluate((element) =>
    element.addEventListener('command', (event) => {
      const { name, args, print } = (event as CustomEvent).detail
      if (name === 'deploy') print(`error: revision ${args[1]} not found for "${args[0]}"`, { kind: 'error' })
      else print('done', { kind: 'success' })
    }),
  )
  await enter(terminal(page), `deploy "my app" r-1999`)
  expect((await events(terminal(page)))[0]).toMatchObject({ command: 'deploy "my app" r-1999', name: 'deploy', args: ['my app', 'r-1999'] })
  await expect(blocks(terminal(page)).nth(1)).toHaveClass(/error/)
  await expect(blocks(terminal(page)).nth(1)).toHaveText('error: revision r-1999 not found for "my app"')
  await enter(terminal(page), 'ok')
  await expect(blocks(terminal(page)).nth(3)).toHaveClass(/success/)
  // An empty line is echoed and fires nothing.
  await enter(terminal(page), '')
  await expect(blocks(terminal(page))).toHaveCount(5)
  expect(await events(terminal(page))).toHaveLength(2)
})

test('a streaming command hides the prompt behind a spinner; Ctrl+C aborts it, prints ^C and gives the prompt back', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-terminal></c2-terminal>`)
  await terminal(page).evaluate((element) => {
    ;(element as HTMLElement & { handler: unknown }).handler = async function* (_command: string, { signal }: { signal: AbortSignal }) {
      ;(window as unknown as { aborted: boolean }).aborted = false
      signal.addEventListener('abort', () => ((window as unknown as { aborted: boolean }).aborted = true))
      for (let i = 1; ; i += 1) {
        yield `line ${i}`
        await new Promise((resolve) => setTimeout(resolve, 40))
      }
    }
  })
  await enter(terminal(page), 'logs api --follow')
  await expect(terminal(page).locator('.busy')).toContainText('Running logs… Ctrl+C to stop')
  await expect.poll(() => blocks(terminal(page)).count()).toBeGreaterThan(3)
  await expect(input(terminal(page))).toHaveAttribute('readonly', '')
  // Typing is ignored while it runs.
  await page.keyboard.type('ls')
  await expect(input(terminal(page))).toHaveValue('')
  await page.keyboard.press('Control+c')
  await expect(terminal(page).locator('.busy')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { aborted: boolean }).aborted)).toBe(true)
  await expect(blocks(terminal(page)).last()).toHaveText('^C')
  await expect(announcement(terminal(page))).toHaveText('Cancelled')
  // Nothing more streams in once it is aborted.
  const count = await blocks(terminal(page)).count()
  await page.waitForTimeout(150)
  await expect(blocks(terminal(page))).toHaveCount(count)
  await expect(input(terminal(page))).not.toHaveAttribute('readonly', '')
  await expect(input(terminal(page))).toBeFocused()
  // Ctrl+C on an idle line drops it, the way a shell does.
  await page.keyboard.type('half typed')
  await page.keyboard.press('Control+c')
  await expect(blocks(terminal(page)).last()).toHaveText('$ half typed^C')
  await expect(input(terminal(page))).toHaveValue('')
})

test('a thrown error prints as an error; a long output is announced as a line count', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-terminal></c2-terminal>`)
  await terminal(page).evaluate((element) => {
    ;(element as HTMLElement & { handler: unknown }).handler = async (command: string) => {
      if (command === 'fail') throw new Error('permission denied')
      return Array.from({ length: 12 }, (_, index) => `row ${index + 1}`).join('\n')
    }
  })
  await enter(terminal(page), 'fail')
  await expect(blocks(terminal(page)).nth(1)).toHaveClass(/error/)
  await expect(blocks(terminal(page)).nth(1)).toHaveText('permission denied')
  await enter(terminal(page), 'rows')
  await expect(announcement(terminal(page))).toHaveText('Output: 12 lines')
})

test('Up and Down walk the history and come back to the draft; history can be set and read', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-terminal></c2-terminal>`)
  await terminal(page).evaluate((element) => ((element as HTMLElement & { history: string[] }).history = ['git status']))
  await enter(terminal(page), 'ls -la')
  await enter(terminal(page), 'ls -la')
  await enter(terminal(page), 'pwd')
  expect(await terminal(page).evaluate((element) => (element as HTMLElement & { history: string[] }).history)).toEqual(['git status', 'ls -la', 'pwd'])
  await page.keyboard.type('dra')
  await page.keyboard.press('ArrowUp')
  await expect(input(terminal(page))).toHaveValue('pwd')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(input(terminal(page))).toHaveValue('git status')
  await page.keyboard.press('ArrowUp')
  await expect(input(terminal(page))).toHaveValue('git status')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(input(terminal(page))).toHaveValue('dra')
})

test('Tab completes: one match fills the line, several are listed and the common start is filled; an empty line lets Tab move on', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-terminal></c2-terminal><button>After</button>`)
  await terminal(page).evaluate((element) => {
    const words = ['deploy rollback', 'deploy restart', 'deploy replicas', 'deploy status', 'test --changed']
    ;(element as HTMLElement & { complete: unknown }).complete = (typed: string) => words.filter((word) => word.startsWith(typed))
  })
  await input(terminal(page)).fill('te')
  await input(terminal(page)).press('Tab')
  await expect(input(terminal(page))).toHaveValue('test --changed')
  await input(terminal(page)).fill('deploy r')
  await input(terminal(page)).press('Tab')
  // The three share only their first letter, so the line stays as typed.
  await expect(input(terminal(page))).toHaveValue('deploy r')
  await expect(blocks(terminal(page)).nth(0)).toHaveText('$ deploy r')
  await expect(blocks(terminal(page)).nth(1).locator('span')).toHaveText(['rollback', 'restart', 'replicas'])
  await expect(announcement(terminal(page))).toHaveText('3 completions')
  // The common start of several matches is filled in.
  await input(terminal(page)).fill('deploy rep')
  await input(terminal(page)).press('Tab')
  await expect(input(terminal(page))).toHaveValue('deploy replicas')
  await input(terminal(page)).fill('deploy s')
  await terminal(page).evaluate((element) => ((element as HTMLElement & { complete: unknown }).complete = () => ['deploy status', 'deploy start']))
  await input(terminal(page)).press('Tab')
  await expect(input(terminal(page))).toHaveValue('deploy sta')
  await input(terminal(page)).fill('')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('help lists the commands and the built-ins; clear and Ctrl+L empty the screen; max-lines keeps the newest lines', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-terminal max-lines="6" commands='[{"name":"deploy","description":"Deploy a service"},{"name":"logs","description":"Stream logs"}]'><span slot="prompt">~/acme (main)</span></c2-terminal>`,
  )
  await terminal(page).evaluate((element) => ((element as HTMLElement & { handler: unknown }).handler = (command: string) => `ran ${command}`))
  await enter(terminal(page), 'help')
  await expect(blocks(terminal(page)).nth(0)).toHaveText('~/acme (main) $ help')
  await expect(blocks(terminal(page)).nth(1).locator('span')).toHaveText([
    'deploy',
    'Deploy a service',
    'logs',
    'Stream logs',
    'clear',
    'Clear the screen (Ctrl+L)',
    'help',
    'Show this list',
  ])
  await enter(terminal(page), 'clear')
  await expect(blocks(terminal(page))).toHaveCount(0)
  await expect(announcement(terminal(page))).toHaveText('Screen cleared')
  for (const word of ['a', 'b', 'c', 'd']) await enter(terminal(page), word)
  await expect(blocks(terminal(page))).toHaveCount(6)
  await expect(blocks(terminal(page)).first()).toHaveText('~/acme (main) $ b')
  await input(terminal(page)).press('Control+l')
  await expect(blocks(terminal(page))).toHaveCount(0)
})

test('clicking the screen focuses the command line unless text was selected; the language changes the names', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-terminal></c2-terminal></div><button>Elsewhere</button>`)
  await terminal(page).evaluate((element) => (element as HTMLElement & { print(text: string): void }).print('Bonjour tout le monde'))
  await expect(input(terminal(page))).toHaveAccessibleName('Commande')
  await page.getByRole('button', { name: 'Elsewhere' }).focus()
  await blocks(terminal(page)).first().click()
  await expect(input(terminal(page))).toBeFocused()
  await page.getByRole('button', { name: 'Elsewhere' }).focus()
  const box = (await blocks(terminal(page)).first().boundingBox())!
  await page.mouse.move(box.x + 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 4 })
  await page.mouse.up()
  expect(
    await terminal(page).evaluate(
      (element) => ((element.shadowRoot as ShadowRoot & { getSelection?(): Selection | null }).getSelection?.() ?? window.getSelection())?.toString() ?? '',
    ),
  ).not.toBe('')
  await expect(input(terminal(page))).not.toBeFocused()
  await accessible(page)
})
