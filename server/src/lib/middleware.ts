// server/src/lib/middleware.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../db";
import { config } from "../config";
import { sha256, verifyToken, type SessionPayload } from "./security";
import { DEFAULT_THRESHOLDS, type Thresholds } from "./decision";

// Lets async route handlers pass errors to Express's error handler.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export interface AuthedRequest extends Request {
  user?: SessionPayload;
  device?: { device_id: number; device_name: string };
}

/** Dashboard users: checks the "Authorization: Bearer <token>" header. */
export function requireUser(...roles: Array<"admin" | "farmer">): RequestHandler {
  return (req: AuthedRequest, res, next) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = token ? verifyToken(token, config.sessionSecret) : null;
    if (!payload) return res.status(401).json({ error: "Please log in again." });
    if (roles.length > 0 && !roles.includes(payload.role)) {
      return res.status(403).json({ error: "You do not have permission for this action." });
    }
    req.user = payload;
    next();
  };
}

/** Robot: checks the "X-Device-Key" header against the hashed key in the devices table. */
export const requireDevice: RequestHandler = asyncHandler(async (req: AuthedRequest, res, next) => {
  const key = String(req.headers["x-device-key"] ?? "");
  if (!key) return res.status(401).json({ error: "missing device key" });
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT device_id, device_name FROM devices WHERE api_key_hash = ? LIMIT 1",
    [sha256(key)]
  );
  if (rows.length === 0) return res.status(401).json({ error: "unknown device key" });
  req.device = { device_id: rows[0].device_id, device_name: rows[0].device_name };
  await pool.query("UPDATE devices SET last_seen = UTC_TIMESTAMP() WHERE device_id = ?", [req.device.device_id]);
  next();
});

/** Reads the current thresholds from the database (falls back to defaults). */
export async function loadThresholds(): Promise<Thresholds> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT setting_key, setting_value FROM thresholds");
  const map = new Map(rows.map((r) => [r.setting_key as string, Number(r.setting_value)]));
  return {
    dryBelow: map.get("dry_below") ?? DEFAULT_THRESHOLDS.dryBelow,
    wetAbove: map.get("wet_above") ?? DEFAULT_THRESHOLDS.wetAbove,
    hotAbove: map.get("hot_above") ?? DEFAULT_THRESHOLDS.hotAbove,
    adcDryRaw: map.get("adc_dry_raw") ?? DEFAULT_THRESHOLDS.adcDryRaw,
    adcWetRaw: map.get("adc_wet_raw") ?? DEFAULT_THRESHOLDS.adcWetRaw,
  };
}

/** Writes one line to the audit log (never throws). */
export async function audit(userId: number | null, action: string, detail: string, ip?: string) {
  try {
    await pool.query("INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)", [
      userId,
      action,
      detail.slice(0, 255),
      ip ?? null,
    ]);
  } catch (err) {
    console.error("audit log failed:", err);
  }
}
