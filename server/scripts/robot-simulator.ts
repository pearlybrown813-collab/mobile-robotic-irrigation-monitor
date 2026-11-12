// server/scripts/robot-simulator.ts
// ---------------------------------------------------------------------------
// Software stand-in for the ESP32 robot, so the whole system can be run and
// tested in GitHub Codespaces without the hardware. It follows exactly the
// same loop as firmware/irrigation_robot/irrigation_robot.ino:
//   poll command -> move -> lower probe -> sample -> raise probe ->
//   POST reading (or buffer it if the server is unreachable) -> flush buffer
//
// Usage:  npm run simulate                 (operator-directed: waits for dashboard commands)
//         npm run simulate -- --auto       (visits every point in turn, like the offline mode)
// ---------------------------------------------------------------------------
const API = process.env.API_URL ?? "http://localhost:4000";
const KEY = process.env.DEVICE_KEY ?? "robot-01-demo-key";
const AUTO = process.argv.includes("--auto");
const POLL_MS = 3000;

// Typical soil condition at each point of the demo plot (moisture %, base temp C).
const FIELD: Record<number, { moisture: number; temp: number }> = {
  1: { moisture: 52, temp: 29 },
  2: { moisture: 41, temp: 30 },
  3: { moisture: 66, temp: 27 },
  4: { moisture: 22, temp: 34 },
  5: { moisture: 35, temp: 31 },
};

interface Reading { point: number; moisture: number; temperature: number; raw: number; buffered?: boolean }
const buffer: Reading[] = [];
const MAX_BUFFER = 20;
let currentPoint = 0;
let battery = 7.8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const headers = { "Content-Type": "application/json", "X-Device-Key": KEY };

async function api(pathname: string, init: RequestInit = {}) {
  const res = await fetch(API + pathname, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${pathname} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function heartbeat(state: string) {
  battery = Math.max(6.4, battery - 0.01);
  try {
    await api("/api/robot/heartbeat", {
      method: "POST",
      body: JSON.stringify({ state, point: currentPoint || undefined, battery: Number(battery.toFixed(2)) }),
    });
  } catch { /* offline: ignore */ }
}

/** Same two-point calibration as the firmware (ADC 3000 = dry air, 1200 = water). */
function percentToRaw(pct: number) {
  return Math.round(3000 - (pct / 100) * (3000 - 1200));
}

function sample(point: number): Reading {
  const base = FIELD[point] ?? { moisture: 45, temp: 30 };
  // Eight ADC samples averaged, with a little sensor noise, like the firmware.
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += percentToRaw(base.moisture + (Math.random() - 0.5) * 4);
  const raw = Math.round(sum / 8);
  const moisture = Math.round(Math.min(100, Math.max(0, ((3000 - raw) / 1800) * 100)) * 10) / 10;
  const temperature = Math.round((base.temp + (Math.random() - 0.5) * 1.5) * 10) / 10;
  return { point, moisture, temperature, raw };
}

async function transmit(r: Reading): Promise<boolean> {
  try {
    const out = await api("/api/readings", { method: "POST", body: JSON.stringify(r) });
    console.log(`  sent point ${r.point}: ${r.moisture}% ${r.temperature}C -> ${out.status} (${out.recommendation})`);
    return true;
  } catch (err) {
    console.log(`  transmit failed (${(err as Error).message}); keeping reading in buffer`);
    return false;
  }
}

async function flushBuffer() {
  if (buffer.length === 0) return;
  console.log(`  flushing ${buffer.length} buffered reading(s)`);
  for (let i = 0; i < buffer.length; ) {
    if (await transmit({ ...buffer[i], buffered: true })) buffer.splice(i, 1);
    else break;
  }
}

async function visit(point: number) {
  console.log(`Moving to sampling point ${point} ...`);
  await heartbeat("moving");
  await sleep(1500);            // drive time
  currentPoint = point;
  await heartbeat("sampling");
  console.log("  probe lowered");
  await sleep(1000);            // settle + 8 samples
  const r = sample(point);
  console.log("  probe raised");
  if (!(await transmit(r))) {
    if (buffer.length >= MAX_BUFFER) buffer.shift(); // oldest reading discarded
    buffer.push(r);
  }
  await flushBuffer();
  await heartbeat("idle");
}

async function main() {
  console.log(`Robot simulator connected to ${API} (${AUTO ? "automatic" : "operator-directed"} mode)`);
  const points = Object.keys(FIELD).map(Number);
  let autoIndex = 0;
  for (;;) {
    if (AUTO) {
      await visit(points[autoIndex % points.length]);
      autoIndex++;
      await sleep(POLL_MS);
      continue;
    }
    try {
      const cmd = await api("/api/robot/next-command");
      if (cmd.command === "GOTO") {
        await visit(cmd.targetPoint);
        await api(`/api/robot/commands/${cmd.commandId}/done`, { method: "POST" });
      } else if (cmd.command === "STOP" || cmd.command === "RETURN") {
        console.log(cmd.command === "STOP" ? "Stopping." : "Returning to start line.");
        if (cmd.command === "RETURN") currentPoint = 0;
        await api(`/api/robot/commands/${cmd.commandId}/done`, { method: "POST" });
        await heartbeat("idle");
      } else {
        await heartbeat("idle");
        await flushBuffer();
      }
    } catch (err) {
      console.log(`Server unreachable: ${(err as Error).message}`);
    }
    await sleep(POLL_MS);
  }
}

main();
