/** Text colours for labels the chart draws on its own marks. */

/** White or near-black, whichever reads better on `color`: for a label drawn on a mark, not on the page. */
export function readableOn(color: string): string {
  const match = /^rgba?\(([^)]+)\)$/.exec(color.trim())
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  let channels: number[]
  if (match)
    channels = match[1]
      .split(/[\s,/]+/)
      .slice(0, 3)
      .map(Number)
  else if (hex) channels = [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16))
  else return '#ffffff'
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Contrast against white is 1.05 / (L + 0.05), against #18181b (L ≈ 0.009) is (L + 0.05) / 0.059.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.059 ? '#ffffff' : '#18181b'
}
