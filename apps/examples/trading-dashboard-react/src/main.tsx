import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// `theme.css` is `tokens.css` + `base.css`: the design tokens (light, dark, and a prefers-color-scheme
// fallback) plus the mapping of every component variable onto them.
import '@c2n/theme/theme.css'
import './style.css'

// Registering the elements at module scope matters: React sets props on an element as soon as it creates it,
// and an *unupgraded* custom element has no `rows` property, so React would fall back to an attribute and the
// object would stringify to "[object Object]". Importing here guarantees the classes are defined first.
import '@c2n/components/badge'
import '@c2n/components/button'
import '@c2n/components/card'
import '@c2n/components/list-item'
import '@c2n/components/select'
import '@c2n/components/switch'
import '@c2n/components/table'
import '@c2n/components/text-field'

import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
