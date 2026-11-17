// Start the target app's server unless something already answers at its URL, and stop it again afterwards.
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    return response.ok
  } catch {
    return false
  }
}

export async function ensureServer(target, repoRoot) {
  if (await answers(target.url)) return { stop: async () => {}, reused: true }
  if (!target.server) throw new Error(`Nothing answers at ${target.url} and the target has no "server" command.`)

  const child = spawn(target.server.command, {
    cwd: resolve(repoRoot, target.server.cwd ?? '.'),
    shell: true,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  })
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))

  const deadline = Date.now() + (target.server.timeout ?? 120_000)
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited (${child.exitCode}):\n${output.slice(-2000)}`)
    if (await answers(target.url)) {
      return {
        reused: false,
        stop: async () => {
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch {
            /* already gone */
          }
        },
      }
    }
    await new Promise((done) => setTimeout(done, 500))
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
  throw new Error(`Server did not answer at ${target.url} within the timeout:\n${output.slice(-2000)}`)
}
