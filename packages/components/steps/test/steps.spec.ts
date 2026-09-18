import { test, expect } from './fixture'

test('renders the trace: label, detail and trailing on every row', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-step')).toHaveCount(5)
  const first = page.locator('c2-step[label="goto"]')
  await expect(first.locator('[part="label"]')).toHaveText('goto')
  await expect(first.locator('[part="detail"]')).toHaveText('[0].goto')
  await expect(first.locator('[part="trailing"]')).toHaveText('500 ms')
})

test('a step with no detail or trailing collapses those slots instead of leaving gaps', async ({ page, scenario }) => {
  await scenario()
  const notify = page.locator('c2-step[label="notify"]')
  await expect(notify.locator('[part="detail"]')).toBeVisible()
  await expect(notify.locator('[part="trailing"]')).toBeHidden()
})

test('a step with sub-steps is a disclosure; a leaf is a plain row', async ({ page, scenario }) => {
  await scenario()
  const group = page.locator('c2-step[label="pagination"]')
  const leaf = page.locator('c2-step[label="goto"]')

  await expect(group).toHaveAttribute('has-children', '')
  await expect(group.locator('details')).toHaveCount(1)
  // The summary is the row, so it is the button the reader operates.
  await expect(group.locator('summary[part="row"]')).toHaveCount(1)

  await expect(leaf).not.toHaveAttribute('has-children', '')
  await expect(leaf.locator('details')).toHaveCount(0)
})

test('a group takes the status of the worst thing inside it', async ({ page, scenario }) => {
  await scenario()
  // Both children succeeded, so the stage reads as succeeded without authoring a status.
  await expect(page.locator('c2-step[label="pagination"]')).toHaveAttribute('status', 'success')

  await scenario('wrapped')
  // One child failed, through two layers of island wrappers.
  await expect(page.locator('c2-step[label="Plan"]')).toHaveAttribute('status', 'error')
})

test('nesting indents the children and numbers them through the tree', async ({ page, scenario }) => {
  await scenario('hierarchy')
  const paths = await page
    .locator('c2-steps')
    .evaluate((element) => [...element.querySelectorAll('c2-step')].map((step) => [step.getAttribute('label'), (step as HTMLElement & { path: string }).path]))
  expect(paths).toEqual([
    ['Prepare', '1'],
    ['Install', '1.1'],
    ['Configure', '1.2'],
    ['Secrets', '1.2.1'],
    ['Migrate', '2'],
  ])

  const parent = page.locator('c2-step[label="Prepare"]')
  const parentBox = await parent.locator('[part="label"]').first().boundingBox()
  const childBox = await page.locator('c2-step[label="Install"] [part="label"]').boundingBox()
  if (!parentBox || !childBox) throw new Error('Labels have no bounds')
  expect(childBox.x).toBeGreaterThan(parentBox.x)
})

test('there is no disclosure column until the toggle slot is filled', async ({ page, scenario }) => {
  // A trace is a list of rows; a column of chevrons down the side of it is noise the default does without.
  await scenario()
  // Every toggle in the list, the group's own and its sub-steps', is drawn as nothing.
  await expect(page.locator('c2-steps [part="toggle"]:visible')).toHaveCount(0)

  // With nothing drawn, a group's row and a leaf's row start at exactly the same place.
  const group = await page.locator('c2-step[label="pagination"] [part="marker"]').first().boundingBox()
  const leaf = await page.locator('c2-step[label="goto"] [part="marker"]').boundingBox()
  if (!group || !leaf) throw new Error('Markers have no bounds')
  expect(group.x).toBe(leaf.x)

  // Filling it is per step: the group that got one shows a column, and a row without one has no dead space.
  await scenario('toggle-slot')
  await expect(page.locator('[data-testid="chevron"]')).toBeVisible()
  await expect(page.locator('c2-step[label="build"] [part="toggle"]').first()).toBeVisible()
  await expect(page.locator('c2-step[label="ship"] [part="toggle"]')).toBeHidden()
})

test('every step is a visible row, and a finished stage is not folded away', async ({ page, scenario }) => {
  await scenario('run')
  await expect(page.locator('c2-step')).toHaveCount(6)
  for (const id of ['build', 'install', 'compile', 'test', 'unit', 'e2e']) await expect(page.locator(`c2-step#${id}`)).toBeVisible()

  // The whole run goes by and nothing disappears.
  await page.evaluate(() => {
    window.setStatus('install', 'running')
    window.setStatus('install', 'success')
    window.setStatus('compile', 'success')
  })
  await expect(page.locator('c2-step#build')).toHaveAttribute('status', 'success')
  await expect(page.locator('c2-step#build')).not.toHaveAttribute('collapsed', '')
  await expect(page.locator('c2-step#install')).toBeVisible()
})

test('the reader can fold a stage away, and it stays folded', async ({ page, scenario }) => {
  await scenario('run')
  const build = page.locator('c2-step#build')

  await build.locator('summary[part="row"]').click()
  await expect(build).toHaveAttribute('collapsed', '')
  await expect(page.locator('c2-step#install')).toBeHidden()

  // A stage that merely finishes is not something to look at again.
  await page.evaluate(() => {
    window.setStatus('install', 'success')
    window.setStatus('compile', 'success')
  })
  await expect(build).toHaveAttribute('status', 'success')
  await expect(build).toHaveAttribute('collapsed', '')
})

test('a folded stage comes back when it starts running or something in it fails', async ({ page, scenario }) => {
  await scenario('run')
  await page.locator('c2-step#build summary[part="row"]').click()
  await page.locator('c2-step#test summary[part="row"]').click()
  await expect(page.locator('c2-step#build')).toHaveAttribute('collapsed', '')

  await page.evaluate(() => window.setStatus('install', 'running'))
  await expect(page.locator('c2-step#build')).not.toHaveAttribute('collapsed', '')
  await expect(page.locator('c2-step#install')).toBeVisible()

  await page.evaluate(() => window.setStatus('e2e', 'error'))
  await expect(page.locator('c2-step#test')).not.toHaveAttribute('collapsed', '')
  await expect(page.locator('c2-step#e2e')).toBeVisible()
})

test('`collapsed` in the markup starts a stage folded and nothing unfolds it unasked', async ({ page, scenario }) => {
  await scenario('authored-collapsed')
  const build = page.locator('c2-step[label="build"]')
  await expect(build).toHaveAttribute('status', 'pending')
  await expect(build).toHaveAttribute('collapsed', '')
  await expect(page.locator('c2-step[label="install"]')).toBeHidden()
})

test('a group announces every fold and unfold, bubbling to the list', async ({ page, scenario }) => {
  await scenario('run')
  await page.evaluate(() => {
    window.__toggles = []
    document.querySelector('c2-steps')!.addEventListener('step-toggle', (event) => {
      const detail = (event as CustomEvent<{ collapsed: boolean; path: string }>).detail
      window.__toggles.push(`${(event.target as HTMLElement).id}:${detail.path}:${detail.collapsed}`)
    })
  })

  await page.locator('c2-step#build summary[part="row"]').click()
  await expect.poll(() => page.evaluate(() => window.__toggles)).toEqual(['build:1:true'])

  await page.evaluate(() => window.setStatus('install', 'running'))
  await expect.poll(() => page.evaluate(() => window.__toggles)).toEqual(['build:1:true', 'build:1:false'])
})

test('collapseAll folds every group away and expandAll brings them all back', async ({ page, scenario }) => {
  await scenario('run')
  await page.evaluate(() => document.querySelector('c2-steps')!.collapseAll())
  await expect(page.locator('c2-step#build')).toHaveAttribute('collapsed', '')
  await expect(page.locator('c2-step#test')).toHaveAttribute('collapsed', '')
  await expect(page.locator('c2-step#install')).toBeHidden()

  await page.evaluate(() => document.querySelector('c2-steps')!.expandAll())
  await expect(page.locator('c2-step#build')).not.toHaveAttribute('collapsed', '')
  await expect(page.locator('c2-step#install')).toBeVisible()
})

test('each status draws its own marker and colour', async ({ page, scenario }) => {
  await scenario('statuses')
  const marker = (label: string) => page.locator(`c2-step[label="${label}"] [part="marker"]`)
  await expect(marker('Success')).toHaveCSS('color', 'rgb(22, 163, 74)')
  await expect(marker('Error')).toHaveCSS('color', 'rgb(220, 38, 38)')
  await expect(marker('Warning')).toHaveCSS('color', 'rgb(217, 119, 6)')
  await expect(marker('Running')).toHaveCSS('color', 'rgb(2, 101, 220)')
  await expect(marker('Current')).toHaveCSS('color', 'rgb(2, 101, 220)')
  await expect(marker('Skipped')).toHaveCSS('color', 'rgb(113, 113, 122)')
  await expect(marker('Success').locator('svg')).toBeVisible()
  await expect(marker('Pending').locator('svg')).toHaveCount(0)
})

test('marker="number" numbers the rows and marker="none" drops the column', async ({ page, scenario }) => {
  await scenario('number')
  await expect(page.locator('c2-step[label="pagination"] [part="marker"]').first()).toHaveText('2')
  await expect(page.locator('c2-step[label="collect"] [part="marker"]')).toHaveText('2.1')

  await scenario('none')
  await expect(page.locator('c2-step[label="goto"] [part="marker"]')).toHaveCount(0)
})

test('current derives the statuses of a wizard and an authored one still wins', async ({ page, scenario }) => {
  await scenario('wizard')
  const status = (label: string) => page.locator(`c2-step[label="${label}"]`)
  await expect(status('Account')).toHaveAttribute('status', 'success')
  await expect(status('Plan')).toHaveAttribute('status', 'current')
  await expect(status('Payment')).toHaveAttribute('status', 'pending')
})

test('slots replace the label, the detail, the trailing content and the marker', async ({ page, scenario }) => {
  await scenario('slots')
  await expect(page.locator('c2-step').first()).toContainText('Slotted label')
  await expect(page.locator('c2-step').first()).toContainText('Slotted detail')
  await expect(page.locator('c2-step').first()).toContainText('Slotted trailing')
  await expect(page.locator('[data-testid="custom-marker"]')).toBeVisible()
})

test('the steps property renders the same tree as the markup', async ({ page, scenario }) => {
  await scenario('data')
  await expect(page.locator('c2-step')).toHaveCount(5)
  await expect(page.locator('c2-step[label="pagination"]')).toHaveAttribute('status', 'success')
  await expect(page.locator('c2-step[label="pagination"] summary[part="row"]')).toHaveCount(1)
  await expect(page.locator('c2-step[label="collect"] [part="trailing"]')).toHaveText('1 ms')
})

test('updateStep changes one step of a running trace without rebuilding the array', async ({ page, scenario }) => {
  await scenario('data')
  const changed = await page.evaluate(() => document.querySelector('c2-steps')!.updateStep('append', { status: 'error', trailing: '9 ms' }))
  expect(changed).toBe(true)

  await expect(page.locator('c2-step[label="append"]')).toHaveAttribute('status', 'error')
  await expect(page.locator('c2-step[label="append"] [part="trailing"]')).toHaveText('9 ms')
  // The parent rolls the failure up.
  await expect(page.locator('c2-step[label="pagination"]')).toHaveAttribute('status', 'error')

  expect(await page.evaluate(() => document.querySelector('c2-steps')!.updateStep('nope', { status: 'error' }))).toBe(false)
})

test('the renderers replace the parts of a row they are given', async ({ page, scenario }) => {
  await scenario('renderers')
  await expect(page.locator('c2-step').first()).toContainText('1 GOTO')
  await expect(page.locator('c2-step').first()).toContainText('success · 500 ms')

  // `renderMarker` is the data-driven half of the `marker` slot, and `renderToggle` of `toggle`.
  await expect(page.locator('c2-step [slot="marker"]').first()).toHaveText('\u2713')
  // Only the one group gets a chevron; the leaves get an empty span, which keeps their rows lined up with it.
  await expect(page.locator('c2-step [slot="toggle"]').filter({ hasText: '\u203a' })).toHaveCount(1)

  await scenario('render-item')
  await expect(page.locator('c2-step').first()).toContainText('1/0 goto (success)')
  // The marker is its own column, so `renderItem` taking over the text does not take the icon with it.
  await expect(page.locator('c2-step [slot="marker"]').first()).toHaveText('i')
})

test('steps rendered inside island wrappers still get their depth and marker', async ({ page, scenario }) => {
  await scenario('wrapped')
  const shape = await page
    .locator('c2-steps')
    .evaluate((element) =>
      [...element.querySelectorAll('c2-step')].map((step) => [
        step.getAttribute('label'),
        (step as HTMLElement & { level: number }).level,
        (step as HTMLElement & { path: string }).path,
      ]),
    )
  expect(shape).toEqual([
    ['Account', 0, '1'],
    ['Plan', 0, '2'],
    ['Card', 1, '2.1'],
    ['Invoice', 1, '2.2'],
  ])
})

test('a step is one row however long its text is, at every depth', async ({ page, scenario }) => {
  await scenario('long')

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('c2-step')].map((step) => ({
      level: (step as HTMLElement & { level: number }).level,
      height: Math.round(step.shadowRoot!.querySelector('[part="row"]')!.getBoundingClientRect().height),
      labelX: Math.round(step.shadowRoot!.querySelector('[part="label"]')!.getBoundingClientRect().x),
    })),
  )

  // Every row is the height of the shortest one: the long labels are cut, not wrapped.
  const shortest = Math.min(...rows.map((row) => row.height))
  for (const row of rows) expect(row.height).toBeLessThanOrEqual(shortest + 1)

  // And the list never grows a horizontal scrollbar to fit them.
  const overflow = await page.locator('c2-steps').evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // One indent per level, and the default indent is marker + gap, so a sub-step's marker lands exactly under its
  // parent's label — the alignment that makes the nesting read without drawing anything.
  const byLevel = new Map(rows.map((row) => [row.level, row.labelX]))
  expect(byLevel.get(1)! - byLevel.get(0)!).toBe(26)
  expect(byLevel.get(2)! - byLevel.get(1)!).toBe(26)

  const parentLabel = await page.locator('c2-step[label="short"] [part="label"]').boundingBox()
  const childMarker = await page.locator('c2-step[level="1"], c2-step').nth(2).locator('[part="marker"]').boundingBox()
  if (!parentLabel || !childMarker) throw new Error('No bounds')
  expect(Math.round(childMarker.x)).toBe(Math.round(parentLabel.x))
})

test('the file-tree guides are off by default and one variable turns them on', async ({ page, scenario }) => {
  await scenario('long')
  const rules = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('c2-step')].map((step) => {
        const style = getComputedStyle(step.shadowRoot!.querySelector('[part="row"]')!, '::before')
        return { level: (step as HTMLElement & { level: number }).level, image: style.backgroundImage, width: style.width }
      }),
    )

  // A zero-wide colour band paints nothing, which is how the default draws no rules at all.
  expect((await rules()).every((row) => !row.image.includes('rgb(228, 228, 231) 0px, rgb(228, 228, 231) 1px'))).toBe(true)

  await page.locator('c2-steps').evaluate((element) => (element as HTMLElement).style.setProperty('--c2-step__guide--width', '1px'))
  const on = await rules()
  // The guide box spans the ancestors, so it is `level * indent` wide — nothing at all at the top level.
  expect(on.filter((row) => row.level === 0).every((row) => row.width === '0px')).toBe(true)
  expect(on.find((row) => row.level === 1)!.width).toBe('26px')
  expect(on.find((row) => row.level === 2)!.width).toBe('52px')
  expect(on.find((row) => row.level === 1)!.image).toContain('repeating-linear-gradient')
})

test('a status the server stamped on a step does not read as one the author wrote', async ({ page, scenario }) => {
  // `status` reflects, so SSR emits `status="pending"` on every step. Treating that as authored is what stopped
  // the stages rolling up on the docs site while the same markup worked in a plain page.
  await scenario('ssr-pending')
  await expect(page.locator('c2-step[label="build"]')).toHaveAttribute('status', 'pending')

  await page.evaluate(() => window.setStatus('bundle', 'running'))
  await expect(page.locator('c2-step[label="build"]')).toHaveAttribute('status', 'running')

  await page.evaluate(() => window.setStatus('bundle', 'error'))
  await expect(page.locator('c2-step[label="build"]')).toHaveAttribute('status', 'error')

  // A step the run has taken over is not written again: `compile` keeps the success it was given.
  await expect(page.locator('c2-step#compile')).toHaveAttribute('status', 'success')
})

test('a step finds out it is a group even when no slotchange ever tells it', async ({ page, scenario }) => {
  // Hydrating a declarative shadow root attaches the slot listener after the assignment it would have reported,
  // so the list walking the tree is what has to settle this. Adding the sub-steps after the step has rendered
  // reproduces that ordering.
  await scenario('flat')
  await page.evaluate(async () => {
    const list = document.querySelector('c2-steps')!
    const group = document.createElement('c2-step')
    group.id = 'late-group'
    group.label = 'build'
    list.append(group)
    await group.updateComplete
    const child = document.createElement('c2-step')
    child.id = 'late-child'
    child.label = 'compile'
    child.status = 'running'
    group.append(child)
  })

  const group = page.locator('c2-step#late-group')
  await expect(group).toHaveAttribute('has-children', '')
  await expect(group.locator('summary[part="row"]')).toHaveCount(1)
  await expect(group).toHaveAttribute('status', 'running')
  await expect(page.locator('c2-step#late-child')).toBeVisible()
})

test('a step arriving in a running trace grows into place, and one drawn with the list does not', async ({ page, scenario }) => {
  await scenario('data')
  // Nothing animates on load: a whole trace fading in at once is a page loading, not an arrival.
  await expect(page.locator('c2-step[entering]')).toHaveCount(0)

  // Appended and read in one call: a round trip back to the test is long enough for the animation to have
  // finished on its own, which is a race rather than a result.
  const arrived = await page.evaluate(async () => {
    const list = document.querySelector('c2-steps')!
    list.steps = [...list.steps!, { id: 'upload', label: 'upload', status: 'running' }]
    await list.updateComplete
    // Rendered from `steps`, so the rows live in the list's shadow root — `document` cannot see them.
    const step = [...list.shadowRoot!.querySelectorAll('c2-step')].find((element) => element.getAttribute('label') === 'upload')!
    await step.updateComplete
    // It grows from a collapsed row rather than appearing at full height.
    return { entering: step.hasAttribute('entering'), names: step.getAnimations().map((animation) => (animation as CSSAnimation).animationName) }
  })
  expect(arrived.entering).toBe(true)
  expect(arrived.names).toContain('c2-step-enter')

  const arrival = page.locator('c2-step[label="upload"]')

  // And it takes the attribute off again once it is in place, so nothing replays it.
  await expect(arrival).not.toHaveAttribute('entering', '', { timeout: 2000 })
})

test('a status that settles gives the marker one beat, and a status drawn from the start does not', async ({ page, scenario }) => {
  await scenario('run')
  await expect(page.locator('c2-step[settling]')).toHaveCount(0)

  // Read in the same call as the change: a round trip is long enough for a 150 ms animation to have finished.
  const names = await page.evaluate(async () => {
    window.setStatus('install', 'success')
    // A compound selector widens to `Element`, which has no `updateComplete`; the bare tag name keeps the type.
    const element = [...document.querySelectorAll('c2-step')].find((step) => step.id === 'install')!
    await element.updateComplete
    return element
      .shadowRoot!.querySelector('[part="marker"]')!
      .getAnimations()
      .map((animation) => (animation as CSSAnimation).animationName)
  })
  expect(names).toContain('c2-step-settle')

  const step = page.locator('c2-step#install')
  await expect(step).toHaveAttribute('settling', '')

  await expect(step).not.toHaveAttribute('settling', '', { timeout: 2000 })
})

test('--c2-step--enter-duration: 0s turns the arrival animation off', async ({ page, scenario }) => {
  await scenario('data')
  await page.locator('c2-steps').evaluate((element) => (element as HTMLElement).style.setProperty('--c2-step--enter-duration', '0s'))
  await page.evaluate(() => {
    const list = document.querySelector('c2-steps')!
    list.steps = [...list.steps!, { id: 'upload', label: 'upload', status: 'running' }]
  })

  // The row is in place immediately and at its full height, with nothing running on it.
  const arrival = page.locator('c2-step[label="upload"]')
  await expect(arrival.locator('[part="row"]')).toBeVisible()
  expect(await arrival.evaluate((step) => step.getAnimations().length)).toBe(0)
})

test('a dotted path grows its marker sideways instead of spilling out of it', async ({ page, scenario }) => {
  await scenario('hierarchy')
  const markers = await page.evaluate(() =>
    [...document.querySelectorAll('c2-step')].map((step) => {
      const marker = step.shadowRoot!.querySelector('[part="marker"]') as HTMLElement
      const box = marker.getBoundingClientRect()
      return {
        text: marker.textContent!.trim(),
        width: Math.round(box.width),
        height: Math.round(box.height),
        overflow: marker.scrollWidth > Math.ceil(box.width),
      }
    }),
  )

  // `2.2.1` in a box the size of a checkmark used to spill out over its own border.
  expect(markers.every((marker) => !marker.overflow)).toBe(true)

  // A single digit is still the circle it was; only a path widens into a pill, and the height never changes.
  const single = markers.find((marker) => marker.text === '1')!
  expect(single.width).toBe(16)
  expect(markers.find((marker) => marker.text === '1.2.1')!.width).toBeGreaterThan(single.width)
  expect(markers.every((marker) => marker.height === 16)).toBe(true)
})

test('one variable moves the detail from beside the label to under it', async ({ page, scenario }) => {
  await scenario()
  const beside = await page.locator('c2-step[label="goto"]').evaluate((step) => {
    const q = (part: string) => step.shadowRoot!.querySelector(`[part="${part}"]`)!.getBoundingClientRect()
    return { label: q('label'), detail: q('detail') }
  })
  // Side by side: same line, detail to the right of the label.
  expect(Math.round(beside.detail.y)).toBe(Math.round(beside.label.y))
  expect(beside.detail.x).toBeGreaterThan(beside.label.x)

  await scenario('stacked')
  const stacked = await page.locator('c2-step[label="Account"]').evaluate((step) => {
    const q = (part: string) => step.shadowRoot!.querySelector(`[part="${part}"]`)!.getBoundingClientRect()
    return { label: q('label'), detail: q('detail'), row: q('row') }
  })
  // Stacked by `--c2-step__text--flex-direction: column` alone — flush left, on the next line.
  expect(Math.round(stacked.detail.x)).toBe(Math.round(stacked.label.x))
  expect(stacked.detail.y).toBeGreaterThan(stacked.label.y + stacked.label.height - 1)

  // And the gap that followed the direction is the tight one, not the 8px meant for sitting side by side.
  const gap = stacked.detail.y - (stacked.label.y + stacked.label.height)
  expect(gap).toBeLessThan(5)
})
