/** Text measuring for the labels a chart lays out itself before the engine draws them. */

let measureContext: CanvasRenderingContext2D | null | undefined

/** Width of `text` in `font`, measured on a canvas; an estimate where there is none (a server, a test runner without one). */
export function measureText(text: string, font: string, size: number): number {
  if (measureContext === undefined) measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (!measureContext) return text.length * size * 0.6
  measureContext.font = font
  return measureContext.measureText(text).width
}
