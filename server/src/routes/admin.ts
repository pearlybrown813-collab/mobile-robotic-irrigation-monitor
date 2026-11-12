// server/src/routes/admin.ts
// Sampling points, thresholds, user accounts and the audit log.
// Reading is open to every logged-in user; changes are for administrators only.
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../db";
import { asyncHandler, audit, loadThresholds, requireUser, type AuthedRequest } from "../lib/middleware";
import { hashPassword, isStrongPassword } from "../lib/security";
import { isNonEmptyString } from "../lib/validation";

const router = Router();

// ---------------- sampling points ----------------
router.get(
  "/points",
  requireUser(),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM sampling_points ORDER BY point_index");
    res.json(rows);
  })
);

router.post(
  "/points",
  requireUser("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const index = Number(req.body?.point_index);
    const { label, crop, notes } = req.body ?? {};
    const distance = Number(req.body?.distance_m ?? 0);
    if (!Number.isInteger(index) || index < 1 || index > 500) return res.status(400).json({ error: "Point number must be 1-500." });
    if (!isNonEmptyString(label, 60)) return res.status(400).json({ error: "Enter a label (max 60 characters)." });
    if (!Number.isFinite(distance) || distance < 0 || distance > 999) return res.status(400).json({ error: "Distance must be 0-999 m." });
    try {
      await pool.query(
        "INSERT INTO sampling_points (point_index, label, distance_m, crop, notes) VALUES (?, ?, ?, ?, ?)",
        [index, label.trim(), distance, crop || null, notes || null]
      );
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That point number already exists." });
      throw err;
    }
    await audit(req.user!.uid, "POINT_ADDED", `point ${index} (${label})`, req.ip);
    res.status(201).json({ ok: true });
  })
);

router.put(
  "/points/:index",
  requireUser("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const index = Number(req.params.index);
    const { label, crop, notes } = req.body ?? {};
    const distance = Number(req.body?.distance_m ?? 0);
    if (!isNonEmptyString(label, 60)) return res.status(400).json({ error: "Enter a label (max 60 characters)." });
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE sampling_points SET label = ?, distance_m = ?, crop = ?, notes = ? WHERE point_index = ?",
      [label.trim(), Number.isFinite(distance) ? distance : 0, crop || null, notes || null, index]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Point not found." });
    await audit(req.user!.uid, "POINT_UPDATED", `point ${index}`, req.ip);
    res.json({ ok: true });
  })
);

router.delete(
  "/points/:index",
  requireUser("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const index = Number(req.params.index);
    const [used] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM readings WHERE point_index = ?", [index]);
    if (used[0].n > 0) return res.status(409).json({ error: "This point already has readings and cannot be deleted." });
    await pool.query("DELETE FROM sampling_points WHERE point_index = ?", [index]);
    await audit(req.user!.uid, "POINT_DELETED", `point ${index}`, req.ip);
    res.json({ ok: true });
  })
);

// ---------------- thresholds ----------------
router.get(
  "/thresholds",
  requireUser(),
  asyncHandler(async (_req, res) => {
    res.json(await loadThresholds());
  })
);

router.put(
  "/thresholds",
  requireUser("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const dry = Number(req.body?.dryBelow);
    const wet = Number(req.body?.wetAbove);
    const hot = Number(req.body?.hotAbove);
    if (![dry, wet, hot].every(Number.isFinite)) return res.status(400).json({ error: "All thresholds must be numbers." });
    if (dry < 0 || wet > 100 || dry >= wet) {
      return res.status(400).json({ error: "Dry limit must be lower than wet limit, both between 0 and 100%." });
    }
    if (hot < 0 || hot > 60) return res.status(400).json({ error: "Temperature limit must be between 0 and 60 C." });
    const updates: Array<[string, number]> = [["dry_below", dry], ["wet_above", wet], ["hot_above", hot]];
    for (const [key, value] of updates) {
      await pool.query("UPDATE thresholds SET setting_value = ?, updated_by = ? WHERE setting_key = ?", [value, req.user!.uid, key]);
    }
    await audit(req.user!.uid, "THRESHOLDS_CHANGED", `dry<${dry} wet>${wet} hot>${hot}`, req.ip);
    res.json(await loadThresholds());
  })
);

// ---------------- users ----------------
router.get(
  "/users",
  requireUser("admin"),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT user_id, full_name, username, role, is_active, created_at FROM users ORDER BY user_id"
    );
    res.json(rows);
  })
);

router.post(
  "/users",
  requireUser("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { full_name, username, password, role } = req.body ?? {};
    if (!isNonEmptyString(full_name, 100)) return res.status(400).json({ error: "Enter the full name." });
    if (typeof username !== "string" || !/^[a-zA-Z0-9_.]{3,50}$/.test(username)) {
      return res.status(400).json({ error: "Username: 3-50 letters, numbers, dot or underscore." });
    }
    if (typeof password !== "string" || !isStrongPassword(password)) {
      return res.status(400).json({ error: "Password must have at least 8 characters, with letters and numbers." });
    }
    const userRole = role === "admin" ? "admin" : "farmer";
    try {
      await pool.query("INSERT INTO users (full_name, username, password_hash, role) VALUES (?, ?, ?, ?)", [
        full_name.trim(), username, hashPassword(password), userRole,
      ]);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username already taken." });
      throw err;
    }
    await audit(req.user!.uid, "USER_CREATED", `${username} (${userRole})`, req.ip);
    res.status(201).json({ ok: true });
  })
);

router.patch(
  "/users/:id/active",
  requireUser("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (id === req.user!.uid) return res.status(400).json({ error: "You cannot disable your own account." });
    const active = req.body?.is_active ? 1 : 0;
    await pool.query("UPDATE users SET is_active = ? WHERE user_id = ?", [active, id]);
    await audit(req.user!.uid, active ? "USER_ENABLED" : "USER_DISABLED", `user ${id}`, req.ip);
    res.json({ ok: true });
  })
);

// ---------------- audit log ----------------
router.get(
  "/audit",
  requireUser("admin"),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT a.log_id, a.action, a.detail, a.ip_address, a.created_at, u.full_name
         FROM audit_log a LEFT JOIN users u ON u.user_id = a.user_id
        ORDER BY a.log_id DESC LIMIT 100`
    );
    res.json(rows);
  })
);

export default router;
