import { build } from 'esbuild'
import { webkit, chromium } from 'playwright'
const r = await build({ entryPoints: ['.probe/probe-entry.js'], bundle: true, format: 'iife', write: false, platform: 'browser', target: 'es2022' })
const code = r.outputFiles[0].text
for (const [name, type] of [['webkit', webkit], ['chromium', chromium]]) {
  const b = await type.launch()
  const p = await b.newPage()
  await p.setContent('<html><body>probe</body></html>')
  await p.addScriptTag({ content: code })
  console.log(`===== ${name}`)
  console.log(JSON.stringify(await p.evaluate(() => window.runProbe()), null, 1))
  await b.close()
}
