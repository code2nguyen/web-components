export default function NotFound() {
  return (
    <main className="ll-not-found">
      <c2-status-panel status="empty" heading="Nothing here" description="Log Lens is a single page. Head back to open a log file.">
        <c2-link-button slot="actions" href="/web-components/demo/log-lens-nextjs/">
          Open Log Lens
        </c2-link-button>
      </c2-status-panel>
    </main>
  )
}
