// Trend chart of recent readings drawn in plain SVG (no chart library needed).
import type { Reading, Thresholds } from "../types";

const W = 640;
const H = 220;
const PAD = { l: 40, r: 44, t: 14, b: 28 };

export default function MoistureChart({ readings, thresholds }: { readings: Reading[]; thresholds: Thresholds | null }) {
  const data = [...readings].reverse().slice(-30); // oldest -> newest
  if (data.length < 2) {
    return (
      <section className="card">
        <h2>Moisture and temperature trend</h2>
        <p className="muted">The chart appears after two or more readings.</p>
      </section>
    );
  }
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / (data.length - 1)) * iw;
  const yM = (v: number) => PAD.t + ih - (v / 100) * ih;          // moisture 0-100 %
  const yT = (v: number) => PAD.t + ih - (Math.min(v, 50) / 50) * ih; // temperature 0-50 C
  const line = (fn: (r: Reading) => number) => data.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${fn(r).toFixed(1)}`).join(" ");

  return (
    <section className="card">
      <div className="card-head">
        <h2>Moisture and temperature trend</h2>
        <span className="legend">
          <i className="key key-m" /> Moisture % <i className="key key-t" /> Temperature &deg;C
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Trend of the last readings">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yM(v)} y2={yM(v)} className="grid" />
            <text x={PAD.l - 6} y={yM(v) + 4} className="axis" textAnchor="end">{v}</text>
            <text x={W - PAD.r + 6} y={yM(v) + 4} className="axis">{v / 2}</text>
          </g>
        ))}
        {thresholds && (
          <>
            <rect x={PAD.l} width={iw} y={yM(thresholds.dryBelow)} height={yM(0) - yM(thresholds.dryBelow)} className="zone-dry" />
            <rect x={PAD.l} width={iw} y={yM(100)} height={yM(thresholds.wetAbove) - yM(100)} className="zone-wet" />
          </>
        )}
        <path d={line((r) => yT(r.temperature_c))} className="line-t" />
        <path d={line((r) => yM(r.moisture_pct))} className="line-m" />
        {data.map((r, i) => (
          <circle key={r.record_id} cx={x(i)} cy={yM(r.moisture_pct)} r={3.5} className={`pt pt-${r.status}`}>
            <title>{`Point ${r.point_index}: ${r.moisture_pct}% / ${r.temperature_c}°C`}</title>
          </circle>
        ))}
        <text x={PAD.l} y={H - 8} className="axis">older</text>
        <text x={W - PAD.r} y={H - 8} className="axis" textAnchor="end">newest</text>
      </svg>
    </section>
  );
}
