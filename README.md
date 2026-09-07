# Thisai Sports Intelligence — Epic 3 MVP

A running MVP of the **Tamil Nadu School Sports Talent Intelligence Platform**
described in the Epic 3 PRD. It turns school-level physical/movement assessments,
sport exposure and observations into a continuously updated **Student Sports
Passport**, recommends sports to *explore*, surfaces students who warrant
specialist assessment, tracks development longitudinally, and builds a
district/state talent pool.

> **Product stance (PRD §23):** this is a *Sports Intelligence & Opportunity*
> platform, **not** an AI talent-prediction product. It optimises for better
> **opportunity allocation under uncertainty** — decision support, never
> irreversible automated selection. No public child rankings. No medical claims.

## Run it

Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite`). **Zero external
npm dependencies** — nothing to install.

```bash
npm run dev      # ONE command: auto-seeds on first run, then serves with live-reload
```

…then open **http://localhost:3000**. That's the fastest path — no separate seed step.

## Deploying to Vercel

The repo includes a `vercel.json` that builds `src/server.js` as a single
serverless function (`@vercel/node`), bundles `public/**`, and routes all
requests to it. On a serverless host the deployment bundle is **read-only**, so
`src/db.js` puts the SQLite file in the OS temp dir (`/tmp`) when `VERCEL` is
set, and the server auto-seeds it on cold start.

> **Persistence caveat:** `/tmp` is per-instance and ephemeral, so on Vercel the
> demo data resets whenever a new instance cold-starts, and writes (new
> referrals, measurements) don't persist across instances. That's fine for a
> demo. For durable multi-user data, point `THISAI_DB` at a persistent volume
> (a container host like Render/Railway/Fly), or swap the storage layer in
> `src/db.js` for a hosted database (e.g. Turso/libSQL, Postgres). A stateful
> single-process server like this one is generally happier on a persistent host
> than on serverless.

Prefer explicit steps (or a production-style start)?

```bash
npm run seed     # create + populate the demo database (3 districts, 6 schools, 60 students, 2 cycles)
npm start        # serve on http://localhost:3000 (also auto-seeds if the DB is empty)
npm run smoke    # run the offline intelligence-pipeline tests (21 assertions)
```

`npm run reset` wipes and re-seeds from scratch. Set `PORT` to change the port
(e.g. `PORT=8080 npm run dev`). The `data/` SQLite DB is git-ignored, so it's
generated locally on first run.

Open http://localhost:3000 and use the **"Acting as"** switcher (top-right) to
move between roles — each lands on its own dashboard:

| Role | Dashboard |
|---|---|
| PE Teacher / School Admin | class coverage, assessment sessions, retest queue, roster → data entry |
| District Specialist | talent funnel, coverage heatmap, equity, ranked talent pool, observations & referrals |
| State Admin | KPIs, district comparison, system equity |
| Coach | referred athletes + sport-specific observations |
| Sports Scientist / Platform Admin | audit trail, model-run provenance, versioned sport-profile weights |
| Parent / Student | plain-language report, sports passport, recommended exploration |

Deep-links are shareable: `/?user=U-SPEC-D-CHN&passport=STU-012`.

## What the platform does (end-to-end flow, PRD §11)

1. **Roster & consent** — students carry a `consent_status`; assessment/data
   entry is gated on granted consent (minor-safe governance, §17).
2. **Assessment session** — a PE teacher screens a whole cohort (US-01). Each
   test defines unit, valid ranges, attempts and best/mean rule.
3. **Measurement validation (§7.4)** — impossible values are **rejected**,
   implausible ones **flagged** (kept, down-weighted). Every session gets a
   Valid / Needs-Review / Invalid status (US-02).
4. **Capability profile (§9)** — validated measurements are **age/sex-normalised**
   into 8 interpretable domain scores. No single opaque "talent score".
5. **Sport exploration recommendations (§7.6)** — a transparent **rules + weighted**
   engine ranks **3–5 sports to explore**, each with **reason codes**,
   **confidence band**, **missing-evidence flags** and a **next action**.
6. **Opportunity context (§7.7)** — low exposure/coaching **never lowers** a
   student's capability; it lowers confidence and **raises follow-up priority**
   (equity, §2).
7. **Longitudinal trajectory (§7.8)** — across cycles, per-domain change is
   classified (improving / plateau / regression / rapid), surfacing
   previously-low-signal students who are developing fast.
8. **Specialist review & referral (§7.9, §7.10)** — specialists add structured
   observations and route students to pathways; potential-signal ≠
   proven-performance ≠ confirmed-pathway. Never a public ranking.
9. **Narrative report (§8)** — deterministic, template-based, **cites source
   data**, disclaims prediction and medical/diagnostic claims.
10. **Provenance & audit (§18, §20)** — every recommendation stores its
    model/protocol version and an input snapshot; edits, overrides and
    high-impact recommendations are audit-logged.

## Architecture

```
src/
  server.js            HTTP server + JSON API + static SPA host (node:http)
  db.js                node:sqlite schema (PRD §13 data model) + audit helper
  service.js           workflow operations: record → validate → profile → recommend → refer
  analytics.js         teacher / district / state dashboards, pilot funnel, KPIs (§10, §18)
  config/
    battery.js         assessment battery: tests, domains, ranges, age bands (§7.2/§7.3)
    sports.js          versioned sport profiles: domain weights, evidence level (§7.5)
  engine/
    norms.js           age/sex normalisation (SYNTHETIC placeholder norms — see below)
    validate.js        measurement quality & validation (§7.4)
    capability.js      capability profile builder (§9)
    recommend.js       exploration recommendation + opportunity index + scoring (§7.6/§7.7/§9)
    trajectory.js      longitudinal change detection (§7.8)
    narrative.js       plain-language report (§8)
public/                vanilla-JS SPA (index.html, app.js, styles.css) — inline-SVG radar, no build
scripts/smoke.js       offline pipeline tests
```

### Scoring architecture (PRD §9)

Interpretable component signals are shown instead of one opaque score:
Assessment Validity · Capability Profile · Sport Fit Signal · Development
Trajectory · Evidence Completeness · Opportunity Context · Referral Priority.
A composite (Referral Priority) is used only for operational prioritisation and
always shown alongside its components and reasons.

## Important limitations (deliberate, per PRD)

- **The norms in `engine/norms.js` are SYNTHETIC PLACEHOLDERS** so the pipeline
  is exercisable end-to-end. They are deterministic and auditable but are **not
  a validated reference population**. They must be replaced by an
  expert-approved normative dataset (Khelo India / state sports science) before
  any real pilot decision (§8, §19, §25). The normalisation *method* is stable;
  only the `(mean, sd)` tables change.
- **No ML.** The MVP is intentionally rules-first and deterministic; ML ranking
  is out of scope until validated longitudinal outcomes and an expert-approved
  label strategy exist (§8, §16, §21).
- Out of MVP scope (§16): automated final selection, medical/clinical modules,
  injury/psychological scoring, wearables/video AI, public leaderboards.
- **Auth is a lightweight role switcher** (`x-thisai-user` header) for the demo;
  RBAC scoping is enforced in the API, but production SSO/identity is a
  hardening item. Offline capture/sync (§7.19) is modelled by append-only,
  idempotent measurement writes but a full offline client is future work.

## Key API endpoints

```
GET  /api/config                         battery, sports, domains, versions
GET  /api/talent-pool?districtId=&tier=  ranked pool with priority + opportunity
GET  /api/students/:id/passport          full Student Sports Passport
POST /api/sessions                       create an assessment session
POST /api/measurements                   record + validate a batch of results
POST /api/students/:id/generate          (re)build capability profile + recommendation
POST /api/students/:id/consent           record/withdraw guardian consent
POST /api/observations  /api/referrals   specialist review + pathway routing
GET  /api/dashboard/{teacher|district|state}   role dashboards
GET  /api/kpis  /api/funnel  /api/audit  /api/model-runs   analytics & governance
```

## Acceptance criteria coverage (PRD §20)

All 14 acceptance criteria are demonstrable in the running app — class
assessment sessions, invalid-measurement rejection, per-student passports,
capability profiles with confidence/evidence, 3–5 explained recommendations
from versioned profiles, actionable next steps, specialist observations,
model/protocol provenance, non-destructive reassessment, and the
screened → flagged → exposed → assessed → referred → progressed pilot funnel.
`npm run smoke` asserts the core engine guarantees automatically.
