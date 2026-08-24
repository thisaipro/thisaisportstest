// Deterministic seed data for the Epic 3 MVP pilot demo (§17 pilot design).
// Creates a Tamil Nadu hierarchy (State -> District -> School -> Class -> Student)
// deliberately including low-access rural government schools so the platform is
// tested against the real operating constraint (§17). Two assessment cycles are
// seeded for a subset so the longitudinal/trajectory features are exercisable.
import { db, initSchema, nowISO } from './db.js';
import { TESTS, TEST_BY_ID, ageBandFor } from './config/battery.js';
import { normFor } from './engine/norms.js';
import { SPORTS, SPORT_PROFILE_VERSION } from './config/sports.js';
import { recordMeasurements, generateIntelligence, createReferral, addObservation, recordConsent } from './service.js';
import { fileURLToPath } from 'node:url';

// --- deterministic RNG -----------------------------------------------------
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20260822);
function gauss(mean = 0, sd = 1) { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function resetDb() {
  const tables = ['audit_event', 'sport_profile_version', 'model_run', 'progression_event', 'referral', 'observation', 'recommendation', 'movement_profile', 'exposure', 'measurement', 'assessment_session', 'consent', 'student', 'app_user', 'school', 'district'];
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS ${t};`);
}

const FIRST = ['Arun', 'Divya', 'Karthik', 'Priya', 'Vishnu', 'Meena', 'Suresh', 'Lakshmi', 'Rahul', 'Deepa', 'Vijay', 'Anitha', 'Manoj', 'Kavya', 'Sanjay', 'Nithya', 'Ravi', 'Bhavana', 'Ganesh', 'Ishwarya', 'Prakash', 'Swathi', 'Naveen', 'Revathi'];
const LAST = ['Kumar', 'Raj', 'Murugan', 'Selvam', 'Iyer', 'Nadar', 'Pillai', 'Krishnan', 'Balan', 'Subramani'];

function seed() {
  initSchema();
  // Record the initial sport-profile version snapshot (§7.5) with approver/rationale.
  db.prepare(`INSERT INTO sport_profile_version (requirement_version, approver, rationale, effective_date, snapshot) VALUES (?, ?, ?, ?, ?)`)
    .run(SPORT_PROFILE_VERSION, 'Dr. Sports Scientist', 'Initial expert-approved MVP exploration profiles pending pilot validation.', '2026-02-01', JSON.stringify(SPORTS));

  const districts = [
    { district_id: 'D-CHN', name: 'Chennai' },
    { district_id: 'D-CBE', name: 'Coimbatore' },
    { district_id: 'D-MDU', name: 'Madurai' },
  ];
  for (const d of districts) db.prepare(`INSERT INTO district (district_id, name, state) VALUES (?, ?, 'Tamil Nadu')`).run(d.district_id, d.name);

  // Two schools per district: one urban private/aided, one rural low-access govt.
  const schools = [];
  const schoolDefs = [
    ['D-CHN', 'Chennai Public School', 'private', 'urban', 0],
    ['D-CHN', 'Govt Higher Sec School, Sholinganallur', 'government', 'semi-urban', 1],
    ['D-CBE', 'Coimbatore Vidya Mandir', 'aided', 'urban', 0],
    ['D-CBE', 'Govt School, Pollachi Rural', 'government', 'rural', 1],
    ['D-MDU', 'Madurai Model School', 'private', 'semi-urban', 0],
    ['D-MDU', 'Panchayat Union School, Melur', 'government', 'rural', 1],
  ];
  schoolDefs.forEach((s, i) => {
    const id = `SCH-${i + 1}`;
    db.prepare(`INSERT INTO school (school_id, district_id, name, type, setting, low_access) VALUES (?, ?, ?, ?, ?, ?)`).run(id, s[0], s[1], s[2], s[3], s[4]);
    schools.push({ school_id: id, district_id: s[0], name: s[1], type: s[2], setting: s[3], low_access: s[4] });
  });

  // Users.
  db.prepare(`INSERT INTO app_user (user_id, name, email, role, district_id, school_id) VALUES (?, ?, ?, ?, ?, ?)`).run('U-STATE', 'Tamil Nadu State Admin', 'state@thisai.example', 'state_admin', null, null);
  db.prepare(`INSERT INTO app_user (user_id, name, email, role) VALUES ('U-ADMIN', 'Platform Admin', 'admin@thisai.example', 'platform_admin')`);
  db.prepare(`INSERT INTO app_user (user_id, name, email, role) VALUES ('U-SCI', 'Dr. Sports Scientist', 'science@thisai.example', 'sports_scientist')`);
  for (const d of districts) {
    db.prepare(`INSERT INTO app_user (user_id, name, email, role, district_id) VALUES (?, ?, ?, 'district_specialist', ?)`).run(`U-SPEC-${d.district_id}`, `${d.name} District Specialist`, `spec.${d.district_id.toLowerCase()}@thisai.example`, d.district_id);
  }
  const teacherBySchool = {};
  schools.forEach((sc, i) => {
    const tid = `U-PE-${i + 1}`;
    db.prepare(`INSERT INTO app_user (user_id, name, email, role, district_id, school_id) VALUES (?, ?, ?, 'pe_teacher', ?, ?)`).run(tid, `PE Teacher ${i + 1}`, `pe${i + 1}@thisai.example`, sc.district_id, sc.school_id);
    db.prepare(`INSERT INTO app_user (user_id, name, email, role, district_id, school_id) VALUES (?, ?, ?, 'school_admin', ?, ?)`).run(`U-SA-${i + 1}`, `School Admin ${i + 1}`, `sa${i + 1}@thisai.example`, sc.district_id, sc.school_id);
    db.prepare(`INSERT INTO app_user (user_id, name, email, role, district_id) VALUES (?, ?, ?, 'coach', ?)`).run(`U-COACH-${i + 1}`, `Coach ${i + 1}`, `coach${i + 1}@thisai.example`, sc.district_id);
    teacherBySchool[sc.school_id] = tid;
  });

  // Students: ~10 per school, ages 11-17.
  const students = [];
  let sn = 0;
  const cohorts = ['Class 6-A', 'Class 7-A', 'Class 8-A', 'Class 9-A'];
  for (const sc of schools) {
    for (let i = 0; i < 10; i++) {
      sn++;
      const id = `STU-${String(sn).padStart(3, '0')}`;
      const sex = rnd() < 0.5 ? 'M' : 'F';
      const age = 11 + Math.floor(rnd() * 7); // 11..17
      const birthYear = 2026 - age;
      const cohort = cohorts[clamp(age - 11, 0, 3) ] || pick(cohorts);
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const consent = rnd() < 0.88 ? 'granted' : 'pending';
      db.prepare(`INSERT INTO student (student_id, school_id, name, cohort, sex, birth_year, consent_status, guardian_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, sc.school_id, name, cohort, sex, birthYear, consent, `Guardian of ${name}`, nowISO());
      if (consent === 'granted') recordConsent(id, { guardian: `Guardian of ${name}`, status: 'granted' }, { actor: 'seed', role: 'system' });
      // latent ability per domain
      const g = gauss(0, 0.55);
      const ability = {};
      for (const dom of ['speed', 'endurance', 'power', 'strength', 'agility', 'flexibility', 'balance', 'coordination']) ability[dom] = g + gauss(0, 0.7);
      students.push({ student_id: id, school_id: sc.school_id, district_id: sc.district_id, sex, age, birthYear, cohort, ability, low_access: sc.low_access });
    }
  }

  // Generate a raw measurement value from latent domain ability.
  function rawFor(test, student) {
    if (test.domain === 'anthropometry') {
      if (test.id === 'height_cm') return clamp(Math.round(120 + (student.age - 11) * 7 + gauss(0, 6)), test.min, test.max);
      if (test.id === 'weight_kg') return clamp(Math.round(25 + (student.age - 11) * 4.5 + gauss(0, 6)), test.min, test.max);
    }
    const n = normFor(test.id, student.age, student.sex);
    if (!n) return null;
    const z = student.ability[test.domain] ?? gauss(0, 1);
    let raw = test.direction === 'lower' ? n.mean - z * n.sd : n.mean + z * n.sd;
    raw += gauss(0, n.sd * 0.15);
    return Math.round(raw * 100) / 100;
  }

  function attemptsFor(test, student, injectBad) {
    const base = rawFor(test, student);
    if (base == null) return [base];
    if (injectBad === 'impossible') return [test.direction === 'lower' ? test.hardMin - 1 : test.hardMax + 5];
    if (injectBad === 'implausible') return [test.direction === 'lower' ? test.min - 1.5 : test.max + 8];
    const n = Math.min(test.attempts, 3);
    const arr = [base];
    for (let k = 1; k < n; k++) arr.push(Math.round((base + gauss(0, Math.abs(base) * 0.03 + 0.1)) * 100) / 100);
    return arr;
  }

  // --- Cycle 1: baseline ---
  const sessionBySchool = {};
  for (const sc of schools) {
    const sid = `S-${sc.school_id}-BASE`;
    db.prepare(`INSERT INTO assessment_session (session_id, school_id, cohort, assessor_id, protocol_version, cycle, date, status) VALUES (?, ?, NULL, ?, 'battery-v1.0', '2026-baseline', '2026-02-10', 'closed')`)
      .run(sid, sc.school_id, teacherBySchool[sc.school_id]);
    sessionBySchool[sc.school_id] = sid;
  }

  let badCount = 0;
  for (const st of students) {
    if (st.consentPending) continue;
    const sid = sessionBySchool[st.school_id];
    const results = TESTS.map((test) => {
      let inject = null;
      const r = rnd();
      if (r < 0.03) { inject = 'impossible'; badCount++; }
      else if (r < 0.11) inject = 'implausible';
      return { test_id: test.id, attempts: attemptsFor(test, st, inject) };
    });
    recordMeasurements({ sessionId: sid, studentId: st.student_id, results, assessorId: teacherBySchool[st.school_id] }, { actor: 'seed', role: 'pe_teacher' });

    // Exposure — low-access schools get lower exposure/coaching (equity signal).
    const low = st.low_access;
    db.prepare(`INSERT INTO exposure (student_id, sport_id, sport_label, play_level, competition_level, coaching_access, facility_access, interest, duration_months, frequency_per_week, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(st.student_id, null, pick(['Cricket', 'Football', 'Kabaddi', 'Athletics', 'None']),
        low ? pick(['never', 'recreational', 'recreational', 'school_team']) : pick(['recreational', 'school_team', 'school_team', 'club']),
        low ? pick(['none', 'none', 'school']) : pick(['school', 'block', 'district']),
        low ? pick(['none', 'none', 'pe_teacher']) : pick(['pe_teacher', 'community_coach', 'specialist_coach']),
        low ? pick(['school', 'public']) : pick(['school', 'club', 'academy']),
        pick(['interested', 'interested', 'neutral']), Math.floor(rnd() * 24), 1 + Math.floor(rnd() * 5), nowISO());
  }

  // --- Cycle 2: follow-up for ~40% of students (some rapid improvers) ---
  const followSchools = schools;
  for (const sc of followSchools) {
    const sid = `S-${sc.school_id}-FUP`;
    db.prepare(`INSERT INTO assessment_session (session_id, school_id, cohort, assessor_id, protocol_version, cycle, date, status) VALUES (?, ?, NULL, ?, 'battery-v1.0', '2026-followup', '2026-08-15', 'closed')`)
      .run(sid, sc.school_id, teacherBySchool[sc.school_id]);
  }
  for (const st of students) {
    if (rnd() > 0.45) continue;
    const sid = `S-${st.school_id}-FUP`;
    const improver = rnd() < 0.3;
    const boosted = { ...st, ability: {} };
    for (const k of Object.keys(st.ability)) boosted.ability[k] = st.ability[k] + (improver ? gauss(0.9, 0.2) : gauss(0.15, 0.25));
    boosted.age = st.age; boosted.sex = st.sex;
    const results = TESTS.map((test) => ({ test_id: test.id, attempts: attemptsFor(test, boosted, null) }));
    recordMeasurements({ sessionId: sid, studentId: st.student_id, results, assessorId: teacherBySchool[st.school_id] }, { actor: 'seed', role: 'pe_teacher' });
    db.prepare(`INSERT INTO progression_event (student_id, event_type, date, level, result) VALUES (?, 'exposure_session', '2026-05-01', ?, 'completed')`).run(st.student_id, pick(['Athletics', 'Football', 'Kabaddi']));
  }

  // --- Generate intelligence for every consented student ---
  const consented = students.filter((s) => db.prepare(`SELECT consent_status FROM student WHERE student_id=?`).get(s.student_id).consent_status === 'granted');
  for (const st of consented) {
    try { generateIntelligence(st.student_id, { actor: 'seed', role: 'system' }); } catch (e) { /* skip students with no valid data */ }
  }

  // --- Seed a few specialist observations + referrals for high-priority students ---
  const pool = db.prepare(`SELECT student_id, payload FROM recommendation WHERE superseded = 0`).all()
    .map((r) => ({ student_id: r.student_id, reco: JSON.parse(r.payload) }))
    .filter((r) => r.reco.priority_tier === 'high')
    .sort((a, b) => b.reco.referral_priority - a.reco.referral_priority);

  for (const cand of pool.slice(0, 8)) {
    const top = cand.reco.exploration_set?.[0];
    addObservation({ student_id: cand.student_id, sport_id: top?.sport_id, recommendation: 'specialist_review', notes: `Confirmed strong ${top?.reasons?.[0] || 'signal'} in trial.`, confidence: 'medium', rubric: { technique: 3, athleticism: 4, game_sense: 3 }, reassessment_date: '2027-02-01' }, { actor: 'Chennai District Specialist', role: 'district_specialist', userId: 'U-SPEC-' + (db.prepare(`SELECT sc.district_id d FROM student s JOIN school sc ON sc.school_id=s.school_id WHERE s.student_id=?`).get(cand.student_id).d) });
    createReferral({ student_id: cand.student_id, source_level: 'school', destination: pick(['district_camp', 'sdat', 'academy']), status: pick(['potential_signal', 'shortlisted']), reason: `High referral priority (${cand.reco.referral_priority}); ${top ? top.sport : ''} exploration.` }, { actor: 'seed', role: 'district_specialist', userId: 'U-SPEC-D-CHN' });
  }

  const counts = {
    districts: db.prepare(`SELECT COUNT(*) c FROM district`).get().c,
    schools: db.prepare(`SELECT COUNT(*) c FROM school`).get().c,
    students: db.prepare(`SELECT COUNT(*) c FROM student`).get().c,
    measurements: db.prepare(`SELECT COUNT(*) c FROM measurement`).get().c,
    invalid: db.prepare(`SELECT COUNT(*) c FROM measurement WHERE validity='invalid'`).get().c,
    needs_review: db.prepare(`SELECT COUNT(*) c FROM measurement WHERE validity='needs_review'`).get().c,
    recommendations: db.prepare(`SELECT COUNT(*) c FROM recommendation`).get().c,
    referrals: db.prepare(`SELECT COUNT(*) c FROM referral`).get().c,
  };
  console.log('Seed complete:', JSON.stringify(counts, null, 2));
}

export { seed, resetDb };

// Only run automatically when invoked directly (npm run seed / reset),
// not when imported by the server for auto-seeding.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes('--reset')) resetDb();
  seed();
}
