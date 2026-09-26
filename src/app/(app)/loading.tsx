/**
 * Shown while a server component streams. Shapes sit where the real content
 * lands, so the page never flashes blank or jumps when it arrives.
 */
export default function Loading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="section-head">
        <div style={{ display: "grid", gap: 8 }}>
          <div className="skeleton skeleton-row" style={{ width: 130 }} />
          <div className="skeleton skeleton-row" style={{ width: 230, height: 24 }} />
        </div>
      </div>
      <div className="kpi-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="skeleton skeleton-kpi" key={index} />
        ))}
      </div>
      <div className="glance-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="skeleton skeleton-panel" key={index} />
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </section>
  );
}
