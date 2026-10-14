import '../src/format-number'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const markup: Record<string, string> = {
  default: `<c2-format-number id="subject" locale="en-US" value="1234567.891"></c2-format-number>`,
  types: `
    <c2-format-number id="currency" locale="en-US" type="currency" currency="EUR" value="1234.5"></c2-format-number>
    <c2-format-number id="yen" locale="en-US" type="currency" currency="JPY" value="1234.5"></c2-format-number>
    <c2-format-number id="accounting" locale="en-US" type="currency" currency-sign="accounting" value="-1234.5"></c2-format-number>
    <c2-format-number id="code" locale="en-US" type="currency" currency-display="code" value="12"></c2-format-number>
    <c2-format-number id="percent" locale="en-US" type="percent" maximum-fraction-digits="1" value="0.1234"></c2-format-number>
    <c2-format-number id="unit" locale="en-US" type="unit" unit="kilometer-per-hour" value="88"></c2-format-number>
    <c2-format-number id="unit-long" locale="en-US" type="unit" unit="celsius" unit-display="long" value="21"></c2-format-number>`,
  notation: `
    <c2-format-number id="compact" locale="en-US" notation="compact" value="1234567"></c2-format-number>
    <c2-format-number id="compact-long" locale="en-US" notation="compact" compact-display="long" value="1234567"></c2-format-number>
    <c2-format-number id="scientific" locale="en-US" notation="scientific" value="123456"></c2-format-number>
    <c2-format-number id="compact-currency" locale="en-US" type="currency" notation="compact" value="2500000"></c2-format-number>`,
  bytes: `
    <c2-format-number id="b" locale="en-US" type="bytes" value="512"></c2-format-number>
    <c2-format-number id="kb" locale="en-US" type="bytes" value="1536"></c2-format-number>
    <c2-format-number id="mb" locale="en-US" type="bytes" value="2000000"></c2-format-number>
    <c2-format-number id="round-up" locale="en-US" type="bytes" value="999999"></c2-format-number>
    <c2-format-number id="binary" locale="en-US" type="bytes" binary value="1048576"></c2-format-number>
    <c2-format-number id="bits" locale="en-US" type="bytes" unit="bit" value="1500000000"></c2-format-number>`,
  digits: `
    <c2-format-number id="min-fraction" locale="en-US" minimum-fraction-digits="2" value="5"></c2-format-number>
    <c2-format-number id="significant" locale="en-US" maximum-significant-digits="3" value="123456"></c2-format-number>
    <c2-format-number id="integer" locale="en-US" minimum-integer-digits="3" value="7"></c2-format-number>
    <c2-format-number id="no-grouping" locale="en-US" no-grouping value="2026"></c2-format-number>
    <c2-format-number id="sign" locale="en-US" sign-display="exceptZero" value="42"></c2-format-number>
    <c2-format-number id="zero" locale="en-US" sign-display="exceptZero" value="0"></c2-format-number>`,
  lang: `<p lang="de">Preis: <c2-format-number id="subject" type="currency" currency="EUR" value="1234.5"></c2-format-number></p>`,
  fallback: `
    <c2-format-number id="unset">—</c2-format-number>
    <c2-format-number id="invalid" value="abc">n/a</c2-format-number>
    <c2-format-number id="bad-currency" locale="en-US" type="currency" currency="NOPE" value="1234.5"></c2-format-number>`,
  colour: `
    <style>
      .pnl {
        --c2-format-number__negative--color: rgb(220, 38, 38);
        --c2-format-number__positive--color: rgb(22, 163, 74);
        --c2-format-number__unit--color: rgb(113, 113, 122);
      }
    </style>
    <div class="pnl">
      <c2-format-number id="gain" locale="en-US" type="currency" value="420.5"></c2-format-number>
      <c2-format-number id="loss" locale="en-US" type="currency" value="-87.25"></c2-format-number>
      <c2-format-number id="flat" locale="en-US" value="0"></c2-format-number>
    </div>`,
}
main.innerHTML = markup[scenario] ?? markup.default

await Promise.all([...main.querySelectorAll('c2-format-number')].map((element) => element.updateComplete))
main.dataset.ready = 'true'
