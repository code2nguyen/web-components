export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

export function formatPercent(fraction: number, digits = 0): string {
  if (fraction > 0 && fraction < 0.01 && digits === 0) return '<1%'
  return `${(fraction * 100).toFixed(digits)}%`
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1) return `${ms.toFixed(2)} ms`
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 48) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`
  return `${Math.round(hours / 24)} days`
}

/** Clock time, with milliseconds when the file spans less than a few minutes. */
export function formatClock(time: number, precise = false): string {
  const date = new Date(time)
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')
  const clock = `${hh}:${mm}:${ss}`
  return precise ? `${clock}.${String(date.getUTCMilliseconds()).padStart(3, '0')}` : clock
}

export function formatDate(time: number): string {
  return new Date(time).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatTimestamp(time: number): string {
  return new Date(time).toISOString().replace('T', ' ').replace('Z', '')
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`
}

export function shorten(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
