import { createApp } from 'vue'

// `theme.css` is `tokens.css` + `base.css`: the design tokens (light, dark, and a prefers-color-scheme
// fallback) plus the mapping of every component variable onto them.
import '@c2n/components/theme.css'
import './style.css'

// Registering the elements before `mount()` is what makes the plain bindings in the template work. Vue decides
// between a property and an attribute with `key in el`, so an element that has not upgraded yet has no `value`
// or `open` property and every binding would fall back to an attribute — an array would stringify to
// "[object Object]". Defined first, the check succeeds and Vue writes real properties.
import '@c2n/components/avatar'
import '@c2n/components/badge'
import '@c2n/components/button'
import '@c2n/components/chat-message'
import '@c2n/components/description-list'
import '@c2n/components/icon-button'
import '@c2n/components/indicator'
import '@c2n/components/list'
import '@c2n/components/list-item'
import '@c2n/components/select'
import '@c2n/components/sheet'
import '@c2n/components/text-field'
import '@c2n/components/textarea'
import '@c2n/components/toast'
import '@c2n/components/tooltip'
import '@c2n/feather-icons/icons/archive.js'
import '@c2n/feather-icons/icons/check.js'
import '@c2n/feather-icons/icons/user.js'

import App from './App.vue'

createApp(App).mount('#app')
