import { LitElement, html, nothing } from 'lit'
import { SyncStatusController } from '@c2n/core/controllers/sync-status.js'
import { addTranslations } from '@c2n/core/localize.js'

/**
 * What an app writes to feed a `c2-status-light` from `@c2n/core`'s sync status: the light shows the state's text and
 * tone in a live region, and a Retry button appears on an error.
 */
export class TestSyncIndicator extends LitElement {
  readonly sync = new SyncStatusController(this, { online: true, connect: false, backOnlineDuration: 0 })

  override render() {
    const sync = this.sync
    return html`<span role="status"><c2-status-light tone=${sync.tone} ?pulse=${sync.state === 'saving'}>${sync.text}</c2-status-light></span>
      ${sync.state === 'error' ? html`<button type="button" @click=${() => void sync.model.retry()}>${sync.retryLabel}</button>` : nothing}`
  }
}

customElements.define('test-sync-indicator', TestSyncIndicator)

// The language test registers its translations from the page.
Object.assign(globalThis, { addTranslations })
