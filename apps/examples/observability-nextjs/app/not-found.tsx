export default function NotFound() {
  return (
    <section className="centered-state" aria-label="Page not found">
      <c2-status-panel status="warning" align="center" heading-level="1">
        <span slot="title">Investigation route not found</span>
        <span slot="description">
          This identifier is not part of the deterministic dataset. Return to the overview and choose a known service, trace, rule, or incident.
        </span>
        <c2-link-button slot="actions" href="/web-components/demo/observability-nextjs/">
          Return to overview
        </c2-link-button>
      </c2-status-panel>
    </section>
  )
}
