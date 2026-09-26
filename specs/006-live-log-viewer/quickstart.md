# Quickstart

```ts
import '@c2n/log-viewer'
const viewer = document.querySelector('c2-log-viewer')!
viewer.appendEntries({ message: 'Request failed\nRetry scheduled', level: 'error', requestId: '42' })
viewer.columns = ['level', 'requestId', 'message']
viewer.wrap = true
viewer.setFilter({ attributes: { level: ['error', 'warn'] }, search: 'retry' })
viewer.setFilter(null)
viewer.tabular = false
viewer.scrollToEnd()
```

Run focused coverage with `npx playwright test packages/components/log-viewer/test --project=chromium --project=firefox --project=webkit` and build the package to refresh the manifest. Docs and gallery demonstrate tabular, sticky multiline and continuous text modes.
