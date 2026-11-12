// Robot card: shows the robot's state and lets the user direct it to a point.
import { useState } from "react";
import { api, formatTime } from "../api";
import type { RobotStatus, SamplingPoint } from "../types";

const STATE_TEXT = {
  idle: "Idle - waiting for a command",
  moving: "Moving to the next point",
  sampling: "Probe lowered - taking a reading",
  offline: "Offline - not heard from in 2 minutes",
} as const;

export default function RobotPanel({
  status, points, onCommand,
}: { status: RobotStatus | null; points: SamplingPoint[]; onCommand: () => void }) {
  const [target, setTarget] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const send = async (command: "GOTO" | "STOP" | "RETURN") => {
    if (command === "GOTO" && target === "") {
      setMessage("Choose a sampling point first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/robot/commands", { method: "POST", body: { command, targetPoint: target || undefined } });
      setMessage(command === "GOTO" ? `Robot sent to point ${target}.` : command === "STOP" ? "Stop command sent." : "Return command sent.");
      onCommand();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const device = status?.device;
  const state = device?.robot_state ?? "offline";
  const pending = status?.pendingCommand;

  return (
    <section className="card robot">
      <div className="card-head">
        <h2>Robot</h2>
        <span className={`dot dot-${state}`} title={state} />
      </div>
      {device ? (
        <dl className="facts">
          <div><dt>Name</dt><dd>{device.device_name}</dd></div>
          <div><dt>State</dt><dd>{STATE_TEXT[state]}</dd></div>
          <div><dt>Last point</dt><dd>{device.last_point ?? "-"}</dd></div>
          <div><dt>Battery</dt><dd>{device.battery_v ? `${device.battery_v.toFixed(2)} V` : "-"}</dd></div>
          <div><dt>Last seen</dt><dd>{formatTime(device.last_seen)}</dd></div>
          <div>
            <dt>Command</dt>
            <dd>{pending ? `${pending.command}${pending.target_point ? " → point " + pending.target_point : ""} (${pending.status})` : "None"}</dd>
          </div>
        </dl>
      ) : (
        <p className="muted">No robot registered.</p>
      )}
      <div className="control">
        <label htmlFor="target">Send robot to</label>
        <div className="row">
          <select id="target" value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Select a sampling point</option>
            {points.map((p) => (
              <option key={p.point_index} value={p.point_index}>
                {p.point_index}. {p.label}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={busy} onClick={() => send("GOTO")}>Go</button>
        </div>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => send("STOP")}>Stop</button>
          <button className="btn" disabled={busy} onClick={() => send("RETURN")}>Return to start</button>
        </div>
        {message && <p className="small note">{message}</p>}
      </div>
    </section>
  );
}
