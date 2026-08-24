// Capability Profile builder (§7.4, §9). Turns a session's validated
// measurements into interpretable, age/sex-normalised domain scores plus the
// component scores the UI shows instead of a single opaque "talent score".
import { DOMAIN_IDS, SCORING_TESTS, TEST_BY_ID } from '../config/battery.js';
import { normalise } from './norms.js';
import { sessionValidity } from './validate.js';

export const PROFILE_VERSION = 'capability-v1.0';

// ageYears at assessment date from birth_year.
export function ageFromBirthYear(birthYear, refDate = new Date()) {
  if (!birthYear) return null;
  return refDate.getFullYear() - birthYear;
}

// measurements: [{ test_id, value, validity }]; student: { birth_year, sex }
export function buildCapabilityProfile(measurements, student, refDate = new Date()) {
  const age = ageFromBirthYear(student.birth_year, refDate);
  const usable = measurements.filter((m) => m.validity !== 'invalid' && m.value != null);

  // Accumulate normalised scores per domain (a domain can have >1 test).
  const acc = {};
  for (const id of DOMAIN_IDS) acc[id] = [];
  for (const m of usable) {
    const test = TEST_BY_ID[m.test_id];
    if (!test || test.domain === 'anthropometry') continue;
    const norm = normalise(m.test_id, m.value, age, student.sex);
    if (norm == null) continue;
    // needs_review contributes at reduced weight (lower confidence, kept).
    const w = m.validity === 'needs_review' ? 0.5 : 1;
    acc[test.domain].push({ norm, w });
  }

  const domainScores = {};
  const domainConfidence = {};
  for (const id of DOMAIN_IDS) {
    const arr = acc[id];
    if (!arr.length) {
      domainScores[id] = null;
      domainConfidence[id] = 0;
      continue;
    }
    const wsum = arr.reduce((s, a) => s + a.w, 0);
    domainScores[id] = Math.round((arr.reduce((s, a) => s + a.norm * a.w, 0) / wsum) * 10) / 10;
    // confidence grows with number + quality of contributing measurements.
    domainConfidence[id] = Math.round(Math.min(1, wsum / 1.0) * 100) / 100;
  }

  // Evidence completeness: share of scoring tests present with a usable value.
  const expected = SCORING_TESTS.length;
  const present = new Set(usable.map((m) => m.test_id).filter((id) => TEST_BY_ID[id]?.domain !== 'anthropometry'));
  const evidenceCompleteness = Math.round((present.size / expected) * 100) / 100;

  const validity = sessionValidity(measurements);

  return {
    version: PROFILE_VERSION,
    age,
    domainScores,
    domainConfidence,
    validityScore: validity.score,
    validityStatus: validity.status,
    evidenceCompleteness,
    testsPresent: [...present],
    testsMissing: SCORING_TESTS.map((t) => t.id).filter((id) => !present.has(id)),
  };
}
