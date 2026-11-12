// Dashboard: polls the API every five seconds and re-renders automatically.
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { PointSummary, Reading, RobotStatus, SamplingPoint, Thresholds, User } from "../types";
import LivePanel from "../components/LivePanel";
import RobotPanel from "../components/RobotPanel";
import FieldOverview from "../components/FieldOverview";
import MoistureChart from "../components/MoistureChart";

const POLL_MS = 5000;

export default function DashboardPage({ user }: { user: User }) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [overview, setOverview] = useState<PointSummary[]>([]);
  const [robot, setRobot] = useState<RobotStatus | null>(null);
  const [points, setPoints] = useState<SamplingPoint[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, o, s] = await Promise.all([
        api<Reading[]>("/api/readings?limit=30"),
        api<PointSummary[]>("/api/readings/latest-by-point"),
        api<RobotStatus>("/api/robot/status"),
      ]);
      setReadings(r);
      setOverview(o);
      setRobot(s);
      setError(null);
      setUpdated(new Date());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    api<SamplingPoint[]>("/api/points").then(setPoints).catch(() => {});
    api<Thresholds>("/api/thresholds").then(setThresholds).catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const dryCount = overview.filter((p) => p.status === "dry").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good day, {user.name.split(" ")[0]}</h1>
          <p className="muted small">
            {dryCount > 0
              ? `${dryCount} sampling point${dryCount > 1 ? "s need" : " needs"} irrigation.`
              : "No sampling point currently needs irrigation."}
          </p>
        </div>
        <span className="muted tiny">{updated ? `Updated ${updated.toLocaleTimeString()} · refreshes every 5 s` : "Loading..."}</span>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid-2">
        <LivePanel latest={readings[0]} thresholds={thresholds} />
        <RobotPanel status={robot} points={points} onCommand={load} />
      </div>
      <FieldOverview points={overview} />
      <MoistureChart readings={readings} thresholds={thresholds} />
    </>
  );
}
