import { bootstrapApplication } from '@angular/platform-browser'
import { provideZonelessChangeDetection } from '@angular/core'

// Registering the elements before bootstrap keeps Angular's first property binding from landing on an
// unupgraded element. Angular writes `[rows]` with `setProperty` either way, but an element that is not yet
// defined would simply swallow the value until upgrade.
import '@c2n/components/badge'
import '@c2n/components/button'
import '@c2n/components/card'
import '@c2n/components/list-item'
import '@c2n/components/modal'
import '@c2n/components/select'
import '@c2n/components/switch'
import '@c2n/components/table'
import '@c2n/components/tabs'
import '@c2n/components/text-field'
import '@c2n/components/toast'

import { App } from './app/app'

bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).catch((error: unknown) => console.error(error))
