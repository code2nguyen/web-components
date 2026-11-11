/** Measures of one small, greyscale sample of a video frame. */
export interface CameraFrameMetrics {
  /** Mean luma, 0 (black) to 255 (white). */
  brightness: number
  /** Share of pixels burnt out to near white, 0 to 1. */
  glare: number
  /** Mean absolute Laplacian: edge contrast, low for a blurred picture. */
  sharpness: number
  /** Mean absolute luma change since the previous sample, or `Infinity` for the first sample. */
  motion: number
}

/** A problem with the picture, or `ready` when there is none. */
export type CameraQualityHint = 'dark' | 'glare' | 'moving' | 'blurry' | 'ready'

/** Decides the hint for a frame's metrics. `guide` is the frame guide of the shot being taken. */
export type CameraFrameAssessor = (metrics: CameraFrameMetrics, context: { guide: string }) => CameraQualityHint

/** The luma (Rec. 601) of each pixel of RGBA data. */
export function luma(data: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(data.length / 4)
  for (let i = 0, p = 0; p < out.length; i += 4, p++) out[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
  return out
}

/** Measures a greyscale sample `width` pixels wide, against the previous sample of the same size when there is one. */
export function analyzeFrame(gray: Uint8Array, width: number, previous?: Uint8Array): CameraFrameMetrics {
  const height = Math.floor(gray.length / width)
  let sum = 0
  let burnt = 0
  for (let p = 0; p < gray.length; p++) {
    sum += gray[p]
    if (gray[p] >= 250) burnt++
  }
  let edges = 0
  let inner = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      edges += Math.abs(4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - width] - gray[p + width])
      inner++
    }
  }
  let motion = Infinity
  if (previous && previous.length === gray.length) {
    let diff = 0
    for (let p = 0; p < gray.length; p++) diff += Math.abs(gray[p] - previous[p])
    motion = diff / (gray.length || 1)
  }
  const count = gray.length || 1
  return { brightness: sum / count, glare: burnt / count, sharpness: inner ? edges / inner : 0, motion }
}

/**
 * The built-in assessor. Darkness and glare come first (the user can fix them by moving), then movement, then focus:
 * blur is only judged on a document or a card, whose print has edges; a face or an open scene can be soft and sharp.
 */
export const assessFrame: CameraFrameAssessor = (metrics, { guide }) => {
  if (metrics.brightness < 45) return 'dark'
  if (metrics.glare > 0.08) return 'glare'
  if (metrics.motion > 6) return 'moving'
  if ((guide === 'document' || guide === 'card') && metrics.sharpness < 2) return 'blurry'
  return 'ready'
}
