// Performance measurement for lab journeys. A journey marks a moment (`{ "mark": "sort" }`), does what a person does,
// then checks a budget against everything the page recorded since the mark (`{ "budget": { "since": "sort", … } }`).
// The numbers come from the browser's own performance entries, not from timing Playwright's steps, so the runner's
// overhead is not measured. A journey can set `"cpu": 4` to run under Chrome's CPU throttling, which makes a fast
// developer machine behave like a mid-range laptop and keeps budgets comparable between machines.

/** Collects long tasks, interactions (Event Timing), layout shifts and, on request, frame intervals. */
export const PERF_INIT_SCRIPT = `(() => {
  if (window.__labPerf) return
  const perf = (window.__labPerf = { marks: {}, longTasks: [], interactions: [], shifts: [], frames: [], frameLoop: false })
  const observers = []
  perf.flush = () => observers.forEach(({ observer, onEntry }) => observer.takeRecords().forEach(onEntry))
  const observe = (type, onEntry, extra) => {
    try {
      const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry))
      observer.observe({ type, buffered: true, ...extra })
      observers.push({ observer, onEntry })
    } catch (error) {
      /* entry type not supported: the budget that needs it reports it as unmeasured */
    }
  }
  observe('longtask', (entry) => perf.longTasks.push({ start: entry.startTime, duration: entry.duration }))
  observe('event', (entry) => entry.interactionId && perf.interactions.push({ start: entry.startTime, duration: entry.duration, name: entry.name }), { durationThreshold: 16 })
  observe('layout-shift', (entry) => !entry.hadRecentInput && perf.shifts.push({ start: entry.startTime, value: entry.value }))
  perf.lcp = []
  perf.resources = []
  observe('largest-contentful-paint', (entry) => perf.lcp.push({ start: entry.startTime }))
  observe('resource', (entry) => perf.resources.push({ start: entry.startTime, type: entry.initiatorType, url: entry.name, bytes: entry.transferSize || entry.encodedBodySize || 0 }))
  // Watches started by a mark: the first moment an element found through shadow roots contains a text.
  perf.watches = {}
  perf.watch = (name, css, text) => {
    const started = performance.now()
    const matches = () => {
      const walk = (root) => {
        for (const element of root.querySelectorAll(css)) if ((element.textContent ?? '').includes(text)) return true
        for (const host of root.querySelectorAll('*')) if (host.shadowRoot && walk(host.shadowRoot)) return true
        return false
      }
      return walk(document)
    }
    perf.watches[name] = { at: null }
    const check = () => {
      if (matches()) return (perf.watches[name].at = performance.now())
      if (performance.now() - started < 30000) requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }
  perf.startFrames = () => {
    perf.frames = []
    perf.frameLoop = true
    let last = performance.now()
    const tick = (now) => {
      if (!perf.frameLoop) return
      perf.frames.push({ start: now, interval: now - last })
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
})()`

const percentile = (values, p) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

/**
 * The page's own DevTools session, opened before navigation and kept until the page closes: CPU and network emulation
 * last only as long as the session that set them, and Chrome counts script time only while its Performance domain is
 * enabled.
 */
export async function attachPerfSession(page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Performance.enable')
  page.__labPerfSession = session
  return session
}

async function cdp(page, fn) {
  if (page.__labPerfSession) return fn(page.__labPerfSession)
  const session = await page.context().newCDPSession(page)
  try {
    return await fn(session)
  } finally {
    await session.detach().catch(() => {})
  }
}

/** JS heap after a forced garbage collection, plus DOM nodes and event listeners, from Chrome's own counters. */
async function memorySample(page) {
  return cdp(page, async (session) => {
    await session.send('HeapProfiler.collectGarbage')
    const { metrics } = await session.send('Performance.getMetrics')
    const metric = (name) => metrics.find((entry) => entry.name === name)?.value ?? null
    return { heap: metric('JSHeapUsedSize'), nodes: metric('Nodes'), listeners: metric('JSEventListeners') }
  })
}

const UNITLESS = new Set(['layoutShift', 'jankyFrames', 'heapGrowthMB', 'nodesGrowth', 'listenersGrowth', 'jsKB'])

/** Seconds of script execution Chrome has counted for the page so far, in milliseconds. */
async function scriptDuration(page) {
  return cdp(page, async (session) => {
    const { metrics } = await session.send('Performance.getMetrics')
    return (metrics.find((entry) => entry.name === 'ScriptDuration')?.value ?? 0) * 1000
  })
}

/** Network presets for load budgets: Chrome DevTools' "Fast 4G" and "Slow 4G". */
const NETWORKS = {
  'fast-4g': { latency: 165, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  'slow-4g': { latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
}

export async function throttleNetwork(page, preset) {
  if (!preset) return
  const conditions = NETWORKS[preset]
  if (!conditions) throw new Error(`Unknown network "${preset}". Known: ${Object.keys(NETWORKS).join(', ')}`)
  await cdp(page, async (session) => {
    await session.send('Network.enable')
    await session.send('Network.emulateNetworkConditions', { offline: false, ...conditions })
  })
}

export async function startScriptClock(page, ctx, name) {
  ctx.scriptAt ??= {}
  ctx.scriptAt[name] = await scriptDuration(page)
}

export async function throttleCpu(page, rate) {
  if (!rate || rate <= 1) return
  await cdp(page, (session) => session.send('Emulation.setCPUThrottlingRate', { rate }))
}

/**
 * What each budget key measures, from the mark named in `since` to now:
 *   interaction   ms  slowest input to next paint (the INP idea, for this window)
 *   longestTask   ms  longest main-thread task
 *   blocking      ms  total blocking time: the sum of every long task's time past 50 ms
 *   layoutShift       sum of unexpected layout shifts (CLS for this window)
 *   frameP95      ms  95th percentile frame interval, while frames were sampled (`{ "mark": …, "frames": true }`)
 *   jankyFrames       frames longer than 50 ms, while frames were sampled
 *   until         ms  time from the mark until its `watch` (`{ "mark": …, "watch": { "css", "text" } }`) first matched:
 *                     an element found through shadow roots whose text contains the given text
 *   lcp           ms  Largest Contentful Paint of the page load
 *   jsKB              kilobytes of script fetched since the mark (measure a production build: a dev server's modules
 *                     are not what users download)
 *   scriptTime    ms  main-thread script execution since the mark (a paused live feed costs close to none)
 *   heapGrowthMB      JS heap growth after garbage collection since `{ "memory": "baseline" }`
 *   nodesGrowth       DOM node growth since the baseline
 *   listenersGrowth   event listener growth since the baseline
 */
export async function measure(page, budget, ctx) {
  const since = budget.since ?? 'start'
  // Entries reach observers after the frame that produced them: let two frames pass, then take what is still queued.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.__labPerf?.flush()
            setTimeout(resolve, 50)
          }),
        ),
      ),
  )
  const recorded = await page.evaluate(
    ({ since }) => {
      const perf = window.__labPerf
      if (!perf) return null
      const from = since === 'start' ? 0 : perf.marks[since]
      if (from === undefined) return { error: `no mark named "${since}"` }
      const after = (entries) => entries.filter((entry) => entry.start >= from)
      const tasks = after(perf.longTasks)
      const frames = after(perf.frames).map((entry) => entry.interval)
      return {
        interaction: Math.max(0, ...after(perf.interactions).map((entry) => entry.duration)),
        interactions: after(perf.interactions).length,
        longestTask: Math.max(0, ...tasks.map((entry) => entry.duration)),
        blocking: tasks.reduce((total, entry) => total + Math.max(0, entry.duration - 50), 0),
        layoutShift: after(perf.shifts).reduce((total, entry) => total + entry.value, 0),
        frames,
        // Largest Contentful Paint of the page load (the last candidate), and script bytes fetched since the mark.
        lcp: perf.lcp.length ? perf.lcp[perf.lcp.length - 1].start : null,
        jsBytes: after(perf.resources)
          .filter((entry) => entry.type === 'script' || /\.m?js(\?|$)/.test(entry.url))
          .reduce((total, entry) => total + entry.bytes, 0),
        from,
      }
    },
    { since },
  )
  if (!recorded) throw new Error('Performance was not being recorded: the page was opened outside the lab runner.')
  if (recorded.error) throw new Error(recorded.error)

  const measured = {
    interaction: recorded.interaction,
    longestTask: recorded.longestTask,
    blocking: Math.round(recorded.blocking),
    layoutShift: Number(recorded.layoutShift.toFixed(3)),
  }
  if ('lcp' in budget) measured.lcp = recorded.lcp === null ? null : Math.round(recorded.lcp)
  if ('jsKB' in budget) measured.jsKB = Math.round(recorded.jsBytes / 1024)
  if ('scriptTime' in budget) {
    const start = ctx.scriptAt?.[since]
    if (start === undefined) throw new Error(`A scriptTime budget needs its mark "${since}" (or "start") to have been taken in this journey.`)
    measured.scriptTime = Math.round((await scriptDuration(page)) - start)
  }
  if (recorded.frames.length) {
    measured.frameP95 = Math.round(percentile(recorded.frames, 95))
    measured.jankyFrames = recorded.frames.filter((interval) => interval > 50).length
  }
  if (budget.until !== undefined) {
    // The watch started at the mark; give a change still on its way the rest of its budget, then read it.
    const deadline = Date.now() + Math.max(2000, Number(budget.until) * 2)
    let at
    while ((at = await page.evaluate((name) => window.__labPerf.watches[name]?.at ?? null, since)) === null && Date.now() < deadline) {
      await page.waitForTimeout(50)
    }
    measured.until = at === null ? null : Math.round(at - recorded.from)
  }
  if (['heapGrowthMB', 'nodesGrowth', 'listenersGrowth'].some((key) => key in budget)) {
    if (!ctx.memoryBaseline) throw new Error('A memory budget needs a `{ "memory": "baseline" }` step before it.')
    const now = await memorySample(page)
    measured.heapGrowthMB = Number(((now.heap - ctx.memoryBaseline.heap) / 1048576).toFixed(2))
    measured.nodesGrowth = now.nodes - ctx.memoryBaseline.nodes
    measured.listenersGrowth = now.listeners - ctx.memoryBaseline.listeners
  }
  return measured
}

/** Step handlers for `mark`, `budget`, `memory`, `scroll` and `repeat`. Returns false for a step that is not one of them. */
export async function runPerfStep(page, step, ctx, runStep) {
  if ('mark' in step) {
    await page.evaluate(
      ({ name, frames, watch }) => {
        const perf = window.__labPerf
        perf.marks[name] = performance.now()
        if (frames) perf.startFrames()
        if (watch) perf.watch(name, watch.css, watch.text)
      },
      { name: step.mark, frames: Boolean(step.frames), watch: step.watch ?? null },
    )
    await startScriptClock(page, ctx, step.mark)
    return true
  }
  if ('memory' in step) {
    ctx.memoryBaseline = await memorySample(page)
    return true
  }
  if ('scroll' in step) {
    // A person's wheel: 120px notches at about 60 per second, over the element named.
    const { locate } = await import('./steps.mjs')
    const target = await locate(page, step.scroll, step.timeout ?? 4000)
    await target.hover()
    const distance = step.by ?? 3000
    for (let moved = 0; Math.abs(moved) < Math.abs(distance); moved += Math.sign(distance) * 120) {
      await page.mouse.wheel(0, Math.sign(distance) * 120)
      await page.waitForTimeout(16)
    }
    return true
  }
  if ('repeat' in step) {
    for (let index = 0; index < step.repeat; index++) for (const inner of step.steps) await runStep(page, inner, ctx)
    return true
  }
  if ('budget' in step) {
    const { component, ...budget } = step.budget
    const measured = await measure(page, budget, ctx)
    const label = budget.label ?? budget.since ?? 'start'
    for (const [key, limit] of Object.entries(budget)) {
      if (['since', 'label'].includes(key)) continue
      const value = measured[key]
      ctx.metric?.({ name: `${label}.${key}`, value, budget: limit })
      if (value === undefined || value === null) {
        const why = key === 'until' ? `the watched text never appeared within its budget` : `${key} could not be measured`
        ctx.report?.({
          kind: 'perf',
          severity: key === 'until' ? 'error' : 'warn',
          component: component ?? null,
          rule: `${label}.${key}`,
          message: `${why} (${label}).`,
        })
      } else if (value > limit) {
        ctx.report?.({
          kind: 'perf',
          severity: 'error',
          component: component ?? null,
          rule: `${label}.${key}`,
          message: `${key} ${value}${UNITLESS.has(key) ? '' : ' ms'} is over its budget of ${limit} (${label}).`,
          details: measured,
        })
      }
    }
    return true
  }
  return false
}
