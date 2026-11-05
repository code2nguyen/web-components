/** One cue of a WebVTT file: its times in seconds and its text. */
export interface VttCue {
  start: number
  end: number
  text: string
}

/** A thumbnail image, or a region of a sprite image. */
export interface VideoThumbnail {
  url: string
  x?: number
  y?: number
  w?: number
  h?: number
}

/** A chapter of the video: where it starts, in seconds, and its title. */
export interface VideoChapter {
  start: number
  title: string
}

function seconds(stamp: string): number {
  const parts = stamp.trim().split(':').map(Number)
  return parts.reduce((total, part) => total * 60 + part, 0)
}

/** Reads the cues of a WebVTT file. Settings after the times and cue identifiers are ignored. */
export function parseVtt(text: string): VttCue[] {
  const cues: VttCue[] = []
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const timing = lines.findIndex((line) => line.includes('-->'))
    if (timing < 0) continue
    const [from, rest] = lines[timing].split('-->')
    const to = rest.trim().split(/\s+/)[0]
    const start = seconds(from)
    const end = seconds(to)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    cues.push({
      start,
      end,
      text: lines
        .slice(timing + 1)
        .join('\n')
        .trim(),
    })
  }
  return cues
}

/** A thumbnail cue's text (`sprite.jpg#xywh=0,0,160,90`) as a thumbnail, its URL resolved against the file's. */
export function thumbnailFromCue(text: string, base: string): VideoThumbnail {
  const [path, hash = ''] = text.trim().split('#')
  const url = new URL(path, base).href
  const match = /xywh=(\d+),(\d+),(\d+),(\d+)/.exec(hash)
  return match ? { url, x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) } : { url }
}

/** `75` as `1:15`, `3725` as `1:02:05`; a duration of an hour or more puts hours on every time it is shown with. */
export function formatTime(value: number, withHours = false): string {
  const total = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours || withHours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

/** The index of the chapter `time` falls in, or -1 before the first. Chapters must be sorted by `start`. */
export function chapterAt(chapters: readonly VideoChapter[], time: number): number {
  let found = -1
  for (let index = 0; index < chapters.length; index += 1) {
    if (chapters[index].start <= time + 0.001) found = index
    else break
  }
  return found
}
