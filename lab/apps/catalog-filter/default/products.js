// The sample data of lab/specs/scenarios/catalog-filter.md, in its "Featured" order.
export const PRODUCTS = [
  { id: 1, name: 'Ridge 2 Tent', category: 'Tents', brand: 'Alpenfox', price: 249, inStock: true },
  { id: 2, name: 'Summit 3 Tent', category: 'Tents', brand: 'Northwind', price: 389, inStock: false },
  { id: 3, name: 'Trail 1 Tent', category: 'Tents', brand: 'Alpenfox', price: 179, inStock: true },
  { id: 4, name: 'Down 0° Bag', category: 'Sleeping bags', brand: 'Northwind', price: 329, inStock: true },
  { id: 5, name: 'Synthetic 5° Bag', category: 'Sleeping bags', brand: 'Alpenfox', price: 149, inStock: true },
  { id: 6, name: 'Quilt 10°', category: 'Sleeping bags', brand: 'Kestrel', price: 219, inStock: false },
  { id: 7, name: 'Daypack 22', category: 'Backpacks', brand: 'Kestrel', price: 89, inStock: true },
  { id: 8, name: 'Thru-hiker 55', category: 'Backpacks', brand: 'Northwind', price: 239, inStock: true },
  { id: 9, name: 'Ultralight 40', category: 'Backpacks', brand: 'Alpenfox', price: 199, inStock: false },
  { id: 10, name: 'Rolltop 30', category: 'Backpacks', brand: 'Kestrel', price: 129, inStock: true },
  { id: 11, name: 'Canister Stove', category: 'Stoves', brand: 'Kestrel', price: 59, inStock: true },
  { id: 12, name: 'Twin Burner', category: 'Stoves', brand: 'Northwind', price: 139, inStock: true },
]

export const CATEGORIES = ['Tents', 'Sleeping bags', 'Backpacks', 'Stoves']
export const BRANDS = ['Alpenfox', 'Northwind', 'Kestrel']
export const PRICE = { min: 0, max: 400, step: 10 }
