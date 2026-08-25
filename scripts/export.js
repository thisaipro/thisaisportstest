// Ad-hoc backend data export. Dumps sample rows to the console and writes a
// full JSON + per-table CSV export under ./exports. Run:
//   node --experimental-sqlite scripts/export.js
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const db = new DatabaseSync(join(root, 'data', 'thisai.db'));
const outDir = join(root, 'exports');
mkdirSync(outDir, { recursive: true });

const TABLES = ['district', 'school', 'app_user', 'student', 'consent', 'assessment_session',
  'measurement', 'exposure', 'movement_profile', 'recommendation', 'observation', 'referral',
  'progression_event', 'model_run', 'sport_profile_version', 'audit_event'];

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

const full = {};
for (const t of TABLES) {
  const rows = db.prepare(`SELECT * FROM ${t}`).all();
  full[t] = rows;
  writeFileSync(join(outDir, t + '.csv'), toCSV(rows));
}
writeFileSync(join(outDir, 'thisai-data.json'), JSON.stringify(full, null, 2));

// Console samples
const p = (t, sql, ...a) => { console.log('\n=== ' + t + ' ==='); console.table(db.prepare(sql).all(...a)); };
p('measurements — STU-012 (all tests)', `SELECT test_id, value, unit, validity, flags FROM measurement WHERE student_id = ? ORDER BY test_id`, 'STU-012');
p('exposure — sample', `SELECT student_id, play_level, competition_level, coaching_access, facility_access, interest FROM exposure LIMIT 5`);
p('referrals', `SELECT student_id, source_level, destination, status, ROUND(priority) AS priority FROM referral`);
p('observations', `SELECT student_id, sport_id, recommendation, confidence, notes FROM observation LIMIT 5`);

// One recommendation payload, condensed
const reco = JSON.parse(db.prepare(`SELECT payload FROM recommendation WHERE student_id = ? AND superseded = 0`).get('STU-012').payload);
console.log('\n=== recommendation payload — STU-012 (condensed) ===');
console.log(JSON.stringify({
  model_version: reco.model_version,
  scores: reco.scores,
  priority_tier: reco.priority_tier,
  opportunity: reco.opportunity,
  exploration_set: reco.exploration_set.map((r) => ({ sport: r.sport, discipline: r.discipline, fit_signal: r.fit_signal, confidence_band: r.confidence_band, reasons: r.reasons, next_action: r.next_action })),
}, null, 2));

console.log('\nWrote full export to ./exports/ (thisai-data.json + one CSV per table)');
