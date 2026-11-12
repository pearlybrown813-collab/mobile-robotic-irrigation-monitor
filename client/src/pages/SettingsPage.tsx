// Settings: thresholds, users and audit log (administrator); own password (everyone).
import { useEffect, useState, type FormEvent } from "react";
import { api, formatTime } from "../api";
import type { AppUser, AuditEntry, Thresholds, User } from "../types";

function ThresholdForm({ isAdmin }: { isAdmin: boolean }) {
  const [t, setT] = useState<Thresholds | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api<Thresholds>("/api/thresholds").then(setT).catch((e) => setMsg(e.message)); }, []);
  if (!t) return <section className="card"><h2>Decision thresholds</h2><p className="muted">Loading...</p></section>;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setT(await api<Thresholds>("/api/thresholds", { method: "PUT", body: t }));
      setMsg("Thresholds saved. New readings will use them.");
    } catch (err) { setMsg((err as Error).message); }
  };
  return (
    <form className="card form" onSubmit={save}>
      <h2>Decision thresholds</h2>
      <label>Dry when moisture is below (%)<input type="number" step="0.5" value={t.dryBelow} disabled={!isAdmin} onChange={(e) => setT({ ...t, dryBelow: Number(e.target.value) })} /></label>
      <label>Wet when moisture is above (%)<input type="number" step="0.5" value={t.wetAbove} disabled={!isAdmin} onChange={(e) => setT({ ...t, wetAbove: Number(e.target.value) })} /></label>
      <label>High-temperature advisory above (&deg;C)<input type="number" step="0.5" value={t.hotAbove} disabled={!isAdmin} onChange={(e) => setT({ ...t, hotAbove: Number(e.target.value) })} /></label>
      <p className="tiny muted">Sensor calibration: dry air = {t.adcDryRaw}, water = {t.adcWetRaw} (12-bit ADC).</p>
      {msg && <p className="small note">{msg}</p>}
      {isAdmin && <button className="btn btn-primary">Save thresholds</button>}
    </form>
  );
}

function UserAdmin() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [form, setForm] = useState({ full_name: "", username: "", password: "", role: "farmer" });
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<AppUser[]>("/api/users").then(setUsers).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/users", { method: "POST", body: form });
      setForm({ full_name: "", username: "", password: "", role: "farmer" });
      setMsg("Account created.");
      load();
    } catch (err) { setMsg((err as Error).message); }
  };
  const toggle = async (u: AppUser) => {
    try { await api(`/api/users/${u.user_id}/active`, { method: "PATCH", body: { is_active: !u.is_active } }); load(); }
    catch (err) { setMsg((err as Error).message); }
  };

  return (
    <section className="card">
      <h2>User accounts</h2>
      <div className="table-wrap">
        <table className="history">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td>{u.full_name}</td><td>{u.username}</td><td>{u.role}</td>
                <td>{u.is_active ? "Active" : "Disabled"}</td>
                <td><button className="btn btn-small" onClick={() => toggle(u)}>{u.is_active ? "Disable" : "Enable"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form inline-form" onSubmit={add}>
        <input placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="farmer">Farmer</option>
          <option value="admin">Administrator</option>
        </select>
        <button className="btn btn-primary">Add user</button>
      </form>
      {msg && <p className="small note">{msg}</p>}
    </section>
  );
}

function AuditLog() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  useEffect(() => { api<AuditEntry[]>("/api/audit").then(setRows).catch(() => {}); }, []);
  return (
    <section className="card">
      <h2>Audit log</h2>
      <div className="table-wrap short">
        <table className="history">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.log_id}><td>{formatTime(r.created_at)}</td><td>{r.full_name ?? "-"}</td><td>{r.action}</td><td>{r.detail}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/auth/change-password", { method: "POST", body: { currentPassword: cur, newPassword: next } });
      setCur(""); setNext(""); setMsg("Password changed.");
    } catch (err) { setMsg((err as Error).message); }
  };
  return (
    <form className="card form" onSubmit={submit}>
      <h2>My password</h2>
      <label>Current password<input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required /></label>
      <label>New password<input type="password" value={next} onChange={(e) => setNext(e.target.value)} required /></label>
      {msg && <p className="small note">{msg}</p>}
      <button className="btn btn-primary">Change password</button>
    </form>
  );
}

export default function SettingsPage({ user }: { user: User }) {
  const isAdmin = user.role === "admin";
  return (
    <>
      <div className="grid-2">
        <ThresholdForm isAdmin={isAdmin} />
        <ChangePassword />
      </div>
      {isAdmin && <UserAdmin />}
      {isAdmin && <AuditLog />}
    </>
  );
}
