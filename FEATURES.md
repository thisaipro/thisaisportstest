# Feature Map — Thisai Sports Intelligence (Epic 3 MVP)

Every capability shipped in the Tamil Nadu School Sports Talent Intelligence
MVP, grouped by module and mapped to its PRD section. **Decision support for
exploration — not a prediction of elite success. No public child rankings. No
medical or diagnostic claims.**

**At a glance:** 34 features · 8 modules · 9 user roles · 14 sport profiles · 12 assessment tests.

Legend: ✅ Built in MVP · ◐ Foundation laid (fuller version on the roadmap).

---

## 01 · Roster, Consent & Access — PRD §5, §7.1, §17
- ✅ **Organisation hierarchy** — State → District → School → Class → Student, with school type (government/aided/private) and setting (urban/semi-urban/rural).
- ✅ **Student Sports Passport** — persistent longitudinal record; history is never overwritten.
- ✅ **Guardian consent** — grant/withdraw; assessment & recommendations gated on consent.
- ✅ **Role-based access** — nine roles with district/school scoping and a role switcher.

## 02 · Assessment & Measurement — PRD §7.2, §7.3, §7.4
- ✅ **Configurable test battery** — 12 tests across 8 domains, with units, valid ranges and age bands.
- ✅ **Assessment sessions** — schedule a cohort and screen a whole class efficiently.
- ✅ **Guided data entry** — full-page form with per-test attempt inputs and live range checks.
- ✅ **Measurement validation** — reject impossible values, flag implausible ones, compute best/mean.
- ✅ **Assessment validity score** — Valid / Needs-Review / Invalid status per session.

## 03 · Intelligence Engine — PRD §7.5, §7.6, §9
- ✅ **Capability profile** — 8 age/sex-normalised domain scores, shown on a radar.
- ✅ **Versioned sport profiles** — 14 sports with expert-weighted domain requirements.
- ✅ **Rules + weighted engine** — transparent and deterministic; no black-box ML in the MVP.
- ✅ **Exploration set** — ranked 3–5 sports with reason codes and a suggested next action.
- ✅ **Confidence & evidence flags** — confidence bands plus explicit missing-evidence markers.
- ✅ **Interpretable component scores** — separate signals shown instead of one opaque talent score.

## 04 · Opportunity & Longitudinal — PRD §7.7, §7.8
- ✅ **Opportunity & exposure index** — low access *raises* follow-up priority, never lowers the score (equity).
- ✅ **Longitudinal trajectory** — improving / plateau / regression / rapid-improver detection.
- ✅ **Non-destructive reassessment** — re-run any time; previous records and profiles are kept.

## 05 · Specialist, Referral & Pathways — PRD §7.9, §7.10
- ✅ **Specialist observations** — sport-specific rubric, recommendation, confidence and notes.
- ✅ **Talent pool** — ranked by referral priority across school / district / state.
- ✅ **Referral & pathway routing** — route to district camp, SDAT, SAI, academy or federation.
- ✅ **Progression tracking** — potential signal → shortlisted → confirmed pathway.

## 06 · Dashboards & Reports — PRD §8, §10
- ✅ **PE Teacher dashboard** — coverage, flagged students and the retest queue.
- ✅ **District intelligence** — coverage heatmap, equity and the talent funnel.
- ✅ **State dashboard** — district comparison and system-wide KPIs.
- ✅ **Coach & Parent/Student views** — referred-athlete tracking and a plain-language report.
- ✅ **AI narrative report** — deterministic, source-citing, no medical claims.

## 07 · Governance & Analytics — PRD §8, §18, §20
- ✅ **Audit trail** — every high-impact action logged: who, what, when.
- ✅ **Model-run provenance** — each recommendation stores model/protocol version + input snapshot.
- ✅ **Pilot funnel & KPIs** — screened → flagged → exposed → assessed → referred → progressed.
- ✅ **Bias & equity monitoring** — flag-rate comparison by school type and access context.

## 08 · Platform & Delivery — PRD §14, §15, §19
- ✅ **Zero-dependency stack** — Node built-in HTTP + `node:sqlite`; no external packages.
- ✅ **Hash-routed SPA** — dedicated pages and shareable deep links.
- ✅ **Brand light-theme UI** — Thisai identity, inline-SVG radar chart, no build step.
- ✅ **Auto-seeded demo data** — 3 districts, 6 schools, 60 students, 2 cycles on first run.
- ◐ **Offline-safe data model** — append-only, idempotent writes as the foundation for offline sync.

---

## Deliberately out of the MVP — on the roadmap

The first release is scientifically conservative by design (PRD §16, §21).
These arrive only once validated longitudinal outcome data exists:

- ML predictive talent model
- Wearable / device integration
- Video-assisted movement analysis
- Clinical / medical modules
- Automated final selection for state/national teams
- **Public leaderboards — never** (safety/ethics, §19)
