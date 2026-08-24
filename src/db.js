// Persistence layer — Node built-in node:sqlite (no external dependencies).
// Schema follows the Epic 3 Core Data Model (§13). Design rules baked in:
//  - Measurements are append-only; new assessments create new records (§7.1).
//  - Every recommendation records model/protocol version + input snapshot (§8, §20).
//  - Full audit trail for edits, overrides and high-impact recommendations (§18).
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = process.env.THISAI_DB || join(DATA_DIR, 'thisai.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS district (
    district_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'Tamil Nadu'
  );

  CREATE TABLE IF NOT EXISTS school (
    school_id TEXT PRIMARY KEY,
    district_id TEXT NOT NULL REFERENCES district(district_id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,            -- government | aided | private
    setting TEXT NOT NULL,         -- urban | semi-urban | rural
    low_access INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS app_user (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT NOT NULL,            -- pe_teacher | school_admin | coach | district_specialist | state_admin | parent | student | platform_admin
    district_id TEXT REFERENCES district(district_id),
    school_id TEXT REFERENCES school(school_id)
  );

  CREATE TABLE IF NOT EXISTS student (
    student_id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES school(school_id),
    name TEXT NOT NULL,
    cohort TEXT,                   -- e.g. "Class 8-A"
    sex TEXT,                      -- M | F | O
    birth_year INTEGER,
    category TEXT,                 -- optional social/administrative category
    consent_status TEXT NOT NULL DEFAULT 'pending', -- pending | granted | withdrawn
    guardian_name TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS consent (
    consent_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES student(student_id),
    guardian TEXT,
    scope TEXT NOT NULL DEFAULT 'assessment_and_recommendation',
    status TEXT NOT NULL,          -- granted | withdrawn
    at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assessment_session (
    session_id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES school(school_id),
    cohort TEXT,
    assessor_id TEXT REFERENCES app_user(user_id),
    protocol_version TEXT NOT NULL,
    cycle TEXT,                    -- e.g. "2026-baseline"
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', -- open | closed
    reason_code TEXT               -- for retest sessions
  );

  -- Append-only. A student may appear in many sessions (longitudinal, §7.1/§7.8).
  CREATE TABLE IF NOT EXISTS measurement (
    measurement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES assessment_session(session_id),
    student_id TEXT NOT NULL REFERENCES student(student_id),
    test_id TEXT NOT NULL,
    value REAL,                    -- canonical best/mean result
    unit TEXT,
    attempts TEXT,                 -- JSON array of raw attempts
    validity TEXT NOT NULL,        -- valid | needs_review | invalid
    flags TEXT,                    -- JSON array of validation flags
    assessor_id TEXT,
    device_id TEXT,
    timestamp TEXT NOT NULL,
    is_retest INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS exposure (
    exposure_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES student(student_id),
    sport_id TEXT,
    sport_label TEXT,
    play_level TEXT,               -- never | recreational | school_team | club | academy
    competition_level TEXT,        -- none | school | block | district | state | national
    coaching_access TEXT,          -- none | pe_teacher | community_coach | specialist_coach
    facility_access TEXT,          -- school | public | club | academy
    interest TEXT,                 -- interested | neutral | not_interested
    duration_months INTEGER,
    frequency_per_week INTEGER,
    at TEXT NOT NULL
  );

  -- Cached capability profile per session (interpretable component scores, §9).
  CREATE TABLE IF NOT EXISTS movement_profile (
    profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES student(student_id),
    session_id TEXT REFERENCES assessment_session(session_id),
    domain_scores TEXT NOT NULL,   -- JSON {domain: 0-100}
    domain_confidence TEXT,        -- JSON {domain: 0-1}
    validity_score REAL,
    evidence_completeness REAL,
    version TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recommendation (
    recommendation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES student(student_id),
    session_id TEXT REFERENCES assessment_session(session_id),
    payload TEXT NOT NULL,         -- JSON: ranked sports, signals, reasons, missing evidence, scores
    model_version TEXT NOT NULL,
    protocol_version TEXT NOT NULL,
    input_snapshot TEXT,           -- JSON snapshot of inputs used (§8, §20)
    created_at TEXT NOT NULL,
    superseded INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS observation (
    observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES student(student_id),
    observer_id TEXT REFERENCES app_user(user_id),
    sport_id TEXT,
    rubric TEXT,                   -- JSON structured rubric scores
    recommendation TEXT,           -- continue | explore | specialist_review | pathway_consideration
    notes TEXT,
    confidence TEXT,               -- low | medium | high
    evidence_ref TEXT,
    reassessment_date TEXT,
    at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS referral (
    referral_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES student(student_id),
    source_level TEXT NOT NULL,    -- school | block | district | state
    destination TEXT NOT NULL,     -- district_camp | sdat | sai | academy | federation | school_team
    status TEXT NOT NULL,          -- potential_signal | proven_performance | confirmed_pathway | shortlisted | accepted | declined
    priority REAL,
    reason TEXT,
    created_by TEXT REFERENCES app_user(user_id),
    date TEXT NOT NULL,
    outcome TEXT
  );

  CREATE TABLE IF NOT EXISTS progression_event (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES student(student_id),
    event_type TEXT NOT NULL,      -- exposure_session | camp_attended | assessment | pathway_entry | competition
    date TEXT NOT NULL,
    level TEXT,
    result TEXT
  );

  CREATE TABLE IF NOT EXISTS model_run (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT,
    model_version TEXT NOT NULL,
    input_snapshot TEXT,
    output TEXT,
    reviewer TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sport_profile_version (
    version_id INTEGER PRIMARY KEY AUTOINCREMENT,
    requirement_version TEXT NOT NULL,
    approver TEXT,
    rationale TEXT,
    effective_date TEXT NOT NULL,
    snapshot TEXT NOT NULL          -- JSON of the sport profiles at this version
  );

  CREATE TABLE IF NOT EXISTS audit_event (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT,
    role TEXT,
    action TEXT NOT NULL,
    object_type TEXT,
    object_id TEXT,
    before_ref TEXT,
    after_ref TEXT,
    timestamp TEXT NOT NULL
  );
  `);
}

export function auditLog({ actor, role, action, objectType, objectId, before, after }) {
  db.prepare(
    `INSERT INTO audit_event (actor, role, action, object_type, object_id, before_ref, after_ref, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    actor ?? null,
    role ?? null,
    action,
    objectType ?? null,
    objectId != null ? String(objectId) : null,
    before != null ? JSON.stringify(before) : null,
    after != null ? JSON.stringify(after) : null,
    new Date().toISOString()
  );
}

export function nowISO() {
  return new Date().toISOString();
}
