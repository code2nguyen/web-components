import '../src/device-frame'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const content = `<div class="app"><div class="layout"><span>Inbox</span><span>Message</span></div></div>`
const markup: Record<string, string> = {
  default: `<c2-device-frame url="app.example.com/inbox">${content}</c2-device-frame>`,
  address: `<c2-device-frame url="ignored.example.com"><a slot="address" href="#docs">example.com/docs</a><span slot="actions">⋯</span>${content}</c2-device-frame>`,
  phone: `<c2-device-frame device="phone">${content}</c2-device-frame>`,
  narrow: `<div style="width: 200px"><c2-device-frame device="phone">${content}</c2-device-frame></div>`,
  centred: `<div style="display: flex; justify-content: center"><c2-device-frame device="phone">${content}</c2-device-frame></div>`,
  'centred-laptop': `<div style="display: flex; justify-content: center"><c2-device-frame device="laptop" style="--c2-device-frame__laptop--width: 300px">${content}</c2-device-frame></div>`,
  'centred-browser': `<div style="display: flex; justify-content: center"><c2-device-frame url="example.com">${content}</c2-device-frame></div>`,
  'centred-default-laptop': `<div style="display: flex; justify-content: center"><c2-device-frame device="laptop">${content}</c2-device-frame></div>`,
  'narrow-row': `<div style="display: flex; width: 200px"><c2-device-frame url="example.com">${content}</c2-device-frame></div>`,
  tablet: `<c2-device-frame device="tablet">${content}</c2-device-frame>`,
  laptop: `<c2-device-frame device="laptop">${content}</c2-device-frame>`,
  unknown: `<c2-device-frame device="watch" url="example.com">${content}</c2-device-frame>`,
  image: `<c2-device-frame device="phone"><img alt="Dashboard" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E" /></c2-device-frame>`,
}
main.innerHTML = markup[scenario] ?? markup.default

const subject = document.querySelector('c2-device-frame')!
await subject.updateComplete
main.dataset.ready = 'true'
