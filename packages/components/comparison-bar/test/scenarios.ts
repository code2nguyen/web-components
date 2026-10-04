import '../src/comparison-bar'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.style.width = '400px'

const markup: Record<string, string> = {
  default: '<c2-comparison-bar start-value="22.43" end-value="77.57" start-label="Bid" end-label="Ask" show-value></c2-comparison-bar>',
  bare: '<c2-comparison-bar start-value="1" end-value="3"></c2-comparison-bar>',
  empty: '<c2-comparison-bar show-value></c2-comparison-bar>',
  'one-sided': '<c2-comparison-bar start-value="0" end-value="10" show-value></c2-comparison-bar>',
  locale: '<c2-comparison-bar start-value="1" end-value="2" locale="de-DE" precision="1" show-value></c2-comparison-bar>',
  slotted: '<c2-comparison-bar start-value="12" end-value="8"><span slot="start">Yes 12</span><span slot="end">8 No</span></c2-comparison-bar>',
  three:
    '<c2-comparison-bar start-value="45" middle-value="20" end-value="35" start-label="Win" middle-label="Draw" end-label="Loss" show-value></c2-comparison-bar>',
  thirds: '<c2-comparison-bar start-value="1" middle-value="1" end-value="1" show-value></c2-comparison-bar>',
  'middle-slot': '<c2-comparison-bar start-value="5" middle-value="2" end-value="3"><span slot="middle">2 draws</span></c2-comparison-bar>',
}
main.innerHTML = markup[scenario] ?? markup.default

const subject = document.querySelector('c2-comparison-bar')!
await subject.updateComplete
main.dataset.ready = 'true'
