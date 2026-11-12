// server/src/routes/auth.ts  --  login for the web dashboard
import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../db";
import { config } from "../config";
import { asyncHandler, audit, requireUser, type AuthedRequest } from "../lib/middleware";
import {
  clearFailures, hashPassword, isLockedOut, isStrongPassword,
  recordFailure, signToken, verifyPassword,
} from "../lib/security";

const router = Router();

// POST /api/auth/login  { username, password }
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const ip = req.ip ?? "unknown";
    if (isLockedOut(ip)) {
      return res.status(429).json({ error: "Too many failed attempts. Try again in 15 minutes." });
    }
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT user_id, full_name, password_hash, role, is_active FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    const user = rows[0];
    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      recordFailure(ip);
      await audit(null, "LOGIN_FAILED", `username=${username}`, ip);
      return res.status(401).json({ error: "Incorrect username or password." });
    }
    clearFailures(ip);
    const token = signToken(
      { uid: user.user_id, role: user.role, name: user.full_name },
      config.sessionSecret,
      config.sessionHours
    );
    await audit(user.user_id, "LOGIN", "dashboard login", ip);
    res.json({ token, user: { id: user.user_id, name: user.full_name, role: user.role } });
  })
);

// GET /api/auth/me  -- who is logged in
router.get("/me", requireUser(), (req: AuthedRequest, res) => {
  res.json({ id: req.user!.uid, name: req.user!.name, role: req.user!.role });
});

// POST /api/auth/change-password  { currentPassword, newPassword }
router.post(
  "/change-password",
  requireUser(),
  asyncHandler(async (req: AuthedRequest, res) => {
    const current = String(req.body?.currentPassword ?? "");
    const next = String(req.body?.newPassword ?? "");
    if (!isStrongPassword(next)) {
      return res.status(400).json({ error: "New password must have at least 8 characters, with letters and numbers." });
    }
    const [rows] = await pool.query<RowDataPacket[]>("SELECT password_hash FROM users WHERE user_id = ?", [req.user!.uid]);
    if (!rows[0] || !verifyPassword(current, rows[0].password_hash)) {
      return res.status(400).json({ error: "Current password is not correct." });
    }
    await pool.query("UPDATE users SET password_hash = ? WHERE user_id = ?", [hashPassword(next), req.user!.uid]);
    await audit(req.user!.uid, "PASSWORD_CHANGED", "own password", req.ip);
    res.json({ ok: true });
  })
);

export default router;
