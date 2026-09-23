import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../out', import.meta.url))
const prefix = '/web-components/demo/observability-nextjs'
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
])

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  const relative = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname
  const decoded = decodeURIComponent(relative).replace(/^\/+/, '')
  const safe = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '')
  let target = join(root, safe)
  if (!existsSync(target) || statSync(target).isDirectory()) target = join(target, 'index.html')
  if (!existsSync(target)) target = join(root, '404.html')
  response.statusCode = target.endsWith('404.html') ? 404 : 200
  response.setHeader('content-type', contentTypes.get(extname(target)) ?? 'application/octet-stream')
  createReadStream(target).pipe(response)
}).listen(4180, '127.0.0.1', () => console.log(`Signal Forge preview: http://127.0.0.1:4180${prefix}/`))
