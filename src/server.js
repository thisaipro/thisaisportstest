// Thisai Sports Intelligence — HTTP server & API (zero external dependencies).
// Uses Node built-in http + node:sqlite. Serves the SPA from /public and a
// JSON API under /api. Lightweight role context via the x-thisai-user header
// (MVP: real auth/SSO is a hardening item, but RBAC scoping is enforced here).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { db, initSchema } from './db.js';
import { DOMAINS, TESTS, SCORING_TESTS, BATTERY_VERSION } from './config/battery.js';
import { SPORTS, SPORT_PROFILE_VERSION } from './config/sports.js';
import { MODEL_VERSION } from './engine/recommend.js';
import { NORMS_VERSION } from './engine/norms.js';
import {
  getPassport, generateIntelligence, recordMeasurements, talentPool,
  addObservation, createReferral, updateReferral, recordConsent, httpError,
} from './service.js';
import { teacherDashboard, districtDashboard, stateDashboard, kpis, pilotFunnel } from './analytics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

initSchema();

// First-run convenience: if the database has no students yet, seed the demo
// data automatically so `npm run dev` / `npm start` work without a prior step.
try {
  const n = db.prepare(`SELECT COUNT(*) c FROM student`).get().c;
  if (n === 0) {
    console.log('  Empty database — seeding demo data (first run)…');
    const { seed } = await import('./seed.js');
    seed();
  }
} catch (e) { console.error('  Auto-seed skipped:', e.message); }

// --- helpers ---------------------------------------------------------------
function json(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) reject(httpError(413, 'body too large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(httpError(400, 'invalid JSON')); } });
    req.on('error', reject);
  });
}
function ctxFrom(req) {
  const userId = req.headers['x-thisai-user'] || null;
  let user = null;
  if (userId) user = db.prepare(`SELECT * FROM app_user WHERE user_id = ?`).get(userId);
  return { userId, user, actor: user?.name || userId, role: user?.role || 'anonymous' };
}
// RBAC scope guard (§17). Returns true if role may access a district/school.
function scopeOk(user, { districtId, schoolId } = {}) {
  if (!user) return true; // MVP demo tolerance; deny only when user set + mismatch
  if (['state_admin', 'platform_admin', 'sports_scientist'].includes(user.role)) return true;
  if (user.role === 'district_specialist') return !districtId || user.district_id === districtId;
  if (['pe_teacher', 'school_admin', 'coach'].includes(user.role)) return !schoolId || user.school_id === schoolId;
  return true;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'forbidden' });
  try {
    const st = await stat(filePath);
    if (st.isDirectory()) throw new Error('dir');
    const buf = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    // SPA fallback
    try { const buf = await readFile(join(PUBLIC_DIR, 'index.html')); res.writeHead(200, { 'content-type': 'text/html' }); res.end(buf); }
    catch { json(res, 404, { error: 'not found' }); }
  }
}

// --- API routing -----------------------------------------------------------
async function api(req, res, url) {
  const ctx = ctxFrom(req);
  const p = url.pathname;
  const q = url.searchParams;
  const seg = p.split('/').filter(Boolean); // e.g. ['api','students',':id','passport']

  // GET routes
  if (req.method === 'GET') {
    if (p === '/api/health') return json(res, 200, { ok: true, time: new Date().toISOString() });
    if (p === '/api/config') return json(res, 200, {
      domains: DOMAINS,
      tests: TESTS,
      scoring_tests: SCORING_TESTS.map((t) => t.id),
      sports: SPORTS.map((s) => ({ id: s.id, sport: s.sport, discipline: s.discipline, evidence_level: s.evidence_level, dev_stage: s.dev_stage, weights: s.weights })),
      versions: { battery: BATTERY_VERSION, sport_profiles: SPORT_PROFILE_VERSION, model: MODEL_VERSION, norms: NORMS_VERSION },
    });
    if (p === '/api/users') return json(res, 200, db.prepare(`SELECT user_id, name, email, role, district_id, school_id FROM app_user ORDER BY role`).all());
    if (p === '/api/me') return json(res, 200, ctx.user || null);
    if (p === '/api/districts') return json(res, 200, db.prepare(`SELECT * FROM district`).all());
    if (p === '/api/schools') {
      const districtId = q.get('districtId');
      const rows = districtId
        ? db.prepare(`SELECT * FROM school WHERE district_id = ?`).all(districtId)
        : db.prepare(`SELECT * FROM school`).all();
      return json(res, 200, rows);
    }
    if (p === '/api/students') {
      const schoolId = q.get('schoolId'); const districtId = q.get('districtId');
      let sql = `SELECT s.*, sc.name AS school_name FROM student s JOIN school sc ON sc.school_id = s.school_id`;
      const w = []; const par = [];
      if (schoolId) { w.push('s.school_id = ?'); par.push(schoolId); }
      if (districtId) { w.push('sc.district_id = ?'); par.push(districtId); }
      if (w.length) sql += ' WHERE ' + w.join(' AND ');
      return json(res, 200, db.prepare(sql).all(...par));
    }
    if (seg[0] === 'api' && seg[1] === 'students' && seg[3] === 'passport') return json(res, 200, getPassport(decodeURIComponent(seg[2])));
    if (p === '/api/sessions') {
      const schoolId = q.get('schoolId');
      const rows = schoolId ? db.prepare(`SELECT * FROM assessment_session WHERE school_id = ? ORDER BY date DESC`).all(schoolId)
        : db.prepare(`SELECT * FROM assessment_session ORDER BY date DESC`).all();
      return json(res, 200, rows);
    }
    if (seg[0] === 'api' && seg[1] === 'sessions' && seg[3] === 'roster') {
      const s = db.prepare(`SELECT * FROM assessment_session WHERE session_id = ?`).get(seg[2]);
      if (!s) throw httpError(404, 'session not found');
      const students = db.prepare(`SELECT student_id, name, cohort, consent_status FROM student WHERE school_id = ? AND (? IS NULL OR cohort = ?) ORDER BY name`).all(s.school_id, s.cohort ?? null, s.cohort ?? null);
      const done = db.prepare(`SELECT student_id, COUNT(*) c FROM measurement WHERE session_id = ? GROUP BY student_id`).all(seg[2]);
      const doneMap = Object.fromEntries(done.map((d) => [d.student_id, d.c]));
      return json(res, 200, { session: s, students: students.map((st) => ({ ...st, measurements: doneMap[st.student_id] || 0 })) });
    }
    if (p === '/api/talent-pool') {
      const districtId = q.get('districtId') || undefined; const schoolId = q.get('schoolId') || undefined; const tier = q.get('tier') || undefined;
      if (!scopeOk(ctx.user, { districtId, schoolId })) return json(res, 403, { error: 'out of scope' });
      return json(res, 200, talentPool({ districtId, schoolId, tier }));
    }
    if (p === '/api/dashboard/teacher') return json(res, 200, teacherDashboard(q.get('schoolId')));
    if (p === '/api/dashboard/district') return json(res, 200, districtDashboard(q.get('districtId')));
    if (p === '/api/dashboard/state') return json(res, 200, stateDashboard());
    if (p === '/api/kpis') return json(res, 200, kpis({ districtId: q.get('districtId') || undefined }));
    if (p === '/api/funnel') return json(res, 200, pilotFunnel({ districtId: q.get('districtId') || undefined }));
    if (p === '/api/audit') return json(res, 200, db.prepare(`SELECT * FROM audit_event ORDER BY audit_id DESC LIMIT ?`).all(Number(q.get('limit') || 50)));
    if (p === '/api/model-runs') return json(res, 200, db.prepare(`SELECT run_id, student_id, model_version, timestamp FROM model_run ORDER BY run_id DESC LIMIT ?`).all(Number(q.get('limit') || 50)));
    return json(res, 404, { error: 'unknown endpoint' });
  }

  // POST/PATCH routes
  const body = await readBody(req);

  if (req.method === 'POST') {
    if (p === '/api/sessions') {
      const id = body.session_id || 'S-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      db.prepare(`INSERT INTO assessment_session (session_id, school_id, cohort, assessor_id, protocol_version, cycle, date, status, reason_code) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`)
        .run(id, body.school_id, body.cohort ?? null, ctx.userId ?? body.assessor_id ?? null, BATTERY_VERSION, body.cycle ?? null, body.date ?? new Date().toISOString().slice(0, 10), body.reason_code ?? null);
      return json(res, 201, { session_id: id });
    }
    if (seg[1] === 'sessions' && seg[3] === 'close') {
      db.prepare(`UPDATE assessment_session SET status = 'closed' WHERE session_id = ?`).run(seg[2]);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/measurements') {
      // body: { sessionId, studentId, results:[{test_id, attempts|value}], isRetest }
      const out = recordMeasurements(body, ctx);
      return json(res, 201, { recorded: out });
    }
    if (seg[1] === 'students' && seg[3] === 'exposure') {
      const e = body;
      db.prepare(`INSERT INTO exposure (student_id, sport_id, sport_label, play_level, competition_level, coaching_access, facility_access, interest, duration_months, frequency_per_week, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(seg[2], e.sport_id ?? null, e.sport_label ?? null, e.play_level ?? null, e.competition_level ?? null, e.coaching_access ?? null, e.facility_access ?? null, e.interest ?? null, e.duration_months ?? null, e.frequency_per_week ?? null, new Date().toISOString());
      return json(res, 201, { ok: true });
    }
    if (seg[1] === 'students' && seg[3] === 'generate') return json(res, 200, generateIntelligence(decodeURIComponent(seg[2]), ctx));
    if (seg[1] === 'students' && seg[3] === 'consent') return json(res, 200, recordConsent(decodeURIComponent(seg[2]), body, ctx));
    if (seg[1] === 'students' && seg[3] === 'progression') {
      db.prepare(`INSERT INTO progression_event (student_id, event_type, date, level, result) VALUES (?, ?, ?, ?, ?)`)
        .run(seg[2], body.event_type, body.date ?? new Date().toISOString(), body.level ?? null, body.result ?? null);
      return json(res, 201, { ok: true });
    }
    if (p === '/api/observations') return json(res, 201, addObservation(body, ctx));
    if (p === '/api/referrals') return json(res, 201, createReferral(body, ctx));
    return json(res, 404, { error: 'unknown endpoint' });
  }

  if (req.method === 'PATCH') {
    if (seg[1] === 'referrals') return json(res, 200, updateReferral(seg[2], body, ctx));
    return json(res, 404, { error: 'unknown endpoint' });
  }

  return json(res, 405, { error: 'method not allowed' });
}

// Single request handler. Exported as the default so serverless platforms
// (Vercel's @vercel/node) can invoke it directly; also wrapped in an http
// server for local `npm start` / `npm run dev`.
export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    json(res, status, { error: err.message || 'server error' });
  }
}

// Only bind a port when running as a normal process (local dev / a container).
// On Vercel the module is imported and `handler` is called per request, so we
// must NOT listen there.
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  http.createServer(handler).listen(PORT, () => {
    console.log(`\n  Thisai Sports Intelligence (Epic 3 MVP)`);
    console.log(`  → http://localhost:${PORT}\n`);
  });
}
