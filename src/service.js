// Service layer — composes persistence (db.js) with the intelligence engine.
// This is where the "school workflow" (§11) becomes concrete operations.
import { db, auditLog, nowISO } from './db.js';
import { TEST_BY_ID } from './config/battery.js';
import { validateMeasurement } from './engine/validate.js';
import { buildCapabilityProfile } from './engine/capability.js';
import { generateRecommendation, MODEL_VERSION } from './engine/recommend.js';
import { computeTrajectory } from './engine/trajectory.js';
import { buildNarrative } from './engine/narrative.js';
import { PROFILE_VERSION } from './engine/capability.js';

export function getStudent(studentId) {
  return db.prepare(
    `SELECT s.*, sc.name AS school_name, sc.district_id, sc.type AS school_type,
            sc.setting, sc.low_access, d.name AS district_name
     FROM student s
     JOIN school sc ON sc.school_id = s.school_id
     JOIN district d ON d.district_id = sc.district_id
     WHERE s.student_id = ?`
  ).get(studentId);
}

export function getExposures(studentId) {
  return db.prepare(`SELECT * FROM exposure WHERE student_id = ? ORDER BY at DESC`).all(studentId);
}

// All measurements for a student, newest first.
function studentMeasurements(studentId) {
  return db.prepare(
    `SELECT m.*, a.date AS session_date, a.cycle
     FROM measurement m JOIN assessment_session a ON a.session_id = m.session_id
     WHERE m.student_id = ? ORDER BY m.timestamp DESC`
  ).all(studentId);
}

// Current profile = most recent non-invalid measurement per test (§7.1).
function currentMeasurementSet(studentId) {
  const all = studentMeasurements(studentId);
  const byTest = new Map();
  for (const m of all) {
    if (m.validity === 'invalid') continue;
    if (!byTest.has(m.test_id)) byTest.set(m.test_id, m);
  }
  return [...byTest.values()];
}

// Per-session capability history (oldest -> newest) for trajectory.
function sessionHistory(studentId) {
  const student = getStudent(studentId);
  const rows = db.prepare(
    `SELECT DISTINCT m.session_id, a.date FROM measurement m
     JOIN assessment_session a ON a.session_id = m.session_id
     WHERE m.student_id = ? ORDER BY a.date ASC`
  ).all(studentId);
  const history = [];
  for (const r of rows) {
    const ms = db.prepare(`SELECT * FROM measurement WHERE student_id = ? AND session_id = ?`).all(studentId, r.session_id);
    const profile = buildCapabilityProfile(ms, student, new Date(r.date));
    history.push({ session_id: r.session_id, date: r.date, domainScores: profile.domainScores });
  }
  return history;
}

// Record a batch of test results for one student in a session (§7.2, §7.4).
export function recordMeasurements({ sessionId, studentId, results, assessorId, isRetest = false }, ctx = {}) {
  const session = db.prepare(`SELECT * FROM assessment_session WHERE session_id = ?`).get(sessionId);
  if (!session) throw httpError(404, 'session not found');
  const ts = nowISO();
  const insert = db.prepare(
    `INSERT INTO measurement (session_id, student_id, test_id, value, unit, attempts, validity, flags, assessor_id, device_id, timestamp, is_retest)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const out = [];
  for (const r of results) {
    if (!TEST_BY_ID[r.test_id]) continue;
    // Prevent duplicate submission unless explicitly a retest (§7.2).
    if (!isRetest) {
      const dup = db.prepare(
        `SELECT 1 FROM measurement WHERE session_id = ? AND student_id = ? AND test_id = ? AND is_retest = 0`
      ).get(sessionId, studentId, r.test_id);
      if (dup) continue;
    }
    const v = validateMeasurement(r.test_id, r.attempts ?? [r.value]);
    insert.run(
      sessionId, studentId, r.test_id, v.value, v.unit ?? null,
      JSON.stringify(r.attempts ?? [r.value]), v.validity, JSON.stringify(v.flags),
      assessorId ?? session.assessor_id, r.device_id ?? null, ts, isRetest ? 1 : 0
    );
    out.push({ test_id: r.test_id, ...v });
  }
  auditLog({ actor: ctx.actor, role: ctx.role, action: 'record_measurements', objectType: 'student', objectId: studentId, after: { sessionId, tests: out.map((o) => o.test_id) } });
  return out;
}

// Build capability profile + recommendation, persist snapshots (§9, §20).
export function generateIntelligence(studentId, ctx = {}) {
  const student = getStudent(studentId);
  if (!student) throw httpError(404, 'student not found');
  const measurements = currentMeasurementSet(studentId);
  const profile = buildCapabilityProfile(measurements, student);
  const exposures = getExposures(studentId);
  const history = sessionHistory(studentId);
  const trajectory = computeTrajectory(history);
  const reco = generateRecommendation(profile, exposures, { trajectoryBoost: trajectory.trajectoryBoost });
  const narrative = buildNarrative({ student, profile, reco, trajectory });

  const ts = nowISO();
  const latestSession = measurements.length ? measurements[0].session_id : null;
  db.prepare(
    `INSERT INTO movement_profile (student_id, session_id, domain_scores, domain_confidence, validity_score, evidence_completeness, version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(studentId, latestSession, JSON.stringify(profile.domainScores), JSON.stringify(profile.domainConfidence), profile.validityScore, profile.evidenceCompleteness, PROFILE_VERSION, ts);

  const inputSnapshot = { measurements: measurements.map((m) => ({ test_id: m.test_id, value: m.value, validity: m.validity })), exposures: exposures.map((e) => ({ play_level: e.play_level, competition_level: e.competition_level })), age: profile.age, sex: student.sex };
  db.prepare(`UPDATE recommendation SET superseded = 1 WHERE student_id = ? AND superseded = 0`).run(studentId);
  const recoRow = db.prepare(
    `INSERT INTO recommendation (student_id, session_id, payload, model_version, protocol_version, input_snapshot, created_at, superseded)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(studentId, latestSession, JSON.stringify({ ...reco, narrative }), reco.model_version, PROFILE_VERSION, JSON.stringify(inputSnapshot), ts);

  db.prepare(
    `INSERT INTO model_run (student_id, model_version, input_snapshot, output, reviewer, timestamp) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(studentId, MODEL_VERSION, JSON.stringify(inputSnapshot), JSON.stringify(reco.scores), ctx.actor ?? null, ts);

  auditLog({ actor: ctx.actor, role: ctx.role, action: 'generate_recommendation', objectType: 'recommendation', objectId: recoRow.lastInsertRowid, after: { model_version: reco.model_version, scores: reco.scores } });

  return { student, profile, reco, trajectory, narrative, recommendation_id: recoRow.lastInsertRowid };
}

// Full Student Sports Passport (§7.1).
export function getPassport(studentId) {
  const student = getStudent(studentId);
  if (!student) throw httpError(404, 'student not found');
  const measurements = studentMeasurements(studentId);
  const current = currentMeasurementSet(studentId);
  const profile = buildCapabilityProfile(current, student);
  const exposures = getExposures(studentId);
  const history = sessionHistory(studentId);
  const trajectory = computeTrajectory(history);
  const recoRow = db.prepare(`SELECT * FROM recommendation WHERE student_id = ? AND superseded = 0 ORDER BY created_at DESC LIMIT 1`).get(studentId);
  const reco = recoRow ? JSON.parse(recoRow.payload) : null;
  const narrative = reco?.narrative || buildNarrative({ student, profile, reco: reco || { exploration_set: [] }, trajectory });
  const observations = db.prepare(`SELECT o.*, u.name AS observer_name FROM observation o LEFT JOIN app_user u ON u.user_id = o.observer_id WHERE o.student_id = ? ORDER BY o.at DESC`).all(studentId);
  const referrals = db.prepare(`SELECT * FROM referral WHERE student_id = ? ORDER BY date DESC`).all(studentId);
  const progression = db.prepare(`SELECT * FROM progression_event WHERE student_id = ? ORDER BY date DESC`).all(studentId);
  const consents = db.prepare(`SELECT * FROM consent WHERE student_id = ? ORDER BY at DESC`).all(studentId);

  return {
    student,
    profile,
    current_measurements: current.map(hydrateMeasurement),
    measurement_history: measurements.map(hydrateMeasurement),
    exposures,
    trajectory,
    recommendation: reco,
    recommendation_meta: recoRow ? { model_version: recoRow.model_version, protocol_version: recoRow.protocol_version, created_at: recoRow.created_at, input_snapshot: JSON.parse(recoRow.input_snapshot || '{}') } : null,
    narrative,
    observations: observations.map((o) => ({ ...o, rubric: safeJSON(o.rubric) })),
    referrals,
    progression,
    consents,
  };
}

function hydrateMeasurement(m) {
  const t = TEST_BY_ID[m.test_id];
  return {
    measurement_id: m.measurement_id, test_id: m.test_id, test_name: t?.name ?? m.test_id,
    domain: t?.domain, value: m.value, unit: m.unit, validity: m.validity,
    flags: safeJSON(m.flags), attempts: safeJSON(m.attempts), session_id: m.session_id,
    session_date: m.session_date, is_retest: m.is_retest, timestamp: m.timestamp,
  };
}

// District/state Talent Pool with computed priority (§7.10, §10 District).
export function talentPool({ districtId, schoolId, tier } = {}) {
  let sql = `SELECT s.student_id, s.name, s.sex, s.birth_year, s.cohort, s.consent_status,
                    sc.name AS school_name, sc.type AS school_type, sc.setting, sc.low_access,
                    sc.district_id, d.name AS district_name
             FROM student s
             JOIN school sc ON sc.school_id = s.school_id
             JOIN district d ON d.district_id = sc.district_id`;
  const where = [];
  const params = [];
  if (districtId) { where.push('sc.district_id = ?'); params.push(districtId); }
  if (schoolId) { where.push('s.school_id = ?'); params.push(schoolId); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  const students = db.prepare(sql).all(...params);

  const rows = students.map((st) => {
    const recoRow = db.prepare(`SELECT * FROM recommendation WHERE student_id = ? AND superseded = 0 ORDER BY created_at DESC LIMIT 1`).get(st.student_id);
    const reco = recoRow ? JSON.parse(recoRow.payload) : null;
    const activeReferral = db.prepare(`SELECT * FROM referral WHERE student_id = ? ORDER BY date DESC LIMIT 1`).get(st.student_id);
    const top = reco?.exploration_set?.[0];
    return {
      ...st,
      has_profile: !!reco,
      referral_priority: reco?.referral_priority ?? null,
      priority_tier: reco?.priority_tier ?? null,
      evidence_completeness: reco?.scores?.evidence_completeness ?? null,
      opportunity_context: reco?.scores?.opportunity_context ?? null,
      opportunity_level: reco?.opportunity?.level ?? null,
      top_sport: top ? `${top.sport} — ${top.discipline}` : null,
      top_confidence: top?.confidence_band ?? null,
      referral_status: activeReferral?.status ?? null,
      referral_destination: activeReferral?.destination ?? null,
    };
  });
  const filtered = tier ? rows.filter((r) => r.priority_tier === tier) : rows;
  filtered.sort((a, b) => (b.referral_priority ?? -1) - (a.referral_priority ?? -1));
  return filtered;
}

export function addObservation(payload, ctx = {}) {
  const ts = nowISO();
  const r = db.prepare(
    `INSERT INTO observation (student_id, observer_id, sport_id, rubric, recommendation, notes, confidence, evidence_ref, reassessment_date, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(payload.student_id, ctx.userId ?? payload.observer_id ?? null, payload.sport_id ?? null,
    JSON.stringify(payload.rubric ?? {}), payload.recommendation ?? null, payload.notes ?? null,
    payload.confidence ?? null, payload.evidence_ref ?? null, payload.reassessment_date ?? null, ts);
  auditLog({ actor: ctx.actor, role: ctx.role, action: 'add_observation', objectType: 'student', objectId: payload.student_id, after: { recommendation: payload.recommendation, confidence: payload.confidence } });
  return { observation_id: r.lastInsertRowid };
}

export function createReferral(payload, ctx = {}) {
  const ts = nowISO();
  const recoRow = db.prepare(`SELECT payload FROM recommendation WHERE student_id = ? AND superseded = 0 ORDER BY created_at DESC LIMIT 1`).get(payload.student_id);
  const priority = recoRow ? JSON.parse(recoRow.payload).referral_priority : null;
  const r = db.prepare(
    `INSERT INTO referral (student_id, source_level, destination, status, priority, reason, created_by, date, outcome)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(payload.student_id, payload.source_level ?? 'school', payload.destination, payload.status ?? 'potential_signal',
    priority, payload.reason ?? null, ctx.userId ?? null, ts, payload.outcome ?? null);
  db.prepare(`INSERT INTO progression_event (student_id, event_type, date, level, result) VALUES (?, ?, ?, ?, ?)`)
    .run(payload.student_id, 'referral_created', ts, payload.destination, payload.status ?? 'potential_signal');
  auditLog({ actor: ctx.actor, role: ctx.role, action: 'create_referral', objectType: 'referral', objectId: r.lastInsertRowid, after: payload });
  return { referral_id: r.lastInsertRowid, priority };
}

export function updateReferral(referralId, patch, ctx = {}) {
  const before = db.prepare(`SELECT * FROM referral WHERE referral_id = ?`).get(referralId);
  if (!before) throw httpError(404, 'referral not found');
  db.prepare(`UPDATE referral SET status = COALESCE(?, status), outcome = COALESCE(?, outcome) WHERE referral_id = ?`)
    .run(patch.status ?? null, patch.outcome ?? null, referralId);
  const after = db.prepare(`SELECT * FROM referral WHERE referral_id = ?`).get(referralId);
  auditLog({ actor: ctx.actor, role: ctx.role, action: 'update_referral', objectType: 'referral', objectId: referralId, before, after });
  return after;
}

export function recordConsent(studentId, { guardian, status, scope }, ctx = {}) {
  const ts = nowISO();
  db.prepare(`INSERT INTO consent (student_id, guardian, scope, status, at) VALUES (?, ?, ?, ?, ?)`)
    .run(studentId, guardian ?? null, scope ?? 'assessment_and_recommendation', status, ts);
  db.prepare(`UPDATE student SET consent_status = ? WHERE student_id = ?`).run(status === 'granted' ? 'granted' : 'withdrawn', studentId);
  auditLog({ actor: ctx.actor, role: ctx.role, action: 'record_consent', objectType: 'student', objectId: studentId, after: { status } });
  return { ok: true, status };
}

export function safeJSON(s) { try { return JSON.parse(s); } catch { return s; } }
export function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
