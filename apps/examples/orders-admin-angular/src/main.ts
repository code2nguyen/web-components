import { bootstrapApplication } from '@angular/platform-browser'
import { provideZonelessChangeDetection } from '@angular/core'

// Registering the elements before bootstrap keeps Angular's first property binding from landing on an
// unupgraded element. Angular writes `[rows]` with `setProperty` either way, but an element that is not yet
// defined would simply swallow the value until upgrade.
import '@c2n/badge'
import '@c2n/button'
import '@c2n/card'
import '@c2n/list-item'
import '@c2n/modal'
import '@c2n/select'
import '@c2n/switch'
import '@c2n/table'
import '@c2n/table/table-column.js'
import '@c2n/tabs'
import '@c2n/text-field'
import '@c2n/toast'

import { App } from './app/app'

bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).catch((error: unknown) => console.error(error))
