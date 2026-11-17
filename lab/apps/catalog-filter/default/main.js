// catalog-filter, default direction: built from lab/specs/scenarios/catalog-filter.md with c2n components only.
// Build report: lab/reports/catalog-filter/default.md.
import '@c2n/components/theme.css'
import './style.css'

import '@c2n/components/badge'
import '@c2n/components/button'
import '@c2n/components/card'
import '@c2n/components/chip'
import '@c2n/components/chip-group'
import '@c2n/components/facet-list'
import '@c2n/components/format-number'
import '@c2n/components/highlight'
import '@c2n/components/list-item'
import '@c2n/components/number-input'
import '@c2n/components/search-field'
import '@c2n/components/select'
import '@c2n/components/sheet'
import '@c2n/components/slider'
import '@c2n/components/status-panel'
import '@c2n/components/switch'
import { findMatches } from '@c2n/components/highlight'

import { BRANDS, CATEGORIES, PRICE, PRODUCTS } from './products.js'

const MATCH = { ignoreAccents: true }
const empty = () => ({ include: [], exclude: [] })
const initial = () => ({ query: '', category: empty(), brand: empty(), min: PRICE.min, max: PRICE.max, inStock: false, sort: 'featured' })
let state = initial()

const $ = (id) => document.getElementById(id)
const el = {
  search: $('search'),
  category: $('category'),
  brand: $('brand'),
  price: $('price'),
  priceMin: $('price-min'),
  priceMax: $('price-max'),
  inStock: $('in-stock'),
  sort: $('sort'),
  count: $('result-count'),
  chips: $('chips'),
  grid: $('grid'),
  empty: $('empty'),
  filters: $('filters'),
  sidebar: $('sidebar'),
  sheet: $('filters-sheet'),
  openFilters: $('open-filters'),
}

/** A facet keeps a product when the product's value is included (or nothing is), and not excluded. */
const facetKeeps = (facet, value) => (!facet.include.length || facet.include.includes(value)) && !facet.exclude.includes(value)

/** Whether a product passes every filter, optionally ignoring one facet: a facet's own counts ignore its own selection. */
function passes(product, ignore) {
  if (state.query.trim() && !findMatches(product.name, state.query.trim(), MATCH).length) return false
  if (ignore !== 'category' && !facetKeeps(state.category, product.category)) return false
  if (ignore !== 'brand' && !facetKeeps(state.brand, product.brand)) return false
  if (product.price < state.min || product.price > state.max) return false
  if (state.inStock && !product.inStock) return false
  return true
}

const SORTERS = {
  featured: () => 0,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  name: (a, b) => a.name.localeCompare(b.name),
}

function facetValues(key, labels) {
  const pool = PRODUCTS.filter((product) => passes(product, key))
  return labels.map((label) => ({ value: label, label, count: pool.filter((product) => product[key] === label).length }))
}

/** Active filters, one chip each. `key` identifies what removing the chip resets. */
function activeFilters() {
  const chips = []
  if (state.query.trim()) chips.push({ key: 'query', label: `“${state.query.trim()}”` })
  for (const facet of ['category', 'brand']) {
    for (const value of state[facet].include) chips.push({ key: `${facet}:include:${value}`, label: value })
    for (const value of state[facet].exclude) chips.push({ key: `${facet}:exclude:${value}`, label: `Not ${value}` })
  }
  if (state.min !== PRICE.min || state.max !== PRICE.max) chips.push({ key: 'price', label: `$${state.min}–$${state.max}` })
  if (state.inStock) chips.push({ key: 'in-stock', label: 'In stock' })
  return chips
}

function removeFilter(key) {
  const [facet, list, value] = key.split(':')
  if (key === 'query') state.query = ''
  else if (key === 'price') Object.assign(state, { min: PRICE.min, max: PRICE.max })
  else if (key === 'in-stock') state.inStock = false
  else state[facet] = { ...state[facet], [list]: state[facet][list].filter((item) => item !== value) }
  render()
}

function productCard(product) {
  const card = document.createElement('c2-card')
  card.className = 'product'

  const name = document.createElement('c2-highlight')
  name.className = 'product__name'
  name.slot = 'header'
  name.ignoreAccents = true
  name.query = state.query.trim()
  name.textContent = product.name

  const brand = document.createElement('p')
  brand.className = 'product__brand'
  brand.textContent = `${product.brand} · ${product.category}`

  const price = document.createElement('c2-format-number')
  price.className = 'product__price'
  price.type = 'currency'
  price.currency = 'USD'
  price.minimumFractionDigits = 2
  price.value = product.price

  card.append(name, brand, price)
  if (!product.inStock) {
    const badge = document.createElement('c2-badge')
    badge.slot = 'footer'
    badge.textContent = 'Out of stock'
    card.append(badge)
  }
  return card
}

function render() {
  const results = PRODUCTS.filter((product) => passes(product)).sort(SORTERS[state.sort])

  // Controls follow the state, so a chip or "Clear filters" resets them too.
  if (el.search.value !== state.query) el.search.value = state.query
  el.category.values = facetValues('category', CATEGORIES)
  el.category.include = state.category.include
  el.category.exclude = state.category.exclude
  el.brand.values = facetValues('brand', BRANDS)
  el.brand.include = state.brand.include
  el.brand.exclude = state.brand.exclude
  el.price.valueStart = state.min
  el.price.valueEnd = state.max
  el.priceMin.value = String(state.min)
  el.priceMax.value = String(state.max)
  el.inStock.checked = state.inStock

  el.count.textContent = `${results.length} ${results.length === 1 ? 'product' : 'products'}`
  el.grid.replaceChildren(...results.map(productCard))
  el.grid.hidden = results.length === 0
  el.empty.hidden = results.length !== 0

  const chips = activeFilters()
  el.chips.replaceChildren(
    ...chips.map(({ key, label }) => {
      const chip = document.createElement('c2-chip')
      chip.removable = true
      chip.value = key
      chip.textContent = label
      return chip
    }),
  )
  el.chips.hidden = chips.length === 0
  el.openFilters.textContent = chips.length ? `Filters (${chips.length})` : 'Filters'
}

// Inputs write the state, then everything re-renders from it.
el.search.addEventListener('search', () => {
  state.query = el.search.value
  render()
})
for (const facet of ['category', 'brand']) {
  el[facet].addEventListener('filter-change', (event) => {
    state[facet] = { include: [...event.detail.include], exclude: [...event.detail.exclude] }
    render()
  })
}
el.price.addEventListener('input', () => {
  state.min = el.price.valueStart
  state.max = el.price.valueEnd
  render()
})
const clampPrice = (value, fallback) => (Number.isFinite(value) ? Math.min(PRICE.max, Math.max(PRICE.min, value)) : fallback)
el.priceMin.addEventListener('change', () => {
  state.min = Math.min(clampPrice(Number(el.priceMin.value), PRICE.min), state.max)
  render()
})
el.priceMax.addEventListener('change', () => {
  state.max = Math.max(clampPrice(Number(el.priceMax.value), PRICE.max), state.min)
  render()
})
el.inStock.addEventListener('change', () => {
  state.inStock = el.inStock.checked
  render()
})
el.sort.addEventListener('selection-change', (event) => {
  state.sort = event.detail.value[0] ?? 'featured'
  render()
})
el.chips.addEventListener('remove', (event) => removeFilter(event.detail.value))
const clearAll = () => {
  state = { ...initial(), sort: state.sort }
  render()
}
$('clear').addEventListener('click', clearAll)
$('empty-clear').addEventListener('click', clearAll)

// Phone: the same filter panel moves into the sheet, so there is one set of controls and one state.
const phone = matchMedia('(max-width: 719px)')
const placeFilters = () => (phone.matches ? el.sheet : el.sidebar).append(el.filters)
phone.addEventListener('change', placeFilters)
placeFilters()
el.openFilters.addEventListener('click', () => (el.sheet.open = true))
$('close-filters').addEventListener('click', () => (el.sheet.open = false))

render()
