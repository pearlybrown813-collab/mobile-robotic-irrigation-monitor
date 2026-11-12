// client/src/types.ts -- shapes of the data returned by the API.
// Because these are typed, a misspelt field (moisture_pct vs moisturePct)
// is caught while writing the component, not as a blank cell in the browser.

export type Status = "dry" | "normal" | "wet";
export type Role = "admin" | "farmer";

export interface User {
  id: number;
  name: string;
  role: Role;
}

export interface Reading {
  record_id: number;
  point_index: number;
  point_label: string;
  moisture_pct: number;
  temperature_c: number;
  status: Status;
  recommendation: string;
  was_buffered: 0 | 1;
  recorded_at: string;
}

export interface PointSummary {
  point_index: number;
  point_label: string;
  distance_m: number;
  crop: string | null;
  record_id: number | null;
  moisture_pct: number | null;
  temperature_c: number | null;
  status: Status | null;
  recommendation: string | null;
  recorded_at: string | null;
}

export interface SamplingPoint {
  point_index: number;
  label: string;
  distance_m: number;
  crop: string | null;
  notes: string | null;
}

export interface Thresholds {
  dryBelow: number;
  wetAbove: number;
  hotAbove: number;
  adcDryRaw: number;
  adcWetRaw: number;
}

export interface RobotStatus {
  device: {
    device_id: number;
    device_name: string;
    last_seen: string | null;
    last_point: number | null;
    robot_state: "idle" | "moving" | "sampling" | "offline";
    battery_v: number | null;
    seconds_since_seen: number | null;
  } | null;
  pendingCommand: {
    command_id: number;
    command: "GOTO" | "STOP" | "RETURN";
    target_point: number | null;
    status: "pending" | "sent";
  } | null;
}

export interface AppUser {
  user_id: number;
  full_name: string;
  username: string;
  role: Role;
  is_active: 0 | 1;
  created_at: string;
}

export interface AuditEntry {
  log_id: number;
  action: string;
  detail: string | null;
  ip_address: string | null;
  created_at: string;
  full_name: string | null;
}
