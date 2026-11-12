import { useState, type FormEvent } from "react";
import { api, session } from "../api";
import type { User } from "../types";

export default function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      session.set(res.token);
      onLogin(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <div className="brand brand-login">
          <span className="brand-mark" aria-hidden>&#9673;</span>
          <div>
            <strong>Irrigation Monitor</strong>
            <small>Mobile robotic irrigation monitoring system</small>
          </div>
        </div>
        <h1>Sign in</h1>
        <label htmlFor="username">Username</label>
        <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        <p className="tiny muted">Default accounts after setup: admin / Admin@123 and farmer / Farmer@123. Change them after the first login.</p>
      </form>
    </div>
  );
}
