// Sampling points: everyone can view; administrators can add, edit and delete.
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import type { SamplingPoint, User } from "../types";

const EMPTY = { point_index: "", label: "", distance_m: "", crop: "", notes: "" };

export default function PointsPage({ user }: { user: User }) {
  const [points, setPoints] = useState<SamplingPoint[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isAdmin = user.role === "admin";

  const load = () => api<SamplingPoint[]>("/api/points").then(setPoints).catch((e) => setMessage(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const body = { ...form, point_index: Number(form.point_index), distance_m: Number(form.distance_m || 0) };
      if (editing) await api(`/api/points/${editing}`, { method: "PUT", body });
      else await api("/api/points", { method: "POST", body });
      setMessage(editing ? "Point updated." : "Point added.");
      setForm(EMPTY);
      setEditing(null);
      load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const edit = (p: SamplingPoint) => {
    setEditing(p.point_index);
    setForm({ point_index: String(p.point_index), label: p.label, distance_m: String(p.distance_m), crop: p.crop ?? "", notes: p.notes ?? "" });
  };

  const remove = async (p: SamplingPoint) => {
    if (!window.confirm(`Delete point ${p.point_index} (${p.label})?`)) return;
    try {
      await api(`/api/points/${p.point_index}`, { method: "DELETE" });
      load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="grid-2 wide-left">
      <section className="card">
        <h2>Sampling points on the plot</h2>
        <div className="table-wrap">
          <table className="history">
            <thead><tr><th>No.</th><th>Label</th><th>Distance</th><th>Crop</th><th>Notes</th>{isAdmin && <th />}</tr></thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.point_index}>
                  <td>{p.point_index}</td><td>{p.label}</td><td>{p.distance_m} m</td><td>{p.crop ?? "-"}</td><td>{p.notes ?? "-"}</td>
                  {isAdmin && (
                    <td className="actions">
                      <button className="btn btn-small" onClick={() => edit(p)}>Edit</button>
                      <button className="btn btn-small btn-danger" onClick={() => remove(p)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {isAdmin ? (
        <form className="card form" onSubmit={submit}>
          <h2>{editing ? `Edit point ${editing}` : "Add a sampling point"}</h2>
          <label>Point number<input type="number" min={1} max={500} value={form.point_index} disabled={!!editing} onChange={(e) => setForm({ ...form, point_index: e.target.value })} required /></label>
          <label>Label<input value={form.label} maxLength={60} onChange={(e) => setForm({ ...form, label: e.target.value })} required /></label>
          <label>Distance from start (m)<input type="number" step="0.01" min={0} value={form.distance_m} onChange={(e) => setForm({ ...form, distance_m: e.target.value })} /></label>
          <label>Crop<input value={form.crop} maxLength={60} onChange={(e) => setForm({ ...form, crop: e.target.value })} /></label>
          <label>Notes<input value={form.notes} maxLength={255} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          {message && <p className="small note">{message}</p>}
          <div className="row">
            <button className="btn btn-primary">{editing ? "Save changes" : "Add point"}</button>
            {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancel</button>}
          </div>
        </form>
      ) : (
        <section className="card">
          <h2>About sampling points</h2>
          <p className="muted">Sampling points are the fixed places on the plot where the robot lowers its probe. Only the administrator can add or change them.</p>
          {message && <p className="error">{message}</p>}
        </section>
      )}
    </div>
  );
}
