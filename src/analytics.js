// Dashboards & Pilot KPIs (§10, §18). Aggregations for teacher/school/district/
// state views and the pilot validation funnel (screened -> flagged -> exposed
// -> assessed -> referred -> progressed).
import { db } from './db.js';
import { talentPool } from './service.js';

export function teacherDashboard(schoolId) {
  const students = db.prepare(`SELECT student_id, name, cohort, consent_status FROM student WHERE school_id = ?`).all(schoolId);
  const total = students.length;
  const consented = students.filter((s) => s.consent_status === 'granted').length;
  const pool = talentPool({ schoolId });
  const withProfile = pool.filter((p) => p.has_profile).length;
  const flagged = pool.filter((p) => p.priority_tier === 'high' || p.priority_tier === 'medium').length;

  // Retest queue: measurements needing review.
  const needsReview = db.prepare(
    `SELECT m.student_id, st.name, m.test_id, m.value, m.validity FROM measurement m
     JOIN student st ON st.student_id = m.student_id
     WHERE st.school_id = ? AND m.validity = 'needs_review'`
  ).all(schoolId);

  const sessions = db.prepare(`SELECT * FROM assessment_session WHERE school_id = ? ORDER BY date DESC`).all(schoolId);

  return {
    coverage: { total_students: total, consented, with_profile: withProfile, coverage_pct: total ? Math.round((withProfile / total) * 100) : 0 },
    flagged_count: flagged,
    retest_queue: needsReview,
    sessions,
    students: pool,
  };
}

export function districtDashboard(districtId) {
  const schools = db.prepare(`SELECT * FROM school WHERE district_id = ?`).all(districtId);
  const pool = talentPool({ districtId });
  const bySchool = schools.map((sc) => {
    const p = pool.filter((x) => x.school_name === sc.name);
    const withProfile = p.filter((x) => x.has_profile).length;
    return {
      school_id: sc.school_id, name: sc.name, type: sc.type, setting: sc.setting, low_access: sc.low_access,
      students: p.length, with_profile: withProfile,
      coverage_pct: p.length ? Math.round((withProfile / p.length) * 100) : 0,
      high_priority: p.filter((x) => x.priority_tier === 'high').length,
    };
  });
  const funnel = pilotFunnel({ districtId });
  const specialistWorkload = pool.filter((p) => p.priority_tier === 'high' && (!p.referral_status || p.referral_status === 'potential_signal')).length;
  return {
    schools: bySchool,
    talent_pool: pool.slice(0, 100),
    funnel,
    specialist_workload: specialistWorkload,
    equity: equityBreakdown(pool),
  };
}

export function stateDashboard() {
  const districts = db.prepare(`SELECT * FROM district`).all();
  const rows = districts.map((d) => {
    const pool = talentPool({ districtId: d.district_id });
    const withProfile = pool.filter((p) => p.has_profile).length;
    return {
      district_id: d.district_id, name: d.name,
      students: pool.length, with_profile: withProfile,
      coverage_pct: pool.length ? Math.round((withProfile / pool.length) * 100) : 0,
      high_priority: pool.filter((p) => p.priority_tier === 'high').length,
      referrals: db.prepare(`SELECT COUNT(*) c FROM referral r JOIN student s ON s.student_id=r.student_id JOIN school sc ON sc.school_id=s.school_id WHERE sc.district_id=?`).get(d.district_id).c,
    };
  });
  return { districts: rows, funnel: pilotFunnel({}), equity: equityBreakdown(talentPool({})) };
}

// Pilot validation funnel (§17, §18, §20 acceptance criterion 14).
export function pilotFunnel({ districtId, schoolId } = {}) {
  const pool = talentPool({ districtId, schoolId });
  const scoped = pool.map((p) => p.student_id);
  const inSet = scoped.length ? `(${scoped.map(() => '?').join(',')})` : '(NULL)';
  const cnt = (sql, extra = []) => (scoped.length ? db.prepare(sql).get(...scoped, ...extra).c : 0);

  const screened = pool.filter((p) => p.has_profile).length;
  const flagged = pool.filter((p) => p.priority_tier === 'high' || p.priority_tier === 'medium').length;
  const exposed = cnt(`SELECT COUNT(DISTINCT student_id) c FROM progression_event WHERE student_id IN ${inSet} AND event_type='exposure_session'`);
  const assessed = cnt(`SELECT COUNT(DISTINCT student_id) c FROM observation WHERE student_id IN ${inSet}`);
  const referred = cnt(`SELECT COUNT(DISTINCT student_id) c FROM referral WHERE student_id IN ${inSet}`);
  const progressed = cnt(`SELECT COUNT(DISTINCT student_id) c FROM referral WHERE student_id IN ${inSet} AND status IN ('accepted','confirmed_pathway')`);

  return {
    total: pool.length, screened, flagged, exposed, assessed, referred, progressed,
  };
}

function equityBreakdown(pool) {
  const groups = {};
  for (const p of pool) {
    const key = p.school_type || 'unknown';
    groups[key] = groups[key] || { school_type: key, students: 0, flagged: 0, low_access: 0 };
    groups[key].students++;
    if (p.priority_tier === 'high' || p.priority_tier === 'medium') groups[key].flagged++;
    if (p.low_access) groups[key].low_access++;
  }
  return Object.values(groups).map((g) => ({ ...g, flag_rate: g.students ? Math.round((g.flagged / g.students) * 100) : 0 }));
}

// Product KPIs (§18) — a representative subset computable from MVP data.
export function kpis({ districtId } = {}) {
  const pool = talentPool({ districtId });
  const eligible = pool.length;
  const screened = pool.filter((p) => p.has_profile).length;

  const validityRows = db.prepare(`SELECT validity, COUNT(*) c FROM measurement GROUP BY validity`).all();
  const totalM = validityRows.reduce((s, r) => s + r.c, 0);
  const validM = validityRows.find((r) => r.validity === 'valid')?.c ?? 0;

  const flagged = pool.filter((p) => p.priority_tier === 'high' || p.priority_tier === 'medium').length;
  const referred = pool.filter((p) => p.referral_status).length;

  const multiCycle = db.prepare(
    `SELECT COUNT(*) c FROM (SELECT student_id FROM measurement GROUP BY student_id HAVING COUNT(DISTINCT session_id) >= 2)`
  ).get().c;

  return [
    { kpi: 'Screening coverage', value: pct(screened, eligible), detail: `${screened}/${eligible} students with valid baseline` },
    { kpi: 'Assessment validity rate', value: pct(validM, totalM), detail: `${validM}/${totalM} measurements valid` },
    { kpi: 'Potential discovery rate', value: pct(flagged, screened), detail: `${flagged}/${screened} flagged beyond known athletes` },
    { kpi: 'Specialist referral rate', value: pct(referred, screened), detail: `${referred}/${screened} referred` },
    { kpi: 'Trajectory capture', value: pct(multiCycle, screened), detail: `${multiCycle} students with >=2 cycles` },
  ];
}

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
