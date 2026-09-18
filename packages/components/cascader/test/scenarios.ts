import { html } from 'lit'
import '../src/cascader'
import type { Cascader, CascaderOption } from '../src/cascader'

const locations: CascaderOption[] = [
  {
    value: 'zhejiang',
    label: 'Zhejiang',
    children: [
      {
        value: 'hangzhou',
        label: 'Hangzhou',
        children: [
          { value: 'west-lake', label: 'West Lake' },
          { value: 'xiaoshan', label: 'Xiaoshan' },
        ],
      },
      { value: 'ningbo', label: 'Ningbo' },
    ],
  },
  {
    value: 'jiangsu',
    label: 'Jiangsu',
    children: [
      {
        value: 'nanjing',
        label: 'Nanjing',
        children: [
          { value: 'xuanwu', label: 'Xuanwu' },
          { value: 'qinhuai', label: 'Qinhuai', disabled: true },
        ],
      },
    ],
  },
]

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML =
  scenario === 'form'
    ? '<form><c2-cascader id="subject" name="location" required aria-label="Location"></c2-cascader></form>'
    : '<c2-cascader id="subject" aria-label="Location"></c2-cascader>'

const subject = document.querySelector<Cascader>('#subject')!
subject.options = scenario === 'empty' ? [] : locations

if (scenario === 'disabled') subject.disabled = true
if (scenario === 'hover') subject.expandTrigger = 'hover'
if (scenario === 'branch') subject.changeOnSelect = true
if (scenario === 'custom') {
  subject.itemRenderer = ({ option, level }) => html`<strong>${option.label}</strong><small>Level ${level + 1}</small>`
}

subject.addEventListener('cascader-change', (event) => {
  subject.dataset.change = JSON.stringify(event.detail)
})
subject.addEventListener('open-change', (event) => {
  subject.dataset.open = String(event.detail.open)
})

await subject.updateComplete
main.dataset.ready = 'true'
