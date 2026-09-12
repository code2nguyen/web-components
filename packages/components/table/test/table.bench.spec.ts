import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, SMALL, HUGE } from './fixture'

/**
 * Wall-clock benchmark for the table, kept out of the regular suite because the numbers belong to the machine that
 * produced them. Run it with `npm run bench:table`, and `npm run bench:table:baseline` to record the current numbers
 * as the new baseline once a change is understood.
 *
 * Each case reports the median of `REPEATS` runs, in milliseconds of table work: from the change through Lit's
 * render to the layout it forces, measured in the page so no driver round-trip is included.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const BASELINE = resolve(HERE, 'bench/baseline.json')
const REPEATS = Number(process.env.C2_BENCH_REPEATS ?? 7)
/** Generous on purpose: this catches an order-of-magnitude regression, not the noise between two runs. */
const TOLERANCE = Number(process.env.C2_BENCH_TOLERANCE ?? 2.5)
/** `performance.now()` is quantized to about a tenth of a millisecond, so anything this small is reported, not gated. */
const RESOLUTION = 0.5

type Baseline = { recordedOn?: string; note?: string; metrics: Record<string, number> }

const results: Record<string, number> = {}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

test.describe('table benchmark', () => {
  // Timings are meaningless when cases share a machine with each other.
  test.describe.configure({ mode: 'serial' })
  test.skip(!process.env.C2_BENCH, 'Wall-clock benchmark — run `npm run bench:table`')

  test(`mounts ${SMALL.toLocaleString('en-US')} rows`, async ({ page, bench }) => {
    await bench()
    results['mount.small'] = median(await repeat(page, (count) => window.tableBench.mount(count), SMALL))
  })

  test(`mounts ${HUGE.toLocaleString('en-US')} rows`, async ({ page, bench }) => {
    await bench()
    results['mount.huge'] = median(await repeat(page, (count) => window.tableBench.mount(count), HUGE))
  })

  test('applies one realtime row update', async ({ page, bench }) => {
    await bench()
    await page.evaluate((count) => window.tableBench.mount(count), HUGE)
    results['patch.huge'] = median(await repeat(page, () => window.tableBench.patch(17), HUGE))
  })

  test('applies a hundred streamed row updates', async ({ page, bench }) => {
    await bench()
    await page.evaluate((count) => window.tableBench.mount(count), HUGE)
    results['stream100.huge'] = median(await repeat(page, () => window.tableBench.stream(100), HUGE))
  })

  test('replaces the whole dataset', async ({ page, bench }) => {
    await bench()
    await page.evaluate((count) => window.tableBench.mount(count), HUGE)
    results['replace.huge'] = median(await repeat(page, () => window.tableBench.replace(), HUGE))
  })

  test('scrolls to the far end of the list', async ({ page, bench }) => {
    await bench()
    await page.evaluate((count) => window.tableBench.mount(count), HUGE)
    results['scroll.huge'] = median(
      await repeat(
        page,
        async () => {
          await window.tableBench.scrollToRatio(Math.random() * 0.4)
          return window.tableBench.scrollToRatio(0.6 + Math.random() * 0.4)
        },
        HUGE,
      ),
    )
  })

  test('sorts the whole dataset', async ({ page, bench }) => {
    await bench()
    results['sort.huge'] = median(
      await repeat(
        page,
        async (count) => {
          await window.tableBench.mount(count)
          return window.tableBench.sort('score')
        },
        HUGE,
      ),
    )
  })

  // This case reports rather than measures, so it takes no fixtures — and Playwright requires the first parameter to
  // be an object pattern, which is the one thing no-empty-pattern forbids.
  // eslint-disable-next-line no-empty-pattern
  test('compares against the recorded baseline', async ({}, testInfo) => {
    const baseline: Baseline | null = existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline) : null
    const rows = Object.entries(results).map(([metric, ms]) => {
      const was = baseline?.metrics[metric]
      return { metric, ms, was, ratio: was && was > 0 ? ms / was : undefined }
    })

    const width = Math.max(...rows.map((row) => row.metric.length))
    const report = [
      `median of ${REPEATS} runs, milliseconds of table work`,
      ...rows.map(
        (row) =>
          `  ${row.metric.padEnd(width)}  ${row.ms.toFixed(2).padStart(9)}` +
          (row.was === undefined
            ? '   (no baseline)'
            : `  vs ${row.was.toFixed(2).padStart(9)}  ${row.ratio === undefined ? '     —' : `${(row.ratio * 100).toFixed(0).padStart(5)}%`}` +
              (row.was < RESOLUTION ? '  (below timer resolution, not gated)' : '')),
      ),
    ].join('\n')
    console.log(`\n${report}\n`)
    await testInfo.attach('table-benchmark', { body: report, contentType: 'text/plain' })

    mkdirSync(resolve(HERE, '../../../../test-results'), { recursive: true })
    writeFileSync(resolve(HERE, '../../../../test-results/table-bench.json'), JSON.stringify({ metrics: results }, null, 2))

    if (process.env.C2_BENCH_UPDATE) {
      mkdirSync(dirname(BASELINE), { recursive: true })
      const rounded = Object.fromEntries(Object.entries(results).map(([metric, ms]) => [metric, Number(ms.toFixed(2))]))
      const next: Baseline = { recordedOn: new Date().toISOString().slice(0, 10), note: baseline?.note, metrics: rounded }
      writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`)
      test.info().annotations.push({ type: 'baseline', description: 'rewritten' })
      return
    }

    test.skip(!baseline, 'No baseline recorded yet — run `npm run bench:table:baseline`')
    const regressions = rows.filter((row) => row.ratio !== undefined && row.was! >= RESOLUTION && row.ratio > TOLERANCE)
    expect(
      regressions.map((row) => `${row.metric} ${row.ms.toFixed(2)}ms vs ${row.was!.toFixed(2)}ms baseline`),
      report,
    ).toEqual([])
  })
})

/** Runs the page-side operation `REPEATS` + 1 times and drops the first, which pays for JIT warm-up. */
async function repeat(
  page: import('@playwright/test').Page,
  operation: (count: number) => Promise<number> | Promise<number>,
  count: number,
): Promise<number[]> {
  const samples: number[] = []
  for (let run = 0; run <= REPEATS; run++) samples.push(await page.evaluate(operation, count))
  return samples.slice(1)
}
