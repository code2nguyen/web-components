import { html, svg, type TemplateResult } from 'lit'

const icon = (body: TemplateResult) => html`<svg slot="prefix-icon" viewBox="0 0 20 20" aria-hidden="true">${body}</svg>`
const line = (d: string) => svg`<path d=${d} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />`
const box = (x: number, y: number, width: number, height: number) =>
  svg`<rect x=${x} y=${y} width=${width} height=${height} rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />`

/** The icons of the built-in right-click menu. */
export const MENU_ICONS = {
  rowAbove: icon(svg`${box(3, 10.5, 14, 6.5)}${line('M10 2.5v5M7.5 5h5')}`),
  rowBelow: icon(svg`${box(3, 3, 14, 6.5)}${line('M10 12.5v5M7.5 15h5')}`),
  columnLeft: icon(svg`${box(10.5, 3, 6.5, 14)}${line('M2.5 10h5M5 7.5v5')}`),
  columnRight: icon(svg`${box(3, 3, 6.5, 14)}${line('M12.5 10h5M15 7.5v5')}`),
  rename: icon(line('M4 16l1-3.5 8.5-8.5 2.5 2.5-8.5 8.5zM11.5 6l2.5 2.5')),
  total: icon(line('M15 4.5H5.5l5 5.5-5 5.5H15')),
  bold: icon(line('M6 4h4.5a3 3 0 0 1 0 6H6zM6 10h5.5a3 3 0 0 1 0 6H6z')),
  textColour: icon(line('M5 16l5-12 5 12M7 11.5h6')),
  background: icon(line('M10 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z')),
  size: icon(line('M2.5 16l3.5-9 3.5 9M3.8 13h4.4M11 16l3-7 3 7M12 14h4')),
  delete: icon(line('M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10')),
}
