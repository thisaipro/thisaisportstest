// Normative reference for age/category normalisation (§3, §7.3, §9).
//
// IMPORTANT (per PRD §8, §19, §25): these are SYNTHETIC PLACEHOLDER norms for
// the MVP so the pipeline is exercisable end-to-end. They are deterministic and
// auditable but are NOT validated reference populations. Before any real pilot
// decision they MUST be replaced by an expert-approved normative dataset
// (Khelo India / state sports science). The normalisation METHOD (z-score ->
// percentile) is stable; only the (mean, sd) tables change.

import { TEST_BY_ID, ageBandFor } from '../config/battery.js';

export const NORMS_VERSION = 'norms-v1.0-synthetic';

// Reference mean+sd for each scoring test at the U15 band, boys.
// Values are plausible school-level figures; treated as placeholders.
const REF = {
  sprint_30m_s: { mean: 5.4, sd: 0.6 },
  run_600m_s: { mean: 150, sd: 22 },
  standing_broad_jump_cm: { mean: 175, sd: 28 },
  vertical_jump_cm: { mean: 34, sd: 8 },
  sit_and_reach_cm: { mean: 6, sd: 6 },
  med_ball_throw_cm: { mean: 420, sd: 90 },
  plank_hold_s: { mean: 70, sd: 30 },
  shuttle_run_10x4_s: { mean: 12.2, sd: 1.2 },
  flamingo_balance_falls: { mean: 6, sd: 3 },
  movement_screen_score: { mean: 13, sd: 3 },
};

// Age scaling: capacity generally rises with age for most tests. We scale the
// mean by an age factor and keep sd roughly proportional. For "lower is better"
// timed tests the mean falls with age (faster). Balance falls decrease with age.
const AGE_FACTOR = { U11: 0.82, U13: 0.92, U15: 1.0, U17: 1.07, U19: 1.11 };
// Tests where a HIGHER age should REDUCE the raw mean (times, falls).
const INVERSE_AGE = new Set(['sprint_30m_s', 'run_600m_s', 'shuttle_run_10x4_s', 'flamingo_balance_falls']);
// Simple sex adjustment factor on the mean (placeholder, power/strength tests).
const SEX_FACTOR = {
  standing_broad_jump_cm: { F: 0.9 }, vertical_jump_cm: { F: 0.85 },
  med_ball_throw_cm: { F: 0.85 }, plank_hold_s: { F: 0.95 },
  sprint_30m_s: { F: 1.04 }, run_600m_s: { F: 1.06 }, shuttle_run_10x4_s: { F: 1.03 },
  sit_and_reach_cm: { F: 1.15 },
};

export function normFor(testId, ageYears, sex) {
  const ref = REF[testId];
  if (!ref) return null;
  const band = ageBandFor(ageYears);
  const af = AGE_FACTOR[band] ?? 1;
  const factor = INVERSE_AGE.has(testId) ? 1 / af : af;
  let mean = ref.mean * factor;
  const sxf = SEX_FACTOR[testId]?.[sex];
  if (sxf) mean *= sxf;
  const sd = ref.sd * (0.9 + 0.2 * af);
  return { mean, sd: Math.max(sd, 1e-6), band };
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26 approximation).
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  let p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  p = 1 - p;
  return z >= 0 ? p : 1 - p;
}

// Convert a raw measurement to a 0-100 normalised capability percentile,
// respecting test direction (lower-is-better inverts the z-score).
export function normalise(testId, value, ageYears, sex) {
  const test = TEST_BY_ID[testId];
  const n = normFor(testId, ageYears, sex);
  if (!test || !n || value == null || !Number.isFinite(value)) return null;
  let z = (value - n.mean) / n.sd;
  if (test.direction === 'lower') z = -z;
  const pct = normalCdf(z) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}
