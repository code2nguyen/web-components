import '../src/qr-code'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

if (scenario === 'empty') {
  main.innerHTML = `<c2-qr-code id="subject" aria-label="Empty payment code"></c2-qr-code>`
} else if (scenario === 'center') {
  main.innerHTML = `<c2-qr-code id="subject" value="https://c2n.dev/pay/42" error-correction="H" aria-label="Payment QR code"><span slot="center">C2</span></c2-qr-code>`
} else {
  main.innerHTML = `<c2-qr-code id="subject" value="https://c2n.dev" size="160" aria-label="C2N website QR code"></c2-qr-code>`
}

const subject = document.querySelector('c2-qr-code')!
subject.addEventListener('qr-code-error', (event) => {
  subject.dataset.error = (event as CustomEvent<{ error: Error }>).detail.error.message
})

await subject.updateComplete
main.dataset.ready = 'true'
