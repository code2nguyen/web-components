// One import types every c2-* tag in JSX.
import '@c2n/components/react'

export const form = (
  <form>
    <c2-text-field name="title" value="Alert rule" />
    <c2-select name="region" />
    <c2-table rows={[{ id: 1 }]} row-key="id" />
    <c2-line-chart />
    <c2-chat-message />
    {/* @ts-expect-error: a misspelt property is rejected, so the declarations are really loaded */}
    <c2-button disabledd />
  </form>
)
