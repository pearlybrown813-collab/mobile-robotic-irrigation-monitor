// Field overview: newest reading at every sampling point, laid out along the plot.
import type { PointSummary } from "../types";
import { formatTime } from "../api";
import StatusBadge from "./StatusBadge";

export default function FieldOverview({ points }: { points: PointSummary[] }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Field overview</h2>
        <span className="muted small">Newest reading at each sampling point</span>
      </div>
      <div className="field">
        {points.map((p) => (
          <article key={p.point_index} className={`plot plot-${p.status ?? "none"}`}>
            <header>
              <strong>Point {p.point_index}</strong>
              <StatusBadge status={p.status} />
            </header>
            <p className="plot-label">{p.point_label}</p>
            {p.moisture_pct !== null ? (
              <>
                <p className="plot-values">
                  <span>{p.moisture_pct.toFixed(1)}%</span>
                  <span>{p.temperature_c?.toFixed(1)}&deg;C</span>
                </p>
                <p className="tiny">{p.recommendation}</p>
                <p className="tiny muted">{formatTime(p.recorded_at)}</p>
              </>
            ) : (
              <p className="tiny muted">Not sampled yet</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
