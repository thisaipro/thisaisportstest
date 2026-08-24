// Measurement Quality & Validation (§7.4, §20 acceptance criteria).
//  - Range validation: reject impossible values, flag implausible ones.
//  - Attempt logic: preserve all attempts; compute configured best/mean.
//  - Every session/measurement gets Valid / Needs Review / Invalid status.
import { TEST_BY_ID } from '../config/battery.js';

// Compute the canonical result from raw attempts per the test's bestRule.
export function reduceAttempts(test, attempts) {
  const nums = attempts.filter((a) => a != null && Number.isFinite(a));
  if (nums.length === 0) return null;
  if (test.bestRule === 'mean') {
    return Math.round((nums.reduce((s, a) => s + a, 0) / nums.length) * 100) / 100;
  }
  // "best" depends on direction: lower-is-better -> min, else max.
  return test.direction === 'lower' ? Math.min(...nums) : Math.max(...nums);
}

// Validate one test result. Returns { value, validity, flags }.
export function validateMeasurement(testId, rawAttempts) {
  const test = TEST_BY_ID[testId];
  const flags = [];
  if (!test) return { value: null, validity: 'invalid', flags: ['unknown_test'] };

  const attempts = (Array.isArray(rawAttempts) ? rawAttempts : [rawAttempts])
    .map((a) => (a === '' || a == null ? null : Number(a)));

  if (attempts.every((a) => a == null || !Number.isFinite(a))) {
    return { value: null, validity: 'invalid', flags: ['no_value'] };
  }

  // Reject physically impossible attempts outright.
  const impossible = attempts.some(
    (a) => a != null && Number.isFinite(a) && (a < test.hardMin || a > test.hardMax)
  );
  if (impossible) flags.push('impossible_value');

  // Flag implausible-but-not-impossible values (kept, needs review).
  const implausible = attempts.some(
    (a) => a != null && Number.isFinite(a) && (a < test.min || a > test.max)
  );
  if (implausible) flags.push('implausible_value');

  // Attempts exceeding allowed count -> note but do not discard.
  const provided = attempts.filter((a) => a != null && Number.isFinite(a)).length;
  if (provided > test.attempts) flags.push('extra_attempts');

  const value = reduceAttempts(test, attempts);

  let validity = 'valid';
  if (impossible) validity = 'invalid';
  else if (implausible) validity = 'needs_review';

  return { value, validity, flags, unit: test.unit };
}

// Session-level Assessment Validity Score (§9): trustworthiness of the set.
export function sessionValidity(measurements) {
  if (!measurements.length) return { score: 0, status: 'invalid', counts: { valid: 0, needs_review: 0, invalid: 0 } };
  const counts = { valid: 0, needs_review: 0, invalid: 0 };
  for (const m of measurements) counts[m.validity] = (counts[m.validity] || 0) + 1;
  const total = measurements.length;
  const score = Math.round(((counts.valid + 0.5 * counts.needs_review) / total) * 100) / 100;
  let status = 'valid';
  if (score < 0.5) status = 'invalid';
  else if (score < 0.85) status = 'needs_review';
  return { score, status, counts };
}
