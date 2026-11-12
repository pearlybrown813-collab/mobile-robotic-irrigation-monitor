// History table with point filter and CSV download.
import { useEffect, useState } from "react";
import { api, formatTime, session } from "../api";
import type { Reading, SamplingPoint } from "../types";
import StatusBadge from "../components/StatusBadge";

export default function HistoryPage() {
  const [rows, setRows] = useState<Reading[]>([]);
  const [points, setPoints] = useState<SamplingPoint[]>([]);
  const [point, setPoint] = useState(0);
  const [limit, setLimit] = useState(100);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SamplingPoint[]>("/api/points").then(setPoints).catch(() => {});
  }, []);

  useEffect(() => {
    api<Reading[]>(`/api/readings?limit=${limit}${point ? `&point=${point}` : ""}`)
      .then((r) => { setRows(r); setError(null); })
      .catch((e) => setError((e as Error).message));
  }, [point, limit]);

  const download = async () => {
    const res = await fetch("/api/readings/export.csv", { headers: { Authorization: `Bearer ${session.token}` } });
    if (!res.ok) return setError("Could not download the file.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "irrigation_readings.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Reading history</h2>
        <div className="row">
          <select value={point} onChange={(e) => setPoint(Number(e.target.value))} aria-label="Filter by point">
            <option value={0}>All points</option>
            {points.map((p) => <option key={p.point_index} value={p.point_index}>{p.point_index}. {p.label}</option>)}
          </select>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Number of rows">
            {[50, 100, 250, 500].map((n) => <option key={n} value={n}>Last {n}</option>)}
          </select>
          <button className="btn" onClick={download}>Download CSV</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table className="history">
          <thead>
            <tr><th>#</th><th>Point</th><th>Moisture</th><th>Temp.</th><th>Status</th><th>Recommendation</th><th>Time</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.record_id}>
                <td>{r.record_id}</td>
                <td>{r.point_index}. {r.point_label}</td>
                <td>{r.moisture_pct.toFixed(1)}%</td>
                <td>{r.temperature_c.toFixed(1)}&deg;C</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.recommendation}{r.was_buffered ? <span className="tiny muted"> (buffered)</span> : null}</td>
                <td>{formatTime(r.recorded_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No readings found.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
