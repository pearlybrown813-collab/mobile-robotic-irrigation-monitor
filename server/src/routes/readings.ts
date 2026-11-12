// server/src/routes/readings.ts
// POST /api/readings  -- called by the robot once per sampling point
// GET  /api/readings  -- polled by the dashboard (history table and chart)
// GET  /api/readings/latest-by-point -- newest reading for every point (field map)
// GET  /api/readings/export.csv      -- download of the history for reports
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../db";
import { asyncHandler, loadThresholds, requireDevice, requireUser, type AuthedRequest } from "../lib/middleware";
import { classify, recommend } from "../lib/decision";
import { parseReading } from "../lib/validation";

const router = Router();

router.post(
  "/",
  requireDevice,
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = parseReading(req.body ?? {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const r = parsed.value;

    const [points] = await pool.query<RowDataPacket[]>("SELECT 1 FROM sampling_points WHERE point_index = ?", [r.point]);
    if (points.length === 0) return res.status(400).json({ error: `sampling point ${r.point} is not registered` });

    // The server re-classifies the reading with the current thresholds,
    // so the stored status always follows the administrator's settings.
    const t = await loadThresholds();
    const status = classify(r.moisture, t);
    const recommendation = recommend(status, r.temperature, t);

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO readings
         (device_id, point_index, moisture_raw, moisture_pct, temperature_c, status, recommendation, was_buffered)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.device!.device_id, r.point, r.raw, r.moisture, r.temperature, status, recommendation, r.buffered ? 1 : 0]
    );
    await pool.query("UPDATE devices SET last_point = ?, robot_state = 'idle' WHERE device_id = ?", [
      r.point,
      req.device!.device_id,
    ]);
    res.status(200).json({ ok: true, recordId: result.insertId, status, recommendation });
  })
);

router.get(
  "/",
  requireUser(),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 500);
    const point = Number(req.query.point ?? 0);
    const params: unknown[] = [];
    let where = "";
    if (Number.isInteger(point) && point > 0) {
      where = "WHERE r.point_index = ?";
      params.push(point);
    }
    params.push(limit);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.record_id, r.point_index, p.label AS point_label, r.moisture_pct, r.temperature_c,
              r.status, r.recommendation, r.was_buffered, r.recorded_at
         FROM readings r JOIN sampling_points p ON p.point_index = r.point_index
         ${where}
        ORDER BY r.recorded_at DESC, r.record_id DESC
        LIMIT ?`,
      params
    );
    res.json(rows);
  })
);

router.get(
  "/latest-by-point",
  requireUser(),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.point_index, p.label AS point_label, p.distance_m, p.crop,
              r.record_id, r.moisture_pct, r.temperature_c, r.status, r.recommendation, r.recorded_at
         FROM sampling_points p
         LEFT JOIN readings r ON r.record_id = (
              SELECT r2.record_id FROM readings r2
               WHERE r2.point_index = p.point_index
               ORDER BY r2.recorded_at DESC, r2.record_id DESC LIMIT 1)
        ORDER BY p.point_index`
    );
    res.json(rows);
  })
);

router.get(
  "/export.csv",
  requireUser(),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.record_id, r.point_index, p.label, r.moisture_pct, r.temperature_c, r.status,
              r.recommendation, r.was_buffered, r.recorded_at
         FROM readings r JOIN sampling_points p ON p.point_index = r.point_index
        ORDER BY r.recorded_at`
    );
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "record_id,point,label,moisture_pct,temperature_c,status,recommendation,was_buffered,recorded_at_utc";
    const lines = rows.map((r) =>
      [r.record_id, r.point_index, esc(r.label), r.moisture_pct, r.temperature_c, r.status,
        esc(r.recommendation), r.was_buffered, new Date(r.recorded_at).toISOString()].join(",")
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="irrigation_readings.csv"');
    res.send([header, ...lines].join("\n"));
  })
);

export default router;
