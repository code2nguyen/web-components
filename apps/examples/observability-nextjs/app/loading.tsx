export default function Loading() {
  return (
    <section className="page-stack" aria-labelledby="loading-heading" aria-busy="true">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Signal Forge</p>
          <h1 id="loading-heading">Loading investigation</h1>
          <p>Keeping the active environment and time scope while local telemetry is prepared.</p>
        </div>
      </div>
      <div className="skeleton-grid" aria-hidden="true">
        <c2-skeleton variant="rect" />
        <c2-skeleton variant="rect" />
        <c2-skeleton variant="rect" />
      </div>
    </section>
  )
}
