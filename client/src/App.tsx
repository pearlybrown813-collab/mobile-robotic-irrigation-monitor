// client/src/App.tsx -- login gate and page navigation
import { useEffect, useState } from "react";
import { api, session, setUnauthorizedHandler } from "./api";
import type { User } from "./types";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import PointsPage from "./pages/PointsPage";
import SettingsPage from "./pages/SettingsPage";

type Page = "dashboard" | "history" | "points" | "settings";

const PAGES: Array<{ id: Page; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
  { id: "points", label: "Sampling Points" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<Page>("dashboard");

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (!session.token) {
      setChecking(false);
      return;
    }
    api<User>("/api/auth/me")
      .then(setUser)
      .catch(() => session.clear())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="center muted">Loading...</div>;
  if (!user) return <LoginPage onLogin={setUser} />;

  const logout = () => {
    session.clear();
    setUser(null);
    setPage("dashboard");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>&#9673;</span>
          <div>
            <strong>Irrigation Monitor</strong>
            <small>Mobile robotic soil-moisture &amp; temperature monitoring</small>
          </div>
        </div>
        <div className="user">
          <span>
            {user.name} <em className={`role role-${user.role}`}>{user.role === "admin" ? "Administrator" : "Farmer"}</em>
          </span>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      <nav className="tabs">
        {PAGES.map((p) => (
          <button key={p.id} className={page === p.id ? "tab active" : "tab"} onClick={() => setPage(p.id)}>
            {p.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {page === "dashboard" && <DashboardPage user={user} />}
        {page === "history" && <HistoryPage />}
        {page === "points" && <PointsPage user={user} />}
        {page === "settings" && <SettingsPage user={user} />}
      </main>
      <footer className="footer">Mobile Robotic Irrigation Monitoring System &middot; ESP32 + Node.js + React + MySQL</footer>
    </div>
  );
}
