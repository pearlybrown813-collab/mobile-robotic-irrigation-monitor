// server/src/lib/validation.ts
// Every reading from the robot is checked before it reaches the database,
// so a malformed reading is rejected (HTTP 400) instead of corrupting a row.

export interface ReadingInput {
  point: number;
  moisture: number;       // percent, 0-100
  temperature: number;    // degrees Celsius
  raw: number | null;     // averaged ADC value (optional)
  buffered: boolean;      // true if the robot stored it offline first
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const toNumber = (v: unknown): number => (typeof v === "number" ? v : Number(String(v ?? "").trim()));

export function parseReading(body: Record<string, unknown>): Result<ReadingInput> {
  const point = toNumber(body.point);
  const moisture = toNumber(body.moisture);
  const temperature = toNumber(body.temperature);
  const raw = body.raw === undefined || body.raw === "" ? null : toNumber(body.raw);
  const buffered = body.buffered === true || body.buffered === "1" || body.buffered === "true";

  if (!Number.isInteger(point) || point < 1 || point > 500) {
    return { ok: false, error: "point must be a whole number between 1 and 500" };
  }
  if (!Number.isFinite(moisture) || moisture < 0 || moisture > 100) {
    return { ok: false, error: "moisture must be a percentage between 0 and 100" };
  }
  // DS18B20 range is -55 to 125 C; -127 is its "sensor disconnected" code.
  if (!Number.isFinite(temperature) || temperature < -55 || temperature > 125) {
    return { ok: false, error: "temperature is outside the DS18B20 range (sensor fault?)" };
  }
  if (raw !== null && (!Number.isInteger(raw) || raw < 0 || raw > 4095)) {
    return { ok: false, error: "raw must be a 12-bit ADC value (0-4095)" };
  }
  return { ok: true, value: { point, moisture, temperature, raw, buffered } };
}

export function isNonEmptyString(v: unknown, max = 100): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}
