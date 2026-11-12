// server/src/routes/robot.ts
// Operator-directed movement (Section 3.2): the farmer picks the next sampling
// point on the dashboard; the robot polls for that command, drives there,
// samples, and reports back.
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../db";
import {
  asyncHandler, audit, loadThresholds, requireDevice, requireUser, type AuthedRequest,
} from "../lib/middleware";

const router = Router();
const ROBOT_STATES = ["idle", "moving", "sampling", "offline"] as const;

// ---------------- dashboard side ----------------

// GET /api/robot/status -- robot card on the dashboard
router.get(
  "/status",
  requireUser(),
  asyncHandler(async (_req, res) => {
    const [devices] = await pool.query<RowDataPacket[]>(
      `SELECT device_id, device_name, last_seen, last_point, robot_state, battery_v,
              TIMESTAMPDIFF(SECOND, last_seen, UTC_TIMESTAMP()) AS seconds_since_seen
         FROM devices ORDER BY device_id LIMIT 1`
    );
    const device = devices[0] ?? null;
    let pending: RowDataPacket | null = null;
    if (device) {
      const [cmds] = await pool.query<RowDataPacket[]>(
        `SELECT command_id, command, target_point, status, created_at FROM robot_commands
          WHERE device_id = ? AND status IN ('pending','sent') ORDER BY command_id DESC LIMIT 1`,
        [device.device_id]
      );
      pending = cmds[0] ?? null;
      // A robot that has not been heard from for 2 minutes is shown as offline.
      if (device.seconds_since_seen === null || device.seconds_since_seen > 120) device.robot_state = "offline";
    }
    res.json({ device, pendingCommand: pending });
  })
);

// POST /api/robot/commands  { command: "GOTO"|"STOP"|"RETURN", targetPoint? }
router.post(
  "/commands",
  requireUser("admin", "farmer"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const command = String(req.body?.command ?? "").toUpperCase();
    if (!["GOTO", "STOP", "RETURN"].includes(command)) {
      return res.status(400).json({ error: "command must be GOTO, STOP or RETURN" });
    }
    let target: number | null = null;
    if (command === "GOTO") {
      target = Number(req.body?.targetPoint);
      const [pts] = await pool.query<RowDataPacket[]>("SELECT 1 FROM sampling_points WHERE point_index = ?", [target]);
      if (!Number.isInteger(target) || pts.length === 0) {
        return res.status(400).json({ error: "choose a registered sampling point" });
      }
    }
    const [devices] = await pool.query<RowDataPacket[]>("SELECT device_id FROM devices ORDER BY device_id LIMIT 1");
    if (devices.length === 0) return res.status(400).json({ error: "no robot is registered" });
    const deviceId = devices[0].device_id;

    // A new command replaces any command the robot has not started yet.
    await pool.query(
      "UPDATE robot_commands SET status = 'cancelled' WHERE device_id = ? AND status = 'pending'",
      [deviceId]
    );
    const [result] = await pool.query<ResultSetHeader>(
      "INSERT INTO robot_commands (device_id, command, target_point, issued_by) VALUES (?, ?, ?, ?)",
      [deviceId, command, target, req.user!.uid]
    );
    await audit(req.user!.uid, "ROBOT_COMMAND", `${command} ${target ?? ""}`.trim(), req.ip);
    res.status(201).json({ ok: true, commandId: result.insertId });
  })
);

// GET /api/robot/commands -- recent command history
router.get(
  "/commands",
  requireUser(),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.command_id, c.command, c.target_point, c.status, c.created_at, c.completed_at,
              u.full_name AS issued_by
         FROM robot_commands c JOIN users u ON u.user_id = c.issued_by
        ORDER BY c.command_id DESC LIMIT 20`
    );
    res.json(rows);
  })
);

// ---------------- robot side (X-Device-Key) ----------------

// GET /api/robot/next-command -- robot polls this between moves
router.get(
  "/next-command",
  requireDevice,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [cmds] = await pool.query<RowDataPacket[]>(
      `SELECT command_id, command, target_point FROM robot_commands
        WHERE device_id = ? AND status = 'pending' ORDER BY command_id ASC LIMIT 1`,
      [req.device!.device_id]
    );
    const t = await loadThresholds();
    const thresholds = { dryBelow: t.dryBelow, wetAbove: t.wetAbove, adcDryRaw: t.adcDryRaw, adcWetRaw: t.adcWetRaw };
    if (cmds.length === 0) return res.json({ command: "NONE", thresholds });
    await pool.query("UPDATE robot_commands SET status = 'sent' WHERE command_id = ?", [cmds[0].command_id]);
    res.json({
      command: cmds[0].command,
      commandId: cmds[0].command_id,
      targetPoint: cmds[0].target_point,
      thresholds,
    });
  })
);

// POST /api/robot/commands/:id/done -- robot confirms it finished a command
router.post(
  "/commands/:id/done",
  requireDevice,
  asyncHandler(async (req: AuthedRequest, res) => {
    await pool.query(
      "UPDATE robot_commands SET status = 'done', completed_at = UTC_TIMESTAMP() WHERE command_id = ? AND device_id = ?",
      [Number(req.params.id), req.device!.device_id]
    );
    res.json({ ok: true });
  })
);

// POST /api/robot/heartbeat  { state, point, battery }
router.post(
  "/heartbeat",
  requireDevice,
  asyncHandler(async (req: AuthedRequest, res) => {
    const state = String(req.body?.state ?? "idle");
    const point = req.body?.point === undefined ? null : Number(req.body.point);
    const battery = req.body?.battery === undefined ? null : Number(req.body.battery);
    if (!ROBOT_STATES.includes(state as (typeof ROBOT_STATES)[number])) {
      return res.status(400).json({ error: "invalid state" });
    }
    await pool.query(
      "UPDATE devices SET robot_state = ?, last_point = COALESCE(?, last_point), battery_v = COALESCE(?, battery_v) WHERE device_id = ?",
      [state, Number.isFinite(point) ? point : null, Number.isFinite(battery) ? battery : null, req.device!.device_id]
    );
    res.json({ ok: true });
  })
);

export default router;
