import '../src/description-list'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const items = `<c2-description-item label="Name">Ada Lovelace</c2-description-item>
  <c2-description-item label="Email">ada@example.com</c2-description-item>
  <c2-description-item label="Plan">Business</c2-description-item>
  <c2-description-item label="Phone"></c2-description-item>
  <c2-description-item label="Customer since">March 4, 2024</c2-description-item>
  <c2-description-item label="Customer ID">cus_9s6XKzkNRiz8i3</c2-description-item>`

const markup: Record<string, string> = {
  default: `<c2-description-list aria-label="Customer">${items}</c2-description-list>`,
  header: `<c2-description-list aria-label="Customer">
    <h2 slot="heading">Customer</h2>
    <button slot="actions" type="button">Edit</button>
    ${items}
  </c2-description-list>`,
  'full-row': `<c2-description-list aria-label="Customer">${items}
    <c2-description-item id="wide" label="Address" style="--c2-description-item--grid-column: 1 / -1">12 St James's Square, London</c2-description-item>
  </c2-description-list>`,
  horizontal: `<c2-description-list class="horizontal" aria-label="Customer" style="--c2-description-list__grid--columns: 1">${items}</c2-description-list>`,
  'two-column-horizontal': `<c2-description-list class="horizontal" aria-label="Customer" style="--c2-description-list__grid--columns: 2; --c2-description-list__grid--min-column-width: 340px">${items}</c2-description-list>`,
  groups: `<c2-description-list aria-label="Plans" value-labels="Starter;Pro;Enterprise" label-heading="Feature" style="--c2-description-item__label--width: 160px">
    <c2-description-item label="Price"><c2-description-value>€0</c2-description-value><c2-description-value>€20</c2-description-value><c2-description-value>Custom</c2-description-value></c2-description-item>
    <c2-description-item label="Seats"><c2-description-value>1</c2-description-value><c2-description-value>10</c2-description-value><c2-description-value>Unlimited</c2-description-value></c2-description-item>
  </c2-description-list>`,
  // A framework that wraps each element (Astro islands, a Vue fragment host) puts a `display: contents` element between the item and its values.
  'groups-wrapped': `<c2-description-list aria-label="Plans" value-labels="Starter;Pro;Enterprise" label-heading="Feature" style="--c2-description-item__label--width: 160px">
    <span class="island"><c2-description-item label="Price"><span class="island"><c2-description-value>€0</c2-description-value></span><span class="island"><c2-description-value>€20</c2-description-value></span><span class="island"><c2-description-value>Custom</c2-description-value></span></c2-description-item></span>
    <span class="island"><c2-description-item label="Seats"><span class="island"><c2-description-value>1</c2-description-value></span><span class="island"><c2-description-value>10</c2-description-value></span><span class="island"><c2-description-value>Unlimited</c2-description-value></span></c2-description-item></span>
  </c2-description-list>`,
  'rich-label': `<c2-description-list aria-label="Customer">
    <c2-description-item label="Plain"><span slot="label">Status <abbr title="Updated hourly">*</abbr></span><strong>Active</strong>
      <button slot="actions" type="button">Copy</button>
    </c2-description-item>
    <c2-description-item label="Empty" empty-text="Not set">  </c2-description-item>
    <c2-description-item label="Blank" empty-text=""></c2-description-item>
  </c2-description-list>`,
}

main.innerHTML = markup[scenario] ?? markup.default

await Promise.all(
  [...document.querySelectorAll<HTMLElement & { updateComplete: Promise<boolean> }>('c2-description-list, c2-description-item, c2-description-value')].map(
    (el) => el.updateComplete,
  ),
)
main.dataset.ready = 'true'
