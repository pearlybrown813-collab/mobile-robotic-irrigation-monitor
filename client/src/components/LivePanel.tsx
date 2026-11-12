// Live-reading panel: the most recent reading and its recommendation banner.
import type { Reading, Thresholds } from "../types";
import { formatTime } from "../api";
import StatusBadge from "./StatusBadge";

export default function LivePanel({ latest, thresholds }: { latest?: Reading; thresholds: Thresholds | null }) {
  if (!latest) {
    return (
      <section className="card live">
        <h2>Latest reading</h2>
        <p className="muted">No readings yet. Send the robot to a sampling point to begin.</p>
      </section>
    );
  }
  const pct = Math.max(0, Math.min(100, latest.moisture_pct));
  return (
    <section className="card live">
      <div className="card-head">
        <h2>Latest reading &middot; Point {latest.point_index}</h2>
        <StatusBadge status={latest.status} />
      </div>
      <p className="muted small">{latest.point_label} &middot; {formatTime(latest.recorded_at)}{latest.was_buffered ? " · sent from robot buffer" : ""}</p>
      <div className="metrics">
        <div className="metric">
          <span className="metric-label">Soil moisture</span>
          <span className="metric-value">{latest.moisture_pct.toFixed(1)}<small>%</small></span>
          <div className="gauge" aria-label={`moisture ${pct}%`}>
            {thresholds && (
              <>
                <span className="gauge-mark" style={{ left: `${thresholds.dryBelow}%` }} />
                <span className="gauge-mark" style={{ left: `${thresholds.wetAbove}%` }} />
              </>
            )}
            <span className={`gauge-fill fill-${latest.status}`} style={{ width: `${pct}%` }} />
          </div>
          {thresholds && (
            <span className="tiny muted">Dry &lt; {thresholds.dryBelow}% &middot; Wet &gt; {thresholds.wetAbove}%</span>
          )}
        </div>
        <div className="metric">
          <span className="metric-label">Ambient temperature</span>
          <span className="metric-value">{latest.temperature_c.toFixed(1)}<small>&deg;C</small></span>
          {thresholds && latest.temperature_c > thresholds.hotAbove && (
            <span className="tiny warn">Above {thresholds.hotAbove}&deg;C: soil will dry faster</span>
          )}
        </div>
      </div>
      <p className={`banner banner-${latest.status}`}>{latest.recommendation}</p>
    </section>
  );
}
