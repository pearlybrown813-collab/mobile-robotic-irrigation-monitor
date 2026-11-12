// server/src/lib/decision.ts
// Threshold-based decision support (Sections 3.4.3 and 4.7).
// The same rules are used by the robot firmware, so the robot and the
// dashboard can never disagree on the status of a sampling point.

export type Status = "dry" | "normal" | "wet";

export interface Thresholds {
  dryBelow: number;   // moisture % below this  -> dry
  wetAbove: number;   // moisture % above this  -> wet
  hotAbove: number;   // temperature above this -> high-temperature advisory
  adcDryRaw: number;  // calibration: raw ADC in dry air
  adcWetRaw: number;  // calibration: raw ADC in water
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  dryBelow: 30,
  wetAbove: 60,
  hotAbove: 35,
  adcDryRaw: 3000,
  adcWetRaw: 1200,
};

export const RECOMMENDATION: Record<Status, string> = {
  dry: "Irrigation needed",
  normal: "Condition satisfactory",
  wet: "No irrigation required",
};

/** Two-point calibration: converts an averaged 12-bit ADC value to moisture %. */
export function rawToMoisturePercent(raw: number, t: Thresholds = DEFAULT_THRESHOLDS): number {
  const span = t.adcDryRaw - t.adcWetRaw;
  if (span === 0) return 0;
  const pct = ((t.adcDryRaw - raw) / span) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

/** Classifies a moisture percentage as dry, normal or wet. */
export function classify(moisturePct: number, t: Thresholds = DEFAULT_THRESHOLDS): Status {
  if (moisturePct < t.dryBelow) return "dry";
  if (moisturePct > t.wetAbove) return "wet";
  return "normal";
}

/**
 * Builds the recommendation shown on the dashboard. Ambient temperature is
 * used as a complementary variable: a "normal" point on a hot day is flagged
 * for an early re-check because it will lose moisture faster.
 */
export function recommend(status: Status, temperatureC: number, t: Thresholds = DEFAULT_THRESHOLDS): string {
  if (status === "normal" && temperatureC > t.hotAbove) {
    return "Condition satisfactory - re-check soon (high temperature)";
  }
  if (status === "dry" && temperatureC > t.hotAbove) {
    return "Irrigation needed - urgent (high temperature)";
  }
  return RECOMMENDATION[status];
}
